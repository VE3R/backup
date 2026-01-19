import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import QRCode from "qrcode";

import { BrandShell } from "../../components/BrandShell";
import { Panel, PanelBody, Tag, Button } from "../../components/UI";
import { PlayingCard } from "../../components/PlayingCard";
import { ResolveModal } from "../../components/ResolveModal";
import { getSocket } from "../../lib/socket";
import { getPlayerId } from "../../lib/storage";
import { useToast } from "../../components/ToastProvider";
import { sfx, setSfxEnabled } from "../../lib/sfx";

type ResolutionDraft = {
  targetPlayerId?: string;
  targetPlayerId2?: string;
  numberValue?: number;
  ruleText?: string;
};

type PendingAck = {
  ackId: string;
  cardId: string;
  cardTitle: string;
  instruction: string;
  createdByPlayerId: string;
  assignedToPlayerId: string;
  status: "pending" | "confirmed";
};

const CARD_HELP: Record<string, string> = {
  "Question Master":
    "While you're Question Master, anyone who answers a question you ask must drink. Avoid answering questions yourself.",
  "Sociables!": 'Everyone yells "Sociables!" immediately and drinks.',
  "Make a Rule":
    "Create a new rule. Anyone who breaks it must drink until the rule is cleared.",
  "Never Have I Ever":
    "Say something you’ve never done. Anyone who HAS done it takes a drink.",

  // Common “give drinks” variants (covers different deck title spellings)
  "Give Two Drinks":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm.",
  "Give 2":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm.",
  "Give 2 Drinks":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm."
};

function explainFor(title: string) {
  return CARD_HELP[title] || "No extra explanation has been added for this card yet.";
}

function recipientMessage(room: any, ack: any) {
  const giver =
    room?.players?.find((p: any) => p.playerId === ack.createdByPlayerId)?.name ?? "Someone";

  const kind = ack?.meta?.kind as string | undefined;
  const n = ack?.meta?.numberValue;

  // Generic messaging by resolution kind
  if (kind === "chooseTarget") {
    const txt = String(ack.cardTitle + " " + ack.instruction).toLowerCase();
    const n = Number((txt.match(/(\d+)/)?.[1] ?? "0"));
    if (txt.includes("give") && txt.includes("drink") && n) return `${giver} gave you ${n} drinks.`;
    if (txt.includes("drink") && n) return `${giver} says: take ${n} drinks.`;
    return `${giver} selected you: ${ack.cardTitle}.`;
  }

  if (kind === "chooseTargetAndNumber" && typeof n === "number") {
    // When number is meaningful (drinks, reps, etc.)
    // If card includes drinks language, render it nicely
    const txt = String(ack.cardTitle + " " + ack.instruction).toLowerCase();
    if (txt.includes("give") && txt.includes("drink")) return `${giver} gave you ${n} drinks.`;
    if (txt.includes("drink")) return `${giver} says: take ${n} drinks.`;
    return `${giver} targeted you: ${ack.cardTitle} (${n}).`;
  }

  if (kind === "chooseTwoTargets") {
    return `${giver} selected you (multi-target): ${ack.cardTitle}.`;
  }

  // Fallback: still better than hardcoding
  return `${giver} targeted you: ${ack.cardTitle}.`;
}


