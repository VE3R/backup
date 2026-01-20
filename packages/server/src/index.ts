import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { nanoid } from "nanoid";

import { UltimateDeck } from "@sociables/shared";
import type { Card, RoomState, Player, RoomLogItem, RoomSettings } from "@sociables/shared";

type PendingAck = {
  ackId: string;
  createdAt: number;
  cardId: string;
  cardTitle: string;
  instruction: string;
  createdByPlayerId: string;
  assignedToPlayerId: string;
  status: "pending" | "confirmed";
  confirmedAt?: number;

  // NEW: structured info so the client can generate messages without huge per-card tables
  meta?: {
    kind: string;
    numberValue?: number;
    ruleText?: string;
    targets?: string[];
  };
};

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN || "*" }));
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN || "*" } });

// ====================
// REQUEST DEDUPLICATION SYSTEM
// ====================
const pendingRequests = new Map<string, number>(); // key = "socketId:action", value = timestamp

function canProcessRequest(socketId: string, action: string, cooldownMs: number = 1000): boolean {
  const key = `${socketId}:${action}`;
  const now = Date.now();
  const lastRequest = pendingRequests.get(key);
  
  // If request was made within cooldown period, reject it
  if (lastRequest && (now - lastRequest) < cooldownMs) {
    return false;
  }
  
  // Store this request and schedule cleanup
  pendingRequests.set(key, now);
  setTimeout(() => {
    pendingRequests.delete(key);
  }, cooldownMs + 100); // +100ms buffer
  
  return true;
}

// ====================
// ROOM CLEANUP SYSTEM
// ====================
const roomCleanupTimeouts = new Map<string, NodeJS.Timeout>();
const ROOM_INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function updateRoomActivity(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Update last activity timestamp
  room.lastActivity = Date.now();
  
  // Reset the cleanup timeout
  scheduleRoomCleanup(roomCode);
}

function scheduleRoomCleanup(roomCode: string): void {
  // Clear existing timeout if any
  const existingTimeout = roomCleanupTimeouts.get(roomCode);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Schedule new cleanup
  const timeout = setTimeout(() => {
    cleanupInactiveRoom(roomCode);
  }, ROOM_INACTIVE_TIMEOUT);
  
  roomCleanupTimeouts.set(roomCode, timeout);
}

function cleanupInactiveRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const now = Date.now();
  const lastActivity = room.lastActivity || room.createdAt || now;
  
  // Check if room is actually inactive
  if (now - lastActivity >= ROOM_INACTIVE_TIMEOUT) {
    console.log(`[CLEANUP] Removing inactive room: ${roomCode}`);
    
    // Notify all players
    io.to(roomCode).emit('room:closed', 'Room closed due to inactivity');
    
    // Clean up
    rooms.delete(roomCode);
    roomCleanupTimeouts.delete(roomCode);
    
    // Clean up any pending confirmations
    room.pendingAcks = [];
  } else {
    // Room became active again, reschedule
    scheduleRoomCleanup(roomCode);
  }
}

// ====================
// SOCKET-PLAYER TRACKING
// ====================
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

// NOTE: We keep awaitingAcksForCardId in the state for compatibility,
// but we no longer use it to BLOCK gameplay. Pending confirmations are non-blocking.
const rooms = new Map<
  string,
  RoomState & {
    pendingAcks: PendingAck[];
    awaitingAcksForCardId: string | null;
    settings: RoomSettings;
    drinkStats: Record<string, { given: number; taken: number }>;
    spectators: Player[];
    _afkNudged?: { turnKey: string; ts: number };
  }
>();

const byId = new Map<string, Card>(UltimateDeck.map((c) => [c.id, c]));

function playerName(room: any, pid: string) {
  return (
    room.players.find((p: any) => p.playerId === pid)?.name ??
    room.spectators?.find((p: any) => p.playerId === pid)?.name ??
    "Player"
  );
}

function pushLog(room: any, item: Omit<RoomLogItem, "ts">) {
  const entry: RoomLogItem = { ts: Date.now(), ...item };
  room.log.push(entry);
  if (room.log.length > 200) room.log.splice(0, room.log.length - 200);
}

function ensurePlayerStats(room: any, pid: string) {
  if (!room.drinkStats[pid]) room.drinkStats[pid] = { given: 0, taken: 0 };
}

