import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { BrandShell } from "../components/BrandShell";
import { Button, Panel, PanelBody, Tag } from "../components/UI";
import { useToast } from "../components/ToastProvider";
import { sfx } from "../lib/sfx";
import { getServerBase } from "../lib/socket";

type Card = {
  id: string;
  deck: "ultimate";
  type: "forfeit" | "rule" | "role" | "curse" | "event" | "joker" | "setup" | "endgame";
  title: string;
  body: string;
  resolution: {
    kind: "none" | "chooseTarget" | "chooseNumber" | "chooseTargetAndNumber" | "chooseTwoTargets" | "createRuleText";
    min?: number;
    max?: number;
    numMin?: number;
    numMax?: number;
    maxLen?: number;
  };
};

type RoomPlayer = {
  id: string;
  name: string;
  seatIndex: number;
  connected: boolean;
  socketId?: string;
};

type RoomData = {
  roomCode: string;
  playerCount: number;
  spectatorCount: number;
  hostName: string;
  createdAt: number;
  lastActivity: number;
  started: boolean;
  paused: boolean;
  currentTurn: string;
  players: RoomPlayer[];
  spectators: RoomPlayer[];
};

function CardEditor({ card, onSave, onCancel }: { 
  card: Card | null; 
  onSave: (cardData: any) => void; 
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    id: card?.id || "",
    title: card?.title || "",
    body: card?.body || "",
    type: card?.type || "forfeit",
    resolution: card?.resolution || { kind: "none" }
  });
  
  const cardTypes = ["forfeit", "rule", "role", "curse", "event", "joker"] as const;
  const resolutionTypes = [
    { value: "none", label: "No input needed" },
    { value: "chooseTarget", label: "Choose target player" },
    { value: "chooseNumber", label: "Choose number" },
    { value: "chooseTargetAndNumber", label: "Choose target and number" },
    { value: "chooseTwoTargets", label: "Choose two targets" },
    { value: "createRuleText", label: "Create rule text" }
  ];
  
  const handleSave = () => {
    if (!form.title.trim()) {
      alert("Card title is required");
      return;
    }
    if (!form.body.trim()) {
      alert("Card description is required");
      return;
    }
    
    onSave(form);
  };
  
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-white/60 mb-1 block">Card Title</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({...form, title: e.target.value})}
          className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
          placeholder="e.g., 'Drink if you...'"
          maxLength={60}
        />
      </div>
      
      <div>
        <label className="text-sm text-white/60 mb-1 block">Description</label>
        <textarea
          value={form.body}
          onChange={(e) => setForm({...form, body: e.target.value})}
          className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 min-h-[100px]"
          placeholder="What does this card do? e.g., 'Take 2 drinks if...'"
          maxLength={200}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-white/60 mb-1 block">Card Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({...form, type: e.target.value as any})}
            className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {cardTypes.map(type => (
              <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="text-sm text-white/60 mb-1 block">Resolution Type</label>
          <select
            value={form.resolution.kind}
            onChange={(e) => setForm({
              ...form, 
              resolution: { kind: e.target.value } as any
            })}
            className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {resolutionTypes.map(res => (
              <option key={res.value} value={res.value}>{res.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mt-4">
        <div className="text-sm font-semibold mb-2">Preview</div>
        <div className="space-y-2">
          <div className="font-semibold">{form.title || "Card Title"}</div>
          <div className="text-sm text-white/75">{form.body || "Card description will appear here"}</div>
          <div className="text-xs text-white/60">
            Type: {form.type} • Resolution: {form.resolution.kind}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-semibold hover:bg-white/10 active:scale-[0.98] transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-2xl border border-white/15 bg-white text-black px-4 py-3 font-semibold hover:bg-white/90 active:scale-[0.98] transition"
        >
          {card ? "Update Card" : "Create Card"}
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"rooms" | "cards">("rooms");
  const [cards, setCards] = useState<{ default: Card[]; custom: Card[] }>({ default: [], custom: [] });
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDuration = (ms: number) => {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };
  
  const getRoomActivityStatus = (lastActivity: number) => {
    const minutesAgo = Math.floor((Date.now() - lastActivity) / 60000);
    if (minutesAgo < 2) return { text: "Active now", color: "bg-emerald-500" };
    if (minutesAgo < 5) return { text: `${minutesAgo}m ago`, color: "bg-amber-500" };
    return { text: `${minutesAgo}m ago`, color: "bg-red-500" };
  };
  
  const connectAdminSocket = () => {
    if (!adminKey.trim()) {
      toast({ kind: "error", title: "Admin Key Required", message: "Please enter the admin key" });
      return;
    }
    
    sfx.click();
    
    if (socket) {
      socket.disconnect();
    }
    
    const serverBase = getServerBase();
    const newSocket = io(`${serverBase}/admin`, {
      auth: { adminKey: adminKey.trim() },
      transports: ["websocket", "polling"],
    });
    
    newSocket.on("connect", () => {
      console.log("Admin socket connected");
      setIsConnected(true);
      setIsAuthenticated(true);
      localStorage.setItem("sociables_admin_key", adminKey.trim());
    });
    
    newSocket.on("connect_error", (err) => {
      console.error("Admin connection error:", err);
      setIsConnected(false);
      if (err.message.includes("Invalid admin key")) {
        toast({ kind: "error", title: "Authentication Failed", message: "Invalid admin key" });
      } else {
        toast({ kind: "error", title: "Connection Failed", message: err.message });
      }
    });
    
    newSocket.on("admin:rooms", (roomsData: RoomData[]) => {
      setRooms(roomsData);
    });
    
    newSocket.on("admin:cardUpdated", (data: any) => {
      toast({ 
        kind: "success", 
        title: `Card ${data.action}`, 
        message: data.action === "deleted" ? "Card removed" : `Card "${data.card?.title}" ${data.action}` 
      });
      loadCards();
    });
    
    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });
    
    newSocket.emit("admin:getCards");
    
    setSocket(newSocket);
  };
  
  const disconnectAdminSocket = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsAuthenticated(false);
      setIsConnected(false);
      localStorage.removeItem("sociables_admin_key");
    }
  };
  
  const refreshRooms = () => {
    if (socket && isConnected) {
      socket.emit("admin:getRooms");
      sfx.click();
    }
  };
  
  const loadCards = () => {
    if (socket && isConnected) {
      socket.emit("admin:getCards", (response: any) => {
        if (response) {
          setCards(response);
        }
      });
    }
  };
  
  const saveCard = (cardData: any) => {
    if (!socket || !isConnected) return;
    
    socket.emit("admin:saveCard", cardData, (response: any) => {
      if (response?.error) {
        toast({ kind: "error", title: "Save Failed", message: response.error });
      } else {
        toast({ kind: "success", title: "Card Saved", message: `"${response.card.title}" saved successfully` });
        setIsCreatingCard(false);
        setEditingCard(null);
      }
    });
  };
  
  const deleteCard = (cardId: string) => {
    if (!socket || !isConnected) return;
    
    if (!window.confirm("Delete this custom card? This cannot be undone.")) {
      return;
    }
    
    socket.emit("admin:deleteCard", { cardId }, (response: any) => {
      if (response?.error) {
        toast({ kind: "error", title: "Delete Failed", message: response.error });
      }
    });
  };
  
  const addCardsToRoom = (roomCode: string, cardIds: string[]) => {
    if (!socket || !isConnected) return;
    
    socket.emit("admin:addCardsToRoom", { roomCode, cardIds }, (response: any) => {
      if (response?.error) {
        toast({ kind: "error", title: "Add Failed", message: response.error });
      } else {
        toast({ kind: "success", title: "Cards Added", message: `${response.added} cards added to room ${roomCode}` });
      }
    });
  };
  
  const adminKickPlayer = (roomCode: string, playerId: string, playerName: string) => {
    if (!socket || !isConnected) return;
    
    if (!window.confirm(`Kick ${playerName} from room ${roomCode}?`)) {
      return;
    }
    
    sfx.click();
    socket.emit("admin:kickPlayer", { roomCode, playerId }, (response: any) => {
      if (response?.error) {
        sfx.error();
        toast({ kind: "error", title: "Kick Failed", message: response.error });
      } else {
        sfx.confirm();
        toast({ kind: "success", title: "Player Kicked", message: response?.message || "Player removed" });
      }
    });
  };
  
  const adminCloseRoom = (roomCode: string) => {
    if (!socket || !isConnected) return;
    
    if (!window.confirm(`Close room ${roomCode}? This will end the game for all players.`)) {
      return;
    }
    
    sfx.click();
    socket.emit("admin:closeRoom", { roomCode }, (response: any) => {
      if (response?.error) {
        sfx.error();
        toast({ kind: "error", title: "Close Failed", message: response.error });
      } else {
        sfx.confirm();
        toast({ kind: "success", title: "Room Closed", message: response?.message || "Room closed" });
      }
    });
  };
  
  useEffect(() => {
    const storedKey = localStorage.getItem("sociables_admin_key");
    if (storedKey) {
      setAdminKey(storedKey);
    }
  }, []);
  
  useEffect(() => {
    const storedKey = localStorage.getItem("sociables_admin_key");
    if (storedKey && !socket) {
      setAdminKey(storedKey);
      setTimeout(() => {
        if (storedKey) {
          connectAdminSocket();
        }
      }, 100);
    }
  }, []);
  
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      if (socket) {
        socket.emit("admin:getRooms");
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [isConnected, socket]);
  
  const selectedRoomData = rooms.find(r => r.roomCode === selectedRoom);
  
  if (!isAuthenticated) {
    return (
      <BrandShell subtitle="Administration Panel">
        <div className="max-w-md mx-auto">
          <Panel>
            <PanelBody className="space-y-5">
              <div>
                <div className="text-2xl font-semibold">Admin Access</div>
                <div className="text-white/60 mt-1">Enter admin key to continue</div>
              </div>
              
              <div className="space-y-3">
                <div className="text-sm text-white/60">Admin Key</div>
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && connectAdminSocket()}
                  className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="Enter admin key..."
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Button variant="ghost" onClick={() => router.push("/")}>
                  Back to Site
                </Button>
                <Button variant="primary" onClick={connectAdminSocket}>
                  Authenticate
                </Button>
              </div>
              
              <div className="text-xs text-white/50 text-center">
                Access restricted to authorized personnel only
              </div>
            </PanelBody>
          </Panel>
        </div>
      </BrandShell>
    );
  }
  
  return (
    <BrandShell subtitle="Administration Panel">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-semibold">Administration</div>
            <div className="text-white/60">
              {activeTab === "rooms" ? `${rooms.length} active room${rooms.length !== 1 ? 's' : ''}` : `${cards.custom.length} custom card${cards.custom.length !== 1 ? 's' : ''}`} • 
              {isConnected ? (
                <span className="text-emerald-400 ml-2">Connected</span>
              ) : (
                <span className="text-amber-400 ml-2">Connecting...</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("rooms")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  activeTab === "rooms" 
                    ? "bg-white text-black" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                Rooms
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("cards");
                  loadCards();
                }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  activeTab === "cards" 
                    ? "bg-white text-black" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                Cards
              </button>
            </div>
            
            <Button variant="secondary" onClick={() => {
              if (activeTab === "rooms") refreshRooms();
              if (activeTab === "cards") loadCards();
            }} disabled={!isConnected}>
              Refresh
            </Button>
            <Button variant="danger" onClick={disconnectAdminSocket}>
              Logout
            </Button>
          </div>
        </div>
        
        {activeTab === "rooms" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Panel>
                <PanelBody>
                  <div className="text-lg font-semibold mb-4">Active Rooms</div>
                  
                  {rooms.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      No active rooms. Rooms will appear here when created.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                      {rooms.map((room) => {
                        const activity = getRoomActivityStatus(room.lastActivity);
                        const isSelected = selectedRoom === room.roomCode;
                        
                        return (
                          <motion.div
                            key={room.roomCode}
                            className={`rounded-2xl border p-4 cursor-pointer transition ${
                              isSelected
                                ? 'border-white/25 bg-white/10'
                                : 'border-white/10 bg-white/5 hover:bg-white/8'
                            }`}
                            onClick={() => setSelectedRoom(room.roomCode)}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.99 }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="font-semibold text-lg truncate">{room.roomCode}</div>
                                  <Tag>{room.playerCount} player{room.playerCount !== 1 ? 's' : ''}</Tag>
                                  {room.spectatorCount > 0 && (
                                    <Tag>{room.spectatorCount} spectator{room.spectatorCount !== 1 ? 's' : ''}</Tag>
                                  )}
                                </div>
                                
                                <div className="text-sm text-white/75 mb-2">
                                  Host: {room.hostName} • Turn: {room.currentTurn}
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-white/60">
                                  <div>Created: {formatTime(room.createdAt)}</div>
                                  <div className="flex items-center gap-1">
                                    <div className={`w-2 h-2 rounded-full ${activity.color}`} />
                                    {activity.text}
                                  </div>
                                  <div>Active: {room.started ? "Yes" : "No"}</div>
                                </div>
                              </div>
                              
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    adminCloseRoom(room.roomCode);
                                  }}
                                  className="rounded-xl border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
            
            <div className="lg:col-span-1">
              <Panel>
                <PanelBody>
                  <div className="text-lg font-semibold mb-4">
                    {selectedRoomData ? `Room ${selectedRoomData.roomCode}` : "Select a Room"}
                  </div>
                  
                  {selectedRoomData ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold mb-2">Room Information</div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/60">Status:</span>
                            <span className={selectedRoomData.started ? "text-emerald-400" : "text-amber-400"}>
                              {selectedRoomData.started ? "Game Active" : "Waiting"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Host:</span>
                            <span>{selectedRoomData.hostName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Current Turn:</span>
                            <span>{selectedRoomData.currentTurn}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Created:</span>
                            <span>{formatDuration(selectedRoomData.createdAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Last Activity:</span>
                            <span>{formatDuration(selectedRoomData.lastActivity)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm font-semibold mb-2">Players ({selectedRoomData.playerCount})</div>
                        <div className="space-y-2">
                          {selectedRoomData.players.map((player) => (
                            <div
                              key={player.id}
                              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3"
                            >
                              <div>
                                <div className="font-semibold">
                                  {player.name}
                                  {player.seatIndex === 0 && <span className="text-white/60 ml-2">(Host)</span>}
                                </div>
                                <div className="text-xs text-white/60">
                                  Seat {player.seatIndex + 1} • {player.connected ? (
                                    <span className="text-emerald-400">Online</span>
                                  ) : (
                                    <span className="text-amber-400">Offline</span>
                                  )}
                                </div>
                              </div>
                              
                              {player.seatIndex !== 0 && (
                                <button
                                  type="button"
                                  onClick={() => adminKickPlayer(selectedRoomData.roomCode, player.id, player.name)}
                                  className="rounded-xl border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
                                >
                                  Kick
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {selectedRoomData.spectatorCount > 0 && (
                        <div>
                          <div className="text-sm font-semibold mb-2">Spectators ({selectedRoomData.spectatorCount})</div>
                          <div className="space-y-2">
                            {selectedRoomData.spectators.map((spectator) => (
                              <div
                                key={spectator.id}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3"
                              >
                                <div>
                                  <div className="font-semibold">{spectator.name}</div>
                                  <div className="text-xs text-white/60">
                                    {spectator.connected ? (
                                      <span className="text-emerald-400">Online</span>
                                    ) : (
                                      <span className="text-amber-400">Offline</span>
                                    )}
                                  </div>
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={() => adminKickPlayer(selectedRoomData.roomCode, spectator.id, spectator.name)}
                                  className="rounded-xl border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="pt-4 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => adminCloseRoom(selectedRoomData.roomCode)}
                          className="w-full rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
                        >
                          Force Close Room
                        </button>
                        <div className="mt-1 text-xs text-white/60 text-center">
                          Ends game for all players immediately
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      Select a room from the list to view details
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Panel>
                <PanelBody>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-semibold">Custom Cards</div>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCard(true)}
                      className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 active:scale-[0.98] transition"
                    >
                      + Create New Card
                    </button>
                  </div>
                  
                  {cards.custom.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      No custom cards yet. Create your first one!
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                      {cards.custom.map((card) => (
                        <div
                          key={card.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-semibold text-lg truncate">{card.title}</div>
                                <Tag>{card.type}</Tag>
                              </div>
                              
                              <div className="text-sm text-white/75 mb-2">
                                {card.body}
                              </div>
                              
                              <div className="text-xs text-white/60">
                                ID: {card.id} • Resolution: {card.resolution.kind}
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingCard(card)}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 active:scale-[0.98] transition"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCard(card.id)}
                                className="rounded-xl border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <div className="text-xs text-white/60 mb-2">Add to room:</div>
                            <div className="flex flex-wrap gap-2">
                              {rooms.slice(0, 3).map(room => (
                                <button
                                  key={room.roomCode}
                                  onClick={() => addCardsToRoom(room.roomCode, [card.id])}
                                  className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-xs hover:bg-white/10"
                                >
                                  {room.roomCode}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
            
            <div className="lg:col-span-1">
              <Panel>
                <PanelBody>
                  <div className="text-lg font-semibold mb-4">
                    {isCreatingCard || editingCard ? "Card Editor" : "Card Preview"}
                  </div>
                  
                  {(isCreatingCard || editingCard) ? (
                    <CardEditor 
                      card={editingCard}
                      onSave={saveCard}
                      onCancel={() => {
                        setIsCreatingCard(false);
                        setEditingCard(null);
                      }}
                    />
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      {cards.custom.length > 0 
                        ? "Select a card to edit or create a new one"
                        : "Create your first custom card!"
                      }
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </BrandShell>
  );
}