export default function RoomPage() {
  const router = useRouter();
  const { toast } = useToast();

  const code = String(router.query.code || "").toUpperCase();
  const playerId = getPlayerId();

  const [room, setRoom] = useState<any>(null);

  // currently displayed card (client-side)
  const [card, setCard] = useState<any>(null);

  // flip/anim state
  const [faceUp, setFaceUp] = useState(false);
  const [animating, setAnimating] = useState(false);

  // feed
  const [feed, setFeed] = useState<string | null>(null);

  // modal + inputs
  const [resolverOpen, setResolverOpen] = useState(false);
  const [target1, setTarget1] = useState("");
  const [target2, setTarget2] = useState("");
  const [numVal, setNumVal] = useState("2");
  const [ruleText, setRuleText] = useState("");

  // Rules/help UX
  const [rulesOpen, setRulesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

  const [deckImportText, setDeckImportText] = useState("");

  // Connection status
  const [connected, setConnected] = useState(true);

  // QR Join
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // visible flip delay
  const flipDelayMs = 520;

  // prevent duplicate draw events on reconnect
  const lastDrawnCardId = useRef<string | null>(null);

  // timer tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!code) return;
    if (!playerId) {
      router.replace(`/join?code=${encodeURIComponent(code)}`);
      return;
    }
  }, [code, playerId, router]);

  useEffect(() => {
    if (!code) return;
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onState = ({ room }: any) => {
      setRoom(room);

      // Sync SFX toggle from room settings (host-controlled)
      if (typeof room?.settings?.sfx === "boolean") {
        setSfxEnabled(!!room.settings.sfx);
      }

      // If no active draw, clear local card UI
      if (!room?.currentDraw) {
        setCard(null);
        setFaceUp(false);
        setAnimating(false);
        setResolverOpen(false);
        lastDrawnCardId.current = null;
      }
    };

    const onDrawn = ({ card }: any) => {
      if (lastDrawnCardId.current === card?.id) return;
      lastDrawnCardId.current = card?.id;

      setFeed(null);
      setCard(card);

      setFaceUp(false);
      setAnimating(true);
      setResolverOpen(false);

      setTarget1("");
      setTarget2("");
      setNumVal("2");
      setRuleText("");

      sfx.draw();

      setTimeout(() => {
        sfx.flip();
        setFaceUp(true);
      }, flipDelayMs);

      setTimeout(() => setAnimating(false), flipDelayMs + 260);
    };

    const onEffect = ({ message, room }: any) => {
      setFeed(message);
      setRoom(room);
    };

    const onNudged = ({ toPlayerId, fromName }: any) => {
      if (!playerId) return;
      if (toPlayerId !== playerId) return;
      toast({ kind: "info", title: "Nudge", message: `${fromName} is waiting on you.` });
      try {
        if (room?.settings?.haptics && typeof navigator !== "undefined" && (navigator as any).vibrate) {
          (navigator as any).vibrate([60, 60, 120]);
        }
      } catch {}
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("room:state", onState);
    socket.on("card:drawn", onDrawn);
    socket.on("effect:applied", onEffect);
    socket.on("player:nudged", onNudged);

    socket.emit("room:sync", { roomCode: code }, (res: any) => {
      if (res?.error) toast({ kind: "error", title: "Sync failed", message: String(res.error) });
    });

    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      socket.off("room:state", onState);
      socket.off("card:drawn", onDrawn);
      socket.off("effect:applied", onEffect);
      socket.off("player:nudged", onNudged);
    };
  }, [code, toast]);

  const playersSorted = useMemo(() => {
    if (!room?.players) return [];
    return room.players.slice().sort((a: any, b: any) => a.seatIndex - b.seatIndex);
  }, [room]);

  const currentPlayer = useMemo(() => {
    if (!room?.players) return null;
    return room.players.find((p: any) => p.seatIndex === room.turnIndex) || null;
  }, [room]);

  const me = useMemo(() => {
    if (!room?.players || !playerId) return null;
    return room.players.find((p: any) => p.playerId === playerId) || null;
  }, [room, playerId]);

  const isMyTurn = !!me && !!currentPlayer && me.playerId === currentPlayer.playerId;
  const isHost = !!me && me.seatIndex === 0;

  const spectators = useMemo(() => {
    return (room?.spectators || []) as any[];
  }, [room]);

  const waitingOnAcks = !!room?.awaitingAcksForCardId;

  const remainingSeconds =
    room?.turnTimer?.enabled
      ? Math.max(0, Math.ceil((room.turnTimer.endsAt - Date.now()) / 1000))
      : null;

  const kind = (card?.resolution?.kind as string | undefined) ?? "none";
  const requiresInputs = !!card && kind !== "none";

  useEffect(() => {
    if (!card) return;
    if (!isMyTurn) return;
    if (!faceUp) return;
    if (!requiresInputs) return;
    setResolverOpen(true);
  }, [card, isMyTurn, faceUp, requiresInputs]);

  const drawDisabled = !room || !isMyTurn || !!room.currentDraw || waitingOnAcks || animating;

  const draw = () => {
    if (!room || !playerId) return;
    const socket = getSocket();
    sfx.click();

    socket.emit("turn:draw", { roomCode: room.roomCode, playerId }, (res: any) => {
      if (res?.error) {
        sfx.error();
        toast({ kind: "error", title: "Cannot draw", message: String(res.error) });
      }
    });
  };

  const buildResolution = (): { ok: boolean; error?: string; resolution?: ResolutionDraft } => {
    if (!card) return { ok: false, error: "No card." };

    if (kind === "none") return { ok: true, resolution: {} };

    if (kind === "chooseTarget") {
      if (!target1) return { ok: false, error: "Pick a target player." };
      return { ok: true, resolution: { targetPlayerId: target1 } };
    }

    if (kind === "chooseTwoTargets") {
      if (!target1 || !target2) return { ok: false, error: "Pick two players." };
      if (target1 === target2) return { ok: false, error: "Targets must be different." };
      return { ok: true, resolution: { targetPlayerId: target1, targetPlayerId2: target2 } };
    }

    if (kind === "chooseNumber") {
      const n = Number(numVal);
      if (!Number.isFinite(n)) return { ok: false, error: "Enter a valid number." };
      return { ok: true, resolution: { numberValue: n } };
    }

    if (kind === "chooseTargetAndNumber") {
      if (!target1) return { ok: false, error: "Pick a target player." };
      const n = Number(numVal);
      if (!Number.isFinite(n)) return { ok: false, error: "Enter a valid number." };
      return { ok: true, resolution: { targetPlayerId: target1, numberValue: n } };
    }

    if (kind === "createRuleText") {
      const t = ruleText.trim();
      if (!t) return { ok: false, error: "Type a rule." };
      return { ok: true, resolution: { ruleText: t } };
    }

    return { ok: true, resolution: {} };
  };

  const resolve = () => {
    if (!room || !playerId || !card) return;
    if (!isMyTurn)
      return toast({ kind: "error", title: "Not your turn", message: "Only the active player can resolve." });
    if (waitingOnAcks) return toast({ kind: "info", title: "Waiting", message: "Confirmations are pending." });

    const built = buildResolution();
    if (!built.ok) {
      sfx.error();
      toast({ kind: "error", title: "Missing input", message: built.error! });
      return;
    }

    const socket = getSocket();
    sfx.click();

    socket.emit(
      "card:resolve",
      { roomCode: room.roomCode, playerId, cardId: card.id, resolution: built.resolution },
      (res: any) => {
        if (res?.error) {
          sfx.error();
          toast({ kind: "error", title: "Resolve failed", message: String(res.error) });
          return;
        }
        setResolverOpen(false);
        toast({ kind: "success", title: "Resolved", message: "Card resolved." });
      }
    );
  };

  const rulesCount = room?.activeEffects?.rules?.length ?? 0;

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
  }, [code]);

  useEffect(() => {
    if (!qrOpen) return;
    if (!joinUrl) return;

    (async () => {
      try {
        const url = await QRCode.toDataURL(joinUrl, { margin: 1, scale: 8 });
        setQrDataUrl(url);
      } catch {
        setQrDataUrl("");
      }
    })();
  }, [qrOpen, joinUrl]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      sfx.confirm();
      toast({ kind: "success", title: "Copied", message: label });
    } catch {
      sfx.error();
      toast({
        kind: "error",
        title: "Copy failed",
        message: "Clipboard not available. Long-press to copy manually."
      });
    }
  };

  const myPendingAcks: PendingAck[] = useMemo(() => {
    const list = (room?.pendingAcks || []) as PendingAck[];
    return list.filter((a) => a.status === "pending" && a.assignedToPlayerId === playerId);
  }, [room, playerId]);

  const activeAck = myPendingAcks[0] || null;

  const confirmAck = () => {
    if (!activeAck || !room || !playerId) return;
    const socket = getSocket();
    sfx.confirm();
    socket.emit("ack:confirm", { roomCode: room.roomCode, playerId, ackId: activeAck.ackId }, (res: any) => {
      if (res?.error) {
        sfx.error();
        toast({ kind: "error", title: "Confirm failed", message: String(res.error) });
      }
    });
  };

  const nudgeTurnPlayer = () => {
    if (!room || !playerId || !currentPlayer) return;
    const socket = getSocket();
    sfx.click();
    socket.emit(
      "turn:nudge",
      { roomCode: room.roomCode, fromPlayerId: playerId, toPlayerId: currentPlayer.playerId },
      (res: any) => {
        if (res?.error) toast({ kind: "error", title: "Nudge failed", message: String(res.error) });
        else toast({ kind: "success", title: "Nudged", message: `${currentPlayer.name} was nudged.` });
      }
    );
  };

  const patchSettings = (patch: any) => {
    if (!room || !playerId) return;
    const socket = getSocket();
    socket.emit("room:updateSettings", { roomCode: room.roomCode, playerId, patch }, (res: any) => {
      if (res?.error) toast({ kind: "error", title: "Settings", message: String(res.error) });
    });
  };

  const importDeck = () => {
    if (!room || !playerId) return;
    try {
      const parsed = JSON.parse(deckImportText);
      const order = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.deckOrder) ? parsed.deckOrder : [];
      const socket = getSocket();
      socket.emit("room:setDeck", { roomCode: room.roomCode, playerId, deckOrder: order }, (res: any) => {
        if (res?.error) toast({ kind: "error", title: "Deck", message: String(res.error) });
        else {
          toast({ kind: "success", title: "Deck loaded", message: "Custom deck applied." });
          setDeckOpen(false);
        }
      });
    } catch {
      toast({ kind: "error", title: "Deck", message: "Invalid JSON. Paste an array of card IDs or { deckOrder: [...] }" });
    }
  };

  if (!room) {
    return (
      <BrandShell>
        <Panel>
          <PanelBody>
            <div className="text-white/70">Loading room…</div>
          </PanelBody>
        </Panel>
      </BrandShell>
    );
  }

  const badge = card ? String(card.type).toUpperCase() : "";

  return (
    <BrandShell subtitle="Sociables — polished prototype">
      {/* Top “Your Turn” banner */}
      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            className="fixed top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm font-semibold shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
          >
            Your turn — draw when ready
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {historyOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setHistoryOpen(false)} />
            <motion.div
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">History</div>
                  <div className="text-sm text-white/60">Recent draws, resolves, nudges, and settings.</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setHistoryOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-auto pr-1">
                {(room.log || []).length ? (
                  <ul className="space-y-2 text-sm text-white/85">
                    {room.log
                      .slice(-60)
                      .reverse()
                      .map((l: any, idx: number) => (
                        <li key={`${l.ts}_${idx}`} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-white/85">{l.text}</div>
                            <div className="text-[10px] text-white/45 whitespace-nowrap">
                              {new Date(l.ts).toLocaleTimeString()}
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="text-sm text-white/60">No history yet.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal (host controls) */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setSettingsOpen(false)} />
            <motion.div
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Room Settings</div>
                  <div className="text-sm text-white/60">Host-controlled. Changes apply to everyone.</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
              </div>

              {!isHost ? (
                <div className="mt-4 text-sm text-white/70">Only the host can change settings.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
                      onClick={() => patchSettings({ safeMode: !room?.settings?.safeMode })}
                    >
                      <div className="text-sm font-semibold">Safe Mode</div>
                      <div className="text-xs text-white/60">Softens drink-heavy cards in stats + weighting.</div>
                      <div className="mt-1 text-xs text-white/70">{room?.settings?.safeMode ? "ON" : "OFF"}</div>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
                      onClick={() => patchSettings({ dynamicWeighting: !room?.settings?.dynamicWeighting })}
                    >
                      <div className="text-sm font-semibold">Dynamic Weighting</div>
                      <div className="text-xs text-white/60">Reduces repeats and balances card types.</div>
                      <div className="mt-1 text-xs text-white/70">{room?.settings?.dynamicWeighting ? "ON" : "OFF"}</div>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
                      onClick={() => patchSettings({ sfx: !room?.settings?.sfx })}
                    >
                      <div className="text-sm font-semibold">Sound Effects</div>
                      <div className="text-xs text-white/60">Clicks, flips, confirms.</div>
                      <div className="mt-1 text-xs text-white/70">{room?.settings?.sfx ? "ON" : "OFF"}</div>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
                      onClick={() => patchSettings({ haptics: !room?.settings?.haptics })}
                    >
                      <div className="text-sm font-semibold">Haptics</div>
                      <div className="text-xs text-white/60">Mobile vibration for nudges.</div>
                      <div className="mt-1 text-xs text-white/70">{room?.settings?.haptics ? "ON" : "OFF"}</div>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                    <div className="text-sm font-semibold">Theme</div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(["obsidian", "wood", "neon", "dungeon"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={
                            "rounded-xl border px-3 py-2 text-xs capitalize hover:bg-white/10 " +
                            (room?.settings?.theme === t ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5")
                          }
                          onClick={() => patchSettings({ theme: t })}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="secondary" onClick={() => setDeckOpen(true)}>
                      Import Deck
                    </Button>
                    <Button variant="secondary" onClick={() => copyText(JSON.stringify({ deckOrder: room?.settings?.customDeckOrder || room.deckOrder }), "Deck JSON copied")}
                    >
                      Export Deck
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deck Import Modal */}
      <AnimatePresence>
        {deckOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setDeckOpen(false)} />
            <motion.div
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Import Deck</div>
                  <div className="text-sm text-white/60">Paste an array of card IDs, or {`{ deckOrder: [...] }`}.</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setDeckOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4">
                <textarea
                  value={deckImportText}
                  onChange={(e) => setDeckImportText(e.target.value)}
                  placeholder='["f1","r2",...]'
                  className="w-full min-h-[160px] rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white/90 outline-none"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setDeckImportText("")}>Clear</Button>
                <Button variant="primary" onClick={importDeck} disabled={!isHost}>
                  {isHost ? "Apply" : "Host only"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ResolveModal
        open={resolverOpen}
        onClose={() => setResolverOpen(false)}
        onResolve={resolve}
        title={card?.title ?? "Resolve"}
        kind={kind}
        disabled={animating || waitingOnAcks}
        players={playersSorted.map((p: any) => ({ playerId: p.playerId, name: p.name }))}
        target1={target1}
        setTarget1={setTarget1}
        target2={target2}
        setTarget2={setTarget2}
        numVal={numVal}
        setNumVal={setNumVal}
        ruleText={ruleText}
        setRuleText={setRuleText}
      />

      {/* Floating help button even when resolver modal is open */}
      <AnimatePresence>
        {resolverOpen && card && (
          <motion.button
            type="button"
            className="fixed bottom-5 right-5 z-[60] rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15 active:scale-[0.98]"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            onClick={() => setHelpOpen(true)}
          >
            ? Explain
          </motion.button>
        )}
      </AnimatePresence>

      {/* Rules Modal */}
      <AnimatePresence>
        {rulesOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setRulesOpen(false)} />
            <motion.div
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Rules in Play</div>
                  <div className="text-sm text-white/60">These apply to everyone.</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setRulesOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-auto pr-1">
                {rulesCount ? (
                  <ul className="space-y-2 text-sm text-white/85">
                    {room.activeEffects.rules.map((r: any) => (
                      <li key={r.id} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 leading-snug">
                        {r.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-white/60">No active rules.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Help Modal */}
      <AnimatePresence>
        {helpOpen && card && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setHelpOpen(false)} />
            <motion.div
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">What does this mean?</div>
                  <div className="text-sm text-white/60">{card.title}</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setHelpOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 text-sm leading-relaxed text-white/85">{explainFor(card.title)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Join Modal */}
      <AnimatePresence>
        {qrOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setQrOpen(false)} />
            <motion.div
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Join this room</div>
                  <div className="text-sm text-white/60">Scan to open the Join page.</div>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
                  onClick={() => setQrOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Join QR"
                    className="h-[260px] w-[260px] rounded-2xl bg-white p-3"
                  />
                ) : (
                  <div className="text-sm text-white/60">Generating QR…</div>
                )}
              </div>

              <div className="mt-4 text-xs text-white/60 break-all">{joinUrl}</div>

              <div className="mt-3">
                <Button variant="secondary" onClick={() => copyText(joinUrl, "Join link copied")}>
                  Copy Link
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Targeted player confirmation modal */}
      <AnimatePresence>
        {activeAck && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70" />
            <motion.div
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Incoming</div>
                  <div className="text-sm text-white/80">{recipientMessage(room, activeAck)}</div>
                </div>
                <Tag>Action</Tag>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/75 leading-relaxed">
                <span className="text-white/55">Card text:</span> {activeAck.instruction}
              </div>

              <div className="mt-4 text-sm text-white/75 leading-relaxed">
                <span className="text-white/60">Explanation:</span> {explainFor(activeAck.cardTitle)}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setHelpOpen(true)}>
                  ? Explain
                </Button>
                <Button variant="primary" onClick={confirmAck}>
                  Confirm done
                </Button>
              </div>

              <div className="mt-3 text-xs text-white/55">
                The game continues while you confirm. Confirming just keeps everyone synced.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* LEFT */}
        <Panel>
          <PanelBody className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Room</div>
              <Tag>{room.roomCode}</Tag>
            </div>

            {/* Connection status + sharing */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/60">Status</div>
                <Tag>{connected ? "Live" : "Reconnecting…"}</Tag>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button variant="secondary" onClick={() => copyText(room.roomCode, "Room code copied")}>
                  Copy Code
                </Button>
                <Button variant="secondary" onClick={() => copyText(joinUrl, "Join link copied")}>
                  Copy Link
                </Button>
                <Button variant="secondary" onClick={() => setQrOpen(true)}>
                  QR Join
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/60">Turn</div>
              <div className="text-xl font-semibold">{currentPlayer?.name ?? "—"}</div>
              <div className="text-xs text-white/60 mt-1">{isMyTurn ? "You are active" : "Waiting"}</div>

              {!isMyTurn && currentPlayer ? (
                <div className="mt-3">
                  <Button variant="secondary" onClick={nudgeTurnPlayer}>
                    Nudge {currentPlayer.name}
                  </Button>
                </div>
              ) : null}

              <div className="mt-3 text-xs text-white/60">Timer</div>
              {room.turnTimer?.enabled ? (
                <div className="text-lg font-semibold">{remainingSeconds}s</div>
              ) : room.turnTimer && room.turnTimer.enabled === false ? (
                <div className="text-sm text-white/70">{room.turnTimer.reason}</div>
              ) : (
                <div className="text-sm text-white/70">Starts after draw</div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold">Players</div>
              <div className="mt-2 space-y-2">
                {playersSorted.map((p: any) => {
                  const isTurn = p.seatIndex === room.turnIndex;
                  const isMe = p.playerId === playerId;
                  return (
                    <div
                      key={p.playerId}
                      className={"rounded-3xl border bg-white/5 p-3 " + (isTurn ? "border-white/25" : "border-white/10")}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          {isTurn ? "▶ " : ""}
                          {p.name}
                          {isMe ? <span className="text-white/50"> (you)</span> : null}
                          {room?.activeEffects?.rolesByPlayerId?.[p.playerId] ? (
                            <span className="ml-2 text-xs text-white/60">
                              • {room.activeEffects.rolesByPlayerId[p.playerId]}
                            </span>
                          ) : null}
                          {room?.activeEffects?.cursesByPlayerId?.[p.playerId] ? (
                            <span className="ml-2 text-xs text-white/60">
                              • {room.activeEffects.cursesByPlayerId[p.playerId]}
                            </span>
                          ) : null}
                        </div>
                        <Tag>Seat {p.seatIndex + 1}</Tag>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {spectators.length ? (
              <div>
                <div className="text-sm font-semibold">Spectators</div>
                <div className="mt-2 space-y-2">
                  {spectators.map((p: any) => (
                    <div key={p.playerId} className="rounded-3xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white/85">{p.name}</div>
                        <Tag>View</Tag>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">Drink Tracker</div>
              <div className="mt-2 space-y-2 text-sm">
                {playersSorted.map((p: any) => {
                  const st = room?.drinkStats?.[p.playerId] || { given: 0, taken: 0 };
                  return (
                    <div key={p.playerId} className="flex items-center justify-between">
                      <div className="text-white/85">{p.name}</div>
                      <div className="text-white/60">+{st.given} / −{st.taken}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button variant="secondary" onClick={() => setRulesOpen(true)}>
                Rules ({rulesCount})
              </Button>
              <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
                History
              </Button>
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                Settings
              </Button>
            </div>
          </PanelBody>
        </Panel>

        {/* TABLE */}
        <Panel>
          <PanelBody>
            {feed ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <span className="text-white/60">Feed:</span> {feed}
              </div>
            ) : (
              <div className="text-sm text-white/60">Draw a card when it’s your turn.</div>
            )}

            <LayoutGroup>
              <div className="mt-7 grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 items-center">
                {/* DECK */}
                <div className="flex justify-center">
                  <div className="relative w-[220px] max-w-full">
                    <div className="absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-3xl border border-white/10 bg-white/5" />
                    <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-3xl border border-white/12 bg-white/5" />
                    <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-3xl border border-white/14 bg-white/5" />

                    {!card ? (
                      <motion.div layoutId="active-card">
                        <PlayingCard faceUp={false} />
                        <div className="absolute inset-0 flex items-end justify-center pb-3">
                          <div className="w-[92%]">
                            <Button variant="primary" onClick={draw} disabled={drawDisabled}>
                              Draw
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="relative w-full aspect-[2.5/3.5] rounded-3xl border border-white/10 bg-white/5 opacity-50" />
                    )}
                  </div>
                </div>

                {/* ACTIVE */}
                <div className="flex justify-center">
                  <div className="w-[360px] max-w-full">
                    <AnimatePresence mode="wait">
                      {card ? (
                        <motion.div
                          key={card.id}
                          layoutId="active-card"
                          transition={{ type: "spring", stiffness: 520, damping: 36 }}
                        >
                          <PlayingCard faceUp={faceUp} badge={badge} title={card.title} body={card.body} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="placeholder"
                          className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/60 text-sm"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          No card in play. Draw from the deck.
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {card ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Button
                          variant="secondary"
                          onClick={() => setResolverOpen(true)}
                          disabled={!isMyTurn || waitingOnAcks || animating || !faceUp}
                        >
                          Resolve
                        </Button>

                        <Button variant="ghost" onClick={() => setHelpOpen(true)} disabled={!faceUp}>
                          ? Explain
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* DISCARD */}
                <div className="flex justify-center">
                  <div className="relative w-[220px] max-w-full">
                    <div className="text-sm font-semibold mb-2 text-center">Discard</div>
                    <div className="relative w-full aspect-[2.5/3.5] rounded-3xl border border-white/15 bg-white/5 flex items-center justify-center">
                      <div className="text-xs text-white/55 tracking-[0.24em]">
                        {room.discard?.length ? `${room.discard.length} cards` : "Empty"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </LayoutGroup>
          </PanelBody>
        </Panel>
      </div>
    </BrandShell>
  );
}