function extractFirstNumber(text: string): number | null {
  const m = text.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function activePlayers(room: any) {
  return (room.players || []).filter((p: any) => (p.mode ?? "player") === "player");
}

function currentTurnPlayer(room: any) {
  return activePlayers(room).find((p: any) => p.seatIndex === room.turnIndex) || null;
}

function assertIsTurnPlayer(room: RoomState, playerId: string) {
  const cur = currentTurnPlayer(room);
  if (!cur) return { ok: false as const, error: "NO_TURN_PLAYER" };
  if (cur.playerId !== playerId) return { ok: false as const, error: "NOT_YOUR_TURN" };
  return { ok: true as const };
}

function nextTurn(room: any) {
  const ap = activePlayers(room);
  if (!ap.length) {
    room.turnIndex = 0;
    return "";
  }
  room.turnIndex = (room.turnIndex + 1) % ap.length;
  return currentTurnPlayer(room)?.playerId ?? ap[0]?.playerId ?? "";
}

function isHost(room: any, playerId: string) {
  // Host = first active player (seatIndex 0)
  const ap = activePlayers(room);
  return ap.find((p: any) => p.seatIndex === 0)?.playerId === playerId;
}

function sanitizeDeckOrder(order: string[]) {
  const set = new Set(UltimateDeck.map((c) => c.id));
  return order.filter((id) => set.has(id));
}

function pickWeightedNextCard(room: any) {
  // Weighted draw: reduce repetition and balance types.
  const recent = room.discard.slice(-8);
  const recentSet = new Set(recent);
  const counts: Record<string, number> = { forfeit: 0, rule: 0, role: 0, curse: 0, event: 0, joker: 0, setup: 0, endgame: 0 };
  for (const id of recent) {
    const c = byId.get(id);
    if (c) counts[c.type] = (counts[c.type] || 0) + 1;
  }

  const order = (room.settings.customDeckOrder?.length ? room.settings.customDeckOrder : room.deckOrder) as string[];
  const candidates = order.map((id) => byId.get(id)).filter(Boolean) as Card[];

  const safeMode = !!room.settings.safeMode;

  // base weights by type
  const base: Record<string, number> = {
    forfeit: safeMode ? 0.7 : 1.0,
    rule: 1.1,
    role: 1.0,
    curse: 0.9,
    event: 1.0,
    joker: 0.9,
    setup: 0.8,
    endgame: 0.6
  };

  // if too many forfeits recently, bias away
  const forfeitPenalty = counts.forfeit >= 4 ? 0.5 : counts.forfeit >= 3 ? 0.7 : 1.0;

  // Build weighted list
  const weighted: { id: string; w: number }[] = [];
  for (const c of candidates) {
    let w = base[c.type] ?? 1.0;
    if (recentSet.has(c.id)) w *= 0.25;
    if (c.type === "forfeit") w *= forfeitPenalty;
    // prefer variety: if a type already appeared 2+ times in last 8, reduce
    if ((counts[c.type] || 0) >= 2) w *= 0.65;
    weighted.push({ id: c.id, w: Math.max(0.05, w) });
  }

  const sum = weighted.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const it of weighted) {
    r -= it.w;
    if (r <= 0) return it.id;
  }
  return weighted[weighted.length - 1]?.id;
}

function computeTimer(card: Card) {
  if (card.resolution.kind === "createRuleText") {
    return { enabled: false, seconds: 0, reason: "Custom rule entry" };
  }

  const t = (card.title + " " + card.body).toLowerCase();
  const longRoundHints = [
    "go around",
    "truth circle",
    "confessional",
    "vote",
    "category",
    "speed round",
    "draw nonstop",
    "for one round"
  ];
  if (longRoundHints.some((h) => t.includes(h))) {
    return { enabled: false, seconds: 0, reason: "Long round / discussion card" };
  }

  let seconds = 30;
  if (["rule", "role", "curse", "joker"].includes(card.type)) seconds = 45;
  if (card.type === "event") seconds = 60;

  switch (card.resolution.kind) {
    case "chooseTarget":
      seconds += 10;
      break;
    case "chooseNumber":
      seconds += 10;
      break;
    case "chooseTargetAndNumber":
      seconds += 20;
      break;
    case "chooseTwoTargets":
      seconds += 25;
      break;
  }

  seconds = Math.max(20, Math.min(90, seconds));
  return { enabled: true, seconds };
}

function firstNumber(s: string): number | null {
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function applyDrinkStats(room: any, card: Card, drawerId: string, resolution: any) {
  // Heuristic: only track obvious drink actions.
  const txt = (card.title + " " + card.body).toLowerCase();
  const safe = room.settings?.safeMode ? 0.5 : 1;
  const bump = (pid: string, field: "given" | "taken", n: number) => {
    if (!pid) return;
    const cur = room.drinkStats[pid] || { given: 0, taken: 0 };
    cur[field] = (cur[field] || 0) + n;
    room.drinkStats[pid] = cur;
  };

  // Targeted drink gives
  if (txt.includes("drink") && (card.resolution.kind === "chooseTarget" || card.resolution.kind === "chooseTargetAndNumber")) {
    const target = resolution.targetPlayerId;
    const baseN = card.resolution.kind === "chooseTargetAndNumber" ? Number(resolution.numberValue || 0) : firstNumber(txt) || 1;
    const n = Math.max(1, Math.round(baseN * safe));
    bump(drawerId, "given", n);
    bump(target, "taken", n);
    return;
  }

  if (txt.includes("drink") && card.resolution.kind === "chooseTwoTargets") {
    const t1 = resolution.targetPlayerId;
    const t2 = resolution.targetPlayerId2;
    const baseN = firstNumber(txt) || 1;
    const n = Math.max(1, Math.round(baseN * safe));
    bump(drawerId, "given", n * 2);
    bump(t1, "taken", n);
    bump(t2, "taken", n);
    return;
  }

  // Simple "take N" cards (non-targeted)
  if (txt.includes("take") && txt.includes("drink")) {
    const baseN = firstNumber(txt);
    if (baseN) {
      const n = Math.max(1, Math.round(baseN * safe));
      bump(drawerId, "taken", n);
    }
  }
}

// Confirmation needed for "targeted" cards.
// Important: confirmations are now NON-BLOCKING.
function requiresAck(card: Card) {
  return (
    card.resolution.kind === "chooseTarget" ||
    card.resolution.kind === "chooseTwoTargets" ||
    card.resolution.kind === "chooseTargetAndNumber"
  );
}

function createAck(
  room: RoomState,
  card: Card,
  createdBy: string,
  assignedTo: string,
  meta?: PendingAck["meta"]
): PendingAck {
  return {
    ackId: nanoid(),
    createdAt: Date.now(),
    cardId: card.id,
    cardTitle: card.title,
    instruction: card.body,
    createdByPlayerId: createdBy,
    assignedToPlayerId: assignedTo,
    status: "pending",
    meta
  };
}


function applyCard(room: RoomState, card: Card, byPlayerId: string, resolution: any) {
  const title = card.title.toLowerCase();

  // Counterplay cards (prototype)
  if (title.includes("cleanse curse")) {
    const target = resolution.targetPlayerId;
    delete room.activeEffects.cursesByPlayerId[target];
    return `Curse cleared from ${playerName(room, target)}.`;
  }

  if (title.includes("reset roles")) {
    room.activeEffects.rolesByPlayerId = {};
    return "All roles cleared.";
  }

  if (title.includes("transfer curse")) {
    const from = resolution.targetPlayerId;
    const to = resolution.targetPlayerId2;
    const curse = room.activeEffects.cursesByPlayerId[from];
    if (!curse) return `No curse to transfer from ${playerName(room, from)}.`;
    room.activeEffects.cursesByPlayerId[to] = curse;
    delete room.activeEffects.cursesByPlayerId[from];
    return `Curse transferred from ${playerName(room, from)} to ${playerName(room, to)}.`;
  }

  // RULES
  if (card.type === "rule") {
    if (card.resolution.kind === "createRuleText") {
      const text = String(resolution.ruleText || "").trim();
      const id = `rule_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      room.activeEffects.rules.push({ id, text, createdBy: byPlayerId });
      return `New rule added: "${text}"`;
    }

    if (title.includes("end all rules") || title.includes("end rules")) {
      room.activeEffects.rules = [];
      return "All rules cleared.";
    }

    const id = `rule_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    room.activeEffects.rules.push({ id, text: card.body, createdBy: byPlayerId });
    return `Rule activated: ${card.title}`;
  }

  // ROLE
  if (card.type === "role") {
    const target = resolution.targetPlayerId;
    room.activeEffects.rolesByPlayerId[target] = card.title;
    return `Role assigned to ${playerName(room, target)}: ${card.title}`;
  }

  // CURSE
  if (card.type === "curse") {
    const target = resolution.targetPlayerId;
    room.activeEffects.cursesByPlayerId[target] = card.title;
    return `Curse applied to ${playerName(room, target)}: ${card.title}`;
  }

  // EVENT/JOKER (simple prototype)
  if (card.type === "event" || card.type === "joker") {
    room.activeEffects.currentEvent = { id: card.id, title: card.title };
    return `${card.title} is active.`;
  }

  // FORFEIT default
  return `Resolved: ${card.title}`;
}

// Timer expiry loop: 1-drink penalty then auto-advance
// IMPORTANT: This should NOT care about confirmations (non-blocking).
setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (!room.started || room.paused) continue;
    if (!room.turnTimer?.enabled) continue;

    // AFK helper: nudge the current turn player once when time is running low.
    if (room.turnTimer.endsAt > now) {
      const remainingMs = room.turnTimer.endsAt - now;
      if (room.currentDraw && remainingMs <= 15000) {
        const turnKey = `${room.currentDraw.cardId}:${room.currentDraw.drawnByPlayerId}:${room.turnIndex}`;
        if (!room._afkNudged || room._afkNudged.turnKey !== turnKey) {
          room._afkNudged = { turnKey, ts: now };
          const to = room.currentDraw.drawnByPlayerId;
          io.to(room.roomCode).emit("player:nudged", {
            roomCode: room.roomCode,
            toPlayerId: to,
            fromName: "Sociables"
          });
          pushLog(room, { type: "nudge", text: `Reminder sent to ${playerName(room, to)}.`, actorId: to });
          io.to(room.roomCode).emit("room:state", { room });
        }
      }
      continue;
    }

    if (room.currentDraw) {
      const name = playerName(room, room.currentDraw.drawnByPlayerId);
      const pid = room.currentDraw.drawnByPlayerId;
      room.drinkStats[pid] = room.drinkStats[pid] || { given: 0, taken: 0 };
      room.drinkStats[pid].taken += 1;
      pushLog(room, { type: "system", text: `Time's up. ${name} takes 1 drink.`, actorId: pid });

      room.currentDraw = null;
      room.turnTimer = null;

      const nextPlayerId = nextTurn(room);

      io.to(room.roomCode).emit("effect:applied", {
        room,
        message: `Time's up. ${name} takes 1 drink. Turn passes.`
      });

      io.to(room.roomCode).emit("turn:changed", { turnIndex: room.turnIndex, playerId: nextPlayerId });
      io.to(room.roomCode).emit("room:state", { room });
    } else {
      room.turnTimer = null;
      io.to(room.roomCode).emit("room:state", { room });
    }
  }
}, 500);

// ====================
// ADMIN SOCKET NAMESPACE
// ====================
const ADMIN_KEY = process.env.ADMIN_KEY || "default_admin_key_change_me";

const adminNamespace = io.of("/admin");

adminNamespace.use((socket, next) => {
  const providedKey = socket.handshake.auth.adminKey;
  if (providedKey === ADMIN_KEY) {
    next();
  } else {
    console.log(`[ADMIN] Failed auth attempt from ${socket.id}`);
    next(new Error("Invalid admin key"));
  }
});

adminNamespace.on("connection", (socket) => {
  console.log(`[ADMIN] Admin connected: ${socket.id}`);
  
  // Send all rooms on connect
  const allRooms = Array.from(rooms.values()).map(room => ({
    roomCode: room.roomCode,
    playerCount: room.players.length,
    spectatorCount: room.spectators?.length || 0,
    hostName: room.players.find(p => p.seatIndex === 0)?.name || "Unknown",
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    started: room.started,
    paused: room.paused,
    currentTurn: room.players.find(p => p.seatIndex === room.turnIndex)?.name || "None",
    players: room.players.map(p => ({
      id: p.playerId,
      name: p.name,
      seatIndex: p.seatIndex,
      connected: p.connected,
      socketId: p.socketId
    })),
    spectators: room.spectators?.map(s => ({
      id: s.playerId,
      name: s.name,
      connected: s.connected
    })) || []
  }));
  
  socket.emit("admin:rooms", allRooms);
  
  // Request to refresh rooms
  socket.on("admin:getRooms", () => {
    const allRooms = Array.from(rooms.values()).map(room => ({
      roomCode: room.roomCode,
      playerCount: room.players.length,
      spectatorCount: room.spectators?.length || 0,
      hostName: room.players.find(p => p.seatIndex === 0)?.name || "Unknown",
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      started: room.started,
      paused: room.paused,
      currentTurn: room.players.find(p => p.seatIndex === room.turnIndex)?.name || "None",
      players: room.players.map(p => ({
        id: p.playerId,
        name: p.name,
        seatIndex: p.seatIndex,
        connected: p.connected,
        socketId: p.socketId
      })),
      spectators: room.spectators?.map(s => ({
        id: s.playerId,
        name: s.name,
        connected: s.connected
      })) || []
    }));
    
    socket.emit("admin:rooms", allRooms);
  });
  
  // Admin kick player from any room
  socket.on("admin:kickPlayer", ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
    
    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return cb?.({ error: "PLAYER_NOT_FOUND" });
    
    // Remove player from room
    room.players = room.players.filter(p => p.playerId !== playerId);
    
    // Update drink stats
    delete room.drinkStats[playerId];
    
    // Clean up socket tracking
    if (player.socketId) {
      socketToPlayer.delete(player.socketId);
    }
    
    // Notify room
    pushLog(room, {
      type: "system",
      text: `${player.name} was kicked by admin.`,
      actorId: "admin"
    });
    
    // Notify kicked player if they're connected
    if (player.socketId) {
      io.to(player.socketId).emit("kicked", { message: "You were kicked by admin" });
    }
    
    // Update room state
    io.to(roomCode).emit("room:state", { room });
    updateRoomActivity(roomCode);
    
    // Notify all admins
    const allRooms = Array.from(rooms.values()).map(r => ({ /* same mapping as above */ }));
    adminNamespace.emit("admin:rooms", allRooms);
    
    cb?.({ ok: true, message: `Kicked ${player.name} from ${roomCode}` });
  });
  
  // Admin close any room
  socket.on("admin:closeRoom", ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
    
    // Notify all players
    io.to(roomCode).emit("room:closed", { message: "Room closed by admin" });
    
    // Clean up socket tracking for all players in this room
    for (const player of room.players) {
      if (player.socketId) {
        socketToPlayer.delete(player.socketId);
      }
    }
    for (const spectator of room.spectators) {
      if (spectator.socketId) {
        socketToPlayer.delete(spectator.socketId);
      }
    }
    
    // Clean up room
    rooms.delete(roomCode);
    const timeout = roomCleanupTimeouts.get(roomCode);
    if (timeout) clearTimeout(timeout);
    roomCleanupTimeouts.delete(roomCode);
    
    pushLog(room, {
      type: "system",
      text: "Room closed by admin.",
      actorId: "admin"
    });
    
    // Notify all admins
    const allRooms = Array.from(rooms.values()).map(r => ({ /* same mapping as above */ }));
    adminNamespace.emit("admin:rooms", allRooms);
    
    cb?.({ ok: true, message: `Closed room ${roomCode}` });
  });
  
  // Broadcast room updates to all admins when rooms change
  const notifyAdminsOfRooms = () => {
    const allRooms = Array.from(rooms.values()).map(room => ({
      roomCode: room.roomCode,
      playerCount: room.players.length,
      spectatorCount: room.spectators?.length || 0,
      hostName: room.players.find(p => p.seatIndex === 0)?.name || "Unknown",
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      started: room.started,
      paused: room.paused,
      currentTurn: room.players.find(p => p.seatIndex === room.turnIndex)?.name || "None",
      players: room.players.map(p => ({
        id: p.playerId,
        name: p.name,
        seatIndex: p.seatIndex,
        connected: p.connected,
        socketId: p.socketId
      })),
      spectators: room.spectators?.map(s => ({
        id: s.playerId,
        name: s.name,
        connected: s.connected
      })) || []
    }));
    
    adminNamespace.emit("admin:rooms", allRooms);
  };
  
  // Listen for room changes and notify admins
  // We'll call notifyAdminsOfRooms() in room creation/join/disconnect handlers
  
  socket.on("disconnect", () => {
    console.log(`[ADMIN] Admin disconnected: ${socket.id}`);
  });
  
	  // ====================
	// CARD MANAGEMENT SYSTEM
	// ====================

	// Store custom cards (in production, you'd want to persist this)
	const customCards = new Map<string, Card>();

	// Initialize with some default custom cards if you want
	// customCards.set("custom-1", { ... });

	// Add these handlers in the adminNamespace.on("connection", ...) section:

	// Get all cards (default + custom)
	socket.on("admin:getCards", (cb) => {
	  const allCards = Array.from(byId.values()); // Default cards
	  const customCardList = Array.from(customCards.values());
	  cb?.({ default: allCards, custom: customCardList });
	});

	// Create/Update custom card
	socket.on("admin:saveCard", (cardData: any, cb) => {
	  try {
		// Generate ID if not provided
		const cardId = cardData.id || `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		
		const newCard: Card = {
		  id: cardId,
		  deck: "ultimate",
		  type: cardData.type || "forfeit",
		  title: cardData.title || "Custom Card",
		  body: cardData.body || "Custom card description",
		  resolution: cardData.resolution || { kind: "none" }
		};
		
		customCards.set(cardId, newCard);
		
		// Notify all admins
		adminNamespace.emit("admin:cardUpdated", { 
		  action: cardData.id ? "updated" : "created", 
		  card: newCard 
		});
		
		cb?.({ ok: true, card: newCard });
	  } catch (error) {
		console.error("[ADMIN] Error saving card:", error);
		cb?.({ error: "Failed to save card" });
	  }
	});

	// Delete custom card
	socket.on("admin:deleteCard", ({ cardId }, cb) => {
	  if (!customCards.has(cardId)) {
		return cb?.({ error: "Card not found" });
	  }
	  
	  customCards.delete(cardId);
	  
	  // Notify all admins
	  adminNamespace.emit("admin:cardUpdated", { 
		action: "deleted", 
		cardId 
	  });
	  
	  cb?.({ ok: true });
	});

	// Add custom cards to the deck for specific rooms
	socket.on("admin:addCardsToRoom", ({ roomCode, cardIds }, cb) => {
	  const room = rooms.get(roomCode);
	  if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
	  
	  const cardsToAdd = cardIds
		.map(id => customCards.get(id))
		.filter(Boolean) as Card[];
	  
	  if (cardsToAdd.length === 0) {
		return cb?.({ error: "No valid cards found" });
	  }
	  
	  // Add to room's custom deck order
	  const customDeckOrder = room.settings.customDeckOrder || room.deckOrder;
	  const newCardIds = cardsToAdd.map(card => card.id);
	  room.settings.customDeckOrder = [...customDeckOrder, ...newCardIds];
	  
	  // Update the byId map so these cards can be drawn
	  cardsToAdd.forEach(card => {
		byId.set(card.id, card);
	  });
	  
	  pushLog(room, {
		type: "deck",
		text: `Admin added ${cardsToAdd.length} custom cards to the deck.`,
		actorId: "admin"
	  });
	  
	  io.to(roomCode).emit("room:state", { room });
	  cb?.({ ok: true, added: cardsToAdd.length });
	});
});

// Helper function to notify all admins of room updates
function notifyAdminsOfRoomUpdate() {
  const allRooms = Array.from(rooms.values()).map(room => ({
    roomCode: room.roomCode,
    playerCount: room.players.length,
    spectatorCount: room.spectators?.length || 0,
    hostName: room.players.find(p => p.seatIndex === 0)?.name || "Unknown",
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    started: room.started,
    paused: room.paused,
    currentTurn: room.players.find(p => p.seatIndex === room.turnIndex)?.name || "None",
    players: room.players.map(p => ({
      id: p.playerId,
      name: p.name,
      seatIndex: p.seatIndex,
      connected: p.connected,
      socketId: p.socketId
    })),
    spectators: room.spectators?.map(s => ({
      id: s.playerId,
      name: s.name,
      connected: s.connected
    })) || []
  }));
  
  adminNamespace.emit("admin:rooms", allRooms);
}


io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, cb) => {
    // ========== ADD DEDUPLICATION CHECK ==========
    if (!canProcessRequest(socket.id, 'room:create')) {
      return cb?.({ error: 'TOO_MANY_REQUESTS', message: 'Please wait before creating another room' });
    }
    // =============================================
    
    const roomCode = nanoid(5).toUpperCase();
    const playerId = nanoid();

    const room: any = {
      roomCode,
      deckId: "ultimate" as const,
      deckOrder: UltimateDeck.map((c) => c.id),
      drawIndex: 0,
      discard: [],
      players: [{ 
        playerId, 
        name, 
        seatIndex: 0, 
        connected: true, 
        mode: "player" as const,
        // ========== ADD SOCKET ID ==========
        socketId: socket.id
        // ===================================
      }],
      spectators: [] as Player[],
      turnIndex: 0,
      started: true,
      paused: false,
      currentDraw: null,
      turnTimer: null,
      activeEffects: { rules: [], rolesByPlayerId: {}, cursesByPlayerId: {}, currentEvent: null },
      log: [] as RoomLogItem[],

      settings: {
        safeMode: false,
        dynamicWeighting: true,
        theme: "obsidian",
        sfx: true,
        haptics: true
      } as RoomSettings,
      drinkStats: { [playerId]: { given: 0, taken: 0 } } as Record<string, { given: number; taken: number }>,

      pendingAcks: [] as PendingAck[],
      awaitingAcksForCardId: null as string | null,
      
      // ========== ADD ACTIVITY TRACKING ==========
      createdAt: Date.now(),
      lastActivity: Date.now(),
      hostSocketId: socket.id,
      // ===========================================
    };

    pushLog(room, { type: "system", text: `${name} created the room.`, actorId: playerId });

    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    // ========== TRACK SOCKET-PLAYER MAPPING ==========
    socketToPlayer.set(socket.id, { roomCode, playerId });
    // =================================================
    
    // ========== SCHEDULE INITIAL CLEANUP ==========
    scheduleRoomCleanup(roomCode);
    // ==============================================
	//notify admin
	notifyAdminsOfRoomUpdate();

    cb({ roomCode, playerId });
    io.to(roomCode).emit("room:state", { room });
  });

  socket.on("room:join", ({ roomCode, name, spectator }, cb) => {
    // ========== ADD DEDUPLICATION CHECK ==========
    if (!canProcessRequest(socket.id, 'room:join')) {
      return cb?.({ error: 'TOO_MANY_REQUESTS', message: 'Please wait before trying again' });
    }
    // =============================================
    
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });

    const playerId = nanoid();
    const isSpectator = !!spectator;

    if (isSpectator) {
      room.spectators.push({ 
        playerId, 
        name, 
        seatIndex: -1, 
        connected: true, 
        mode: "spectator",
        // ========== ADD SOCKET ID ==========
        socketId: socket.id
        // ===================================
      });
    } else {
      const seatIndex = activePlayers(room).length;
      room.players.push({ 
        playerId, 
        name, 
        seatIndex, 
        connected: true, 
        mode: "player",
        // ========== ADD SOCKET ID ==========
        socketId: socket.id
        // ===================================
      });
    }

    room.drinkStats[playerId] = { given: 0, taken: 0 };
    pushLog(room, {
      type: "system",
      text: `${name} joined${isSpectator ? " as spectator" : ""}.`,
      actorId: playerId
    });
    socket.join(roomCode);
    
    // ========== TRACK SOCKET-PLAYER MAPPING ==========
    socketToPlayer.set(socket.id, { roomCode, playerId });
    // =================================================
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================
	//admin update
	notifyAdminsOfRoomUpdate();

    cb({ roomCode, playerId });
    io.to(roomCode).emit("room:state", { room });
  });

  socket.on("room:sync", ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
    socket.join(roomCode);
    socket.emit("room:state", { room });
    cb?.({ ok: true });
  });

  socket.on("turn:draw", ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });

    // confirmations are non-blocking now:
    // if (room.awaitingAcksForCardId) return cb({ error: "WAITING_FOR_CONFIRMATIONS" });

    if (!room.started) return cb({ error: "GAME_NOT_STARTED" });
    if (room.paused) return cb({ error: "PAUSED" });

    const turn = assertIsTurnPlayer(room, playerId);
    if (!turn.ok) return cb({ error: turn.error });

    if (room.currentDraw) return cb({ error: "UNRESOLVED_CARD" });

    const order = (room.settings.customDeckOrder?.length ? room.settings.customDeckOrder : room.deckOrder) as string[];
    const cardId = room.settings.dynamicWeighting ? pickWeightedNextCard(room) : order[room.drawIndex % order.length];
    const card = byId.get(cardId);
    if (!card) return cb({ error: "CARD_NOT_FOUND" });

    room.drawIndex += 1;
    room.discard.push(cardId);
    room.currentDraw = { cardId, drawnByPlayerId: playerId };

    pushLog(room, {
      type: "draw",
      text: `${playerName(room, playerId)} drew: ${card.title}`,
      actorId: playerId,
      cardId
    });
    // reset per-turn AFK nudge marker
    room._afkNudged = undefined;

    pushLog(room, {
      type: "draw",
      text: `${playerName(room, playerId)} drew: ${card.title}`,
      actorId: playerId,
      cardId
    });

    const t = computeTimer(card);
    room.turnTimer = t.enabled
      ? { enabled: true, secondsTotal: t.seconds, endsAt: Date.now() + t.seconds * 1000 }
      : { enabled: false, secondsTotal: 0, endsAt: 0, reason: t.reason };
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================

    io.to(roomCode).emit("card:drawn", { card, drawnByPlayerId: playerId });
    io.to(roomCode).emit("room:state", { room });
    cb({ ok: true });
  });

  socket.on("card:resolve", ({ roomCode, playerId, cardId, resolution }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });

    // confirmations are non-blocking now:
    // if (room.awaitingAcksForCardId) return cb({ error: "WAITING_FOR_CONFIRMATIONS" });

    const turn = assertIsTurnPlayer(room, playerId);
    if (!turn.ok) return cb({ error: turn.error });

    if (!room.currentDraw) return cb({ error: "NO_ACTIVE_DRAW" });
    if (room.currentDraw.cardId !== cardId) return cb({ error: "CARD_MISMATCH" });
    if (room.currentDraw.drawnByPlayerId !== playerId) return cb({ error: "NOT_DRAWER" });

    const card = byId.get(cardId);
    if (!card) return cb({ error: "CARD_NOT_FOUND" });

    // Validate required inputs
    if (card.resolution.kind === "chooseTarget" && !resolution.targetPlayerId) return cb({ error: "MISSING_TARGET" });
    if (card.resolution.kind === "chooseTwoTargets" && (!resolution.targetPlayerId || !resolution.targetPlayerId2))
      return cb({ error: "MISSING_TARGETS" });
    if (card.resolution.kind === "createRuleText" && !String(resolution.ruleText || "").trim())
      return cb({ error: "MISSING_RULE_TEXT" });

    // Announcement includes who was selected
    const drawer = playerName(room, playerId);
    let announce = `${drawer} resolved: ${card.title}`;

    if (card.resolution.kind === "chooseTarget") {
      announce = `${drawer} chose ${playerName(room, resolution.targetPlayerId)}: ${card.title}`;
    } else if (card.resolution.kind === "chooseTwoTargets") {
      announce = `${drawer} chose ${playerName(room, resolution.targetPlayerId)} and ${playerName(
        room,
        resolution.targetPlayerId2
      )}: ${card.title}`;
    } else if (card.resolution.kind === "chooseTargetAndNumber") {
      announce = `${drawer} chose ${playerName(room, resolution.targetPlayerId)}: ${card.title}`;
    }

    const effectMessage = applyCard(room, card, playerId, resolution);

    // Update drink tracking (heuristic)
    applyDrinkStats(room, card, playerId, resolution);
    pushLog(room, { type: "resolve", text: `${announce}. ${effectMessage}`, actorId: playerId, cardId });

    // Clear unresolved draw and timer
    room.currentDraw = null;
    room.turnTimer = null;

	// Create confirmation(s) if needed — NON-BLOCKING
	if (requiresAck(card)) {
	  const acks: PendingAck[] = [];
	  const kind = card.resolution.kind;

	  if (kind === "chooseTarget" || kind === "chooseTargetAndNumber") {
		const t1 = resolution.targetPlayerId;

		acks.push(
		  createAck(room, card, playerId, t1, {
			kind,
			numberValue: resolution?.numberValue,
			ruleText: resolution?.ruleText,
			targets: [t1]
		  })
		);
	  } else if (kind === "chooseTwoTargets") {
		const t1 = resolution.targetPlayerId;
		const t2 = resolution.targetPlayerId2;

		acks.push(
		  createAck(room, card, playerId, t1, {
			kind,
			numberValue: resolution?.numberValue,
			ruleText: resolution?.ruleText,
			targets: [t1, t2]
		  })
		);

		acks.push(
		  createAck(room, card, playerId, t2, {
			kind,
			numberValue: resolution?.numberValue,
			ruleText: resolution?.ruleText,
			targets: [t1, t2]
		  })
		);
	  }

	  room.pendingAcks.push(...acks);

	  // Keep this field for compatibility, but do not use it to block:
	  room.awaitingAcksForCardId = null;
	}

    // Always advance immediately (game never stalls waiting on confirmations)
    const nextPlayerId = nextTurn(room);

    const pendingText =
      requiresAck(card) ? " (Confirmation needed from selected player(s) — game continues.)" : "";

    io.to(roomCode).emit("effect:applied", { room, message: `${announce}. ${effectMessage}${pendingText}` });
    io.to(roomCode).emit("turn:changed", { turnIndex: room.turnIndex, playerId: nextPlayerId });
    io.to(roomCode).emit("room:state", { room });
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================

    cb({ ok: true });
  });

  socket.on("ack:confirm", ({ roomCode, playerId, ackId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });

    const ack = room.pendingAcks.find((a) => a.ackId === ackId);
    if (!ack) return cb({ error: "ACK_NOT_FOUND" });

    if (ack.assignedToPlayerId !== playerId) return cb({ error: "NOT_YOUR_ACK" });
    if (ack.status === "confirmed") return cb({ ok: true });

    ack.status = "confirmed";
    ack.confirmedAt = Date.now();

    // Remove confirmed acks to keep the list clean (optional but recommended)
    // If you want to keep history, comment this out.
    room.pendingAcks = room.pendingAcks.filter((a) => a.status !== "confirmed");
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================

    io.to(roomCode).emit("effect:applied", { room, message: `${playerName(room, playerId)} confirmed.` });
    io.to(roomCode).emit("room:state", { room });

    cb({ ok: true });
  });

  socket.on("turn:nudge", ({ roomCode, fromPlayerId, toPlayerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });
    const fromName = playerName(room, fromPlayerId);
    io.to(roomCode).emit("player:nudged", { roomCode, toPlayerId, fromName });
    pushLog(room, { type: "nudge", text: `${fromName} nudged ${playerName(room, toPlayerId)}.`, actorId: fromPlayerId });
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================
    
    io.to(roomCode).emit("room:state", { room });
    cb({ ok: true });
  });

  socket.on("room:updateSettings", ({ roomCode, playerId, patch }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });
    if (!isHost(room, playerId)) return cb({ error: "NOT_HOST" });
    room.settings = { ...room.settings, ...patch };
    pushLog(room, { type: "setting", text: `${playerName(room, playerId)} updated settings.`, actorId: playerId });
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================
    
    io.to(roomCode).emit("room:state", { room });
    cb({ ok: true });
  });

  socket.on("room:setDeck", ({ roomCode, playerId, deckOrder }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });
    if (!isHost(room, playerId)) return cb({ error: "NOT_HOST" });
    const clean = sanitizeDeckOrder(deckOrder || []);
    if (!clean.length) return cb({ error: "EMPTY_DECK" });
    room.settings.customDeckOrder = clean;
    room.drawIndex = 0;
    room.discard = [];
    room.currentDraw = null;
    room.turnTimer = null;
    pushLog(room, { type: "deck", text: `${playerName(room, playerId)} loaded a custom deck (${clean.length} cards).`, actorId: playerId });
    
    // ========== UPDATE ACTIVITY ==========
    updateRoomActivity(roomCode);
    // =====================================
    
    io.to(roomCode).emit("room:state", { room });
    cb({ ok: true });
  });

  // ====================
  // HOST CONTROLS
  // ====================
  
  socket.on("host:kick", ({ roomCode, targetPlayerId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
    
    // Get playerId from socket tracking
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return cb?.({ error: "PLAYER_NOT_FOUND" });
    const { playerId } = playerInfo;
    
    // Check if requester is host (first player)
    const hostPlayer = room.players.find(p => p.seatIndex === 0);
    if (!hostPlayer || hostPlayer.playerId !== playerId) {
      return cb?.({ error: "NOT_HOST" });
    }
    
    // Find target player
    const targetPlayer = room.players.find(p => p.playerId === targetPlayerId);
    if (!targetPlayer) return cb?.({ error: "PLAYER_NOT_FOUND" });
    
    // Can't kick yourself
    if (targetPlayerId === playerId) return cb?.({ error: "CANNOT_KICK_SELF" });
    
    // Remove player from room
    room.players = room.players.filter(p => p.playerId !== targetPlayerId);
    
    // Update drink stats
    delete room.drinkStats[targetPlayerId];
    
    // Clean up socket tracking
    if (targetPlayer.socketId) {
      socketToPlayer.delete(targetPlayer.socketId);
    }
    
    // Notify room
    pushLog(room, {
      type: "system",
      text: `${targetPlayer.name} was kicked by host.`,
      actorId: playerId
    });
    
    // Notify kicked player if they're connected
    if (targetPlayer.socketId) {
      io.to(targetPlayer.socketId).emit("kicked", { message: "You were kicked by the host" });
    }
    
    // Update room state
    io.to(roomCode).emit("room:state", { room });
    updateRoomActivity(roomCode);
	
	notifyAdminsOfRoomUpdate();
    
    cb?.({ ok: true });
  });
  
  socket.on("host:close-room", ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ error: "ROOM_NOT_FOUND" });
    
    // Get playerId from socket tracking
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return cb?.({ error: "PLAYER_NOT_FOUND" });
    const { playerId } = playerInfo;
    
    // Check if requester is host (first player)
    const hostPlayer = room.players.find(p => p.seatIndex === 0);
    if (!hostPlayer || hostPlayer.playerId !== playerId) {
      return cb?.({ error: "NOT_HOST" });
    }
    
    // Notify all players
    io.to(roomCode).emit("room:closed", { message: "Room closed by host" });
    
    // Clean up socket tracking for all players in this room
    for (const player of room.players) {
      if (player.socketId) {
        socketToPlayer.delete(player.socketId);
      }
    }
    for (const spectator of room.spectators) {
      if (spectator.socketId) {
        socketToPlayer.delete(spectator.socketId);
      }
    }
    
    // Clean up room
    rooms.delete(roomCode);
    const timeout = roomCleanupTimeouts.get(roomCode);
    if (timeout) clearTimeout(timeout);
    roomCleanupTimeouts.delete(roomCode);
    
    pushLog(room, {
      type: "system",
      text: "Room closed by host.",
      actorId: playerId
    });
	//admin update
	notifyAdminsOfRoomUpdate();
    
    cb?.({ ok: true });
  });

  // ====================
  // DISCONNECT HANDLER
  // ====================
  socket.on("disconnect", () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;
    
    const { roomCode, playerId } = playerInfo;
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Remove from tracking
    socketToPlayer.delete(socket.id);
    
    // Find the player
    const player = room.players.find(p => p.playerId === playerId);
    const spectator = room.spectators?.find(s => s.playerId === playerId);
    
    if (player) {
      // If host disconnects, close the room
      if (player.seatIndex === 0) {
        io.to(roomCode).emit("room:closed", { message: "Host disconnected" });
        rooms.delete(roomCode);
        const timeout = roomCleanupTimeouts.get(roomCode);
        if (timeout) clearTimeout(timeout);
        roomCleanupTimeouts.delete(roomCode);
        
        // Clean up socket tracking for all players in this room
        for (const p of room.players) {
          if (p.socketId) {
            socketToPlayer.delete(p.socketId);
          }
        }
        for (const s of room.spectators) {
          if (s.socketId) {
            socketToPlayer.delete(s.socketId);
          }
        }
      } else {
        // Regular player - mark as disconnected
        player.connected = false;
        player.socketId = undefined;
        io.to(roomCode).emit("room:state", { room });
        updateRoomActivity(roomCode);
      }
    } else if (spectator) {
      // Remove spectator
      room.spectators = room.spectators.filter(s => s.playerId !== playerId);
      io.to(roomCode).emit("room:state", { room });
      updateRoomActivity(roomCode);
    }
	notifyAdminsOfRoomUpdate();
  });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () => console.log(`Sociables server running on :${port}`));