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

// ====================
// TRUTH OR DRINK TYPES
// ====================
type TruthSession = {
  id: string;
  askerId: string;
  targetId: string;
  card: {
    id: string;
    question: string;
    intensity: 1 | 2 | 3;
    category: string;
  };
  status: "asked" | "answered" | "drank" | "skipped";
  answer?: string;
  startTime: number;
  timer?: number;
};

type WouldYouRatherSession = {
  question: string;
  optionA: string;
  optionB: string;
  initiatedBy: string;
  timer: number;
};

type RPSChallenge = {
  id: string;
  challengerId: string;
  targetId: string;
  challengerChoice?: "rock" | "paper" | "scissors";
  targetChoice?: "rock" | "paper" | "scissors";
  status: "pending" | "challenger-chose" | "target-chose" | "resolved";
  winnerId?: string;
  loserId?: string;
};

const CARD_HELP: Record<string, string> = {
  "Question Master":
    "While you're Question Master, anyone who answers a question you ask must drink. Avoid answering questions yourself.",
  "Sociables!": 'Everyone yells "Sociables!" immediately and drinks.',
  "Make a Rule":
    "Create a new rule. Anyone who breaks it must drink until the rule is cleared.",
  "Never Have I Ever":
    "Say something you've never done. Anyone who HAS done it takes a drink.",

  // Common "give drinks" variants (covers different deck title spellings)
  "Give Two Drinks":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm.",
  "Give 2":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm.",
  "Give 2 Drinks":
    "The active player chooses someone to drink twice. If you're chosen, take 2 drinks and tap Confirm.",
  
  // NEW: Truth or Drink Cards
  "Truth or Drink":
    "Choose a player. They must answer a truth question or take 2 drinks.",
  "Would You Rather":
    "Create a 'Would You Rather' question. Everyone secretly chooses A or B. Minority drinks (if tie, everyone drinks).",
  "Rock Paper Scissors":
    "Challenge someone to Rock Paper Scissors. Loser takes 2 drinks."
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

// ====================
// TRUTH OR DRINK MODAL COMPONENTS
// ====================

function TruthOrDrinkModal({ 
  session, 
  playerId, 
  roomCode, 
  onClose 
}: { 
  session: TruthSession; 
  playerId: string; 
  roomCode: string; 
  onClose: () => void 
}) {
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(session.timer || 30);
  const socket = getSocket();
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (playerId === session.targetId) {
            socket.emit("truth:drink", { roomCode, sessionId: session.id });
            onClose();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  const handleAnswer = () => {
    if (answer.trim()) {
      socket.emit("truth:answer", { roomCode, sessionId: session.id, answer });
      onClose();
    }
  };
  
  const handleDrink = () => {
    socket.emit("truth:drink", { roomCode, sessionId: session.id });
    onClose();
  };
  
  if (playerId === session.targetId) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal truth-modal">
          <h2>Truth or Drink! ⏱️ {timeLeft}s</h2>
          <p className="truth-question">"{session.card.question}"</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer..."
            rows={3}
            className="truth-textarea"
          />
          <div className="truth-buttons">
            <button onClick={handleAnswer} className="btn-truth">
              🗣️ Answer Truthfully
            </button>
            <button onClick={handleDrink} className="btn-drink">
              🍻 Take 2 Drinks Instead
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal truth-modal spectator">
        <h2>Truth or Drink!</h2>
        <p><strong>{session.targetId === playerId ? "You" : "Another player"}</strong> has been asked:</p>
        <p className="truth-question">"{session.card.question}"</p>
        <p>Waiting for response... {timeLeft}s</p>
      </div>
    </div>
  );
}

function WouldYouRatherModal({
  session,
  playerId,
  roomCode,
  onClose
}: {
  session: WouldYouRatherSession;
  playerId: string;
  roomCode: string;
  onClose: () => void
}) {
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  const socket = getSocket();
  
  const handleVote = (option: 'A' | 'B') => {
    setSelected(option);
    socket.emit("would-you-rather:vote", { roomCode, option });
    onClose();
  };
  
  const questionParts = session.question.split(" OR ");
  const optionA = questionParts[0]?.trim() || session.optionA;
  const optionB = questionParts[1]?.trim() || session.optionB;
  
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wyr-modal">
        <h2>Would You Rather</h2>
        <p className="initiated-by">Asked by: {session.initiatedBy}</p>
        <p className="wyr-question">{session.question}</p>
        
        <div className="wyr-options">
          <button 
            onClick={() => handleVote('A')} 
            className={`wyr-option ${selected === 'A' ? 'selected' : ''}`}
            disabled={selected !== null}
          >
            <div className="wyr-letter">A</div>
            <div className="wyr-text">{optionA}</div>
          </button>
          
          <div className="wyr-or">OR</div>
          
          <button 
            onClick={() => handleVote('B')} 
            className={`wyr-option ${selected === 'B' ? 'selected' : ''}`}
            disabled={selected !== null}
          >
            <div className="wyr-letter">B</div>
            <div className="wyr-text">{optionB}</div>
          </button>
        </div>
        
        <p className="wyr-instruction">
          {selected 
            ? "Vote submitted! Waiting for others..." 
            : "Minority drinks 2! (If tie, everyone drinks 1)"}
        </p>
        
        {session.timer > 0 && (
          <p className="wyr-timer">⏱️ {session.timer}s remaining</p>
        )}
      </div>
    </div>
  );
}

function RPSModal({
  challenge,
  playerId,
  roomCode,
  challengerName,
  targetName,
  onClose
}: {
  challenge: RPSChallenge;
  playerId: string;
  roomCode: string;
  challengerName: string;
  targetName: string;
  onClose: () => void
}) {
  const [choice, setChoice] = useState<'rock' | 'paper' | 'scissors' | null>(null);
  const socket = getSocket();
  
  const isChallenger = playerId === challenge.challengerId;
  const isTarget = playerId === challenge.targetId;
  const isParticipant = isChallenger || isTarget;
  
  const handleChoice = (selected: 'rock' | 'paper' | 'scissors') => {
    if (!isParticipant) return;
    
    setChoice(selected);
    socket.emit("rps:choose", { 
      roomCode, 
      challengeId: challenge.id, 
      choice: selected 
    });
  };
  
  const choices = [
    { id: 'rock' as const, emoji: '✊', label: 'Rock' },
    { id: 'paper' as const, emoji: '✋', label: 'Paper' },
    { id: 'scissors' as const, emoji: '✌️', label: 'Scissors' }
  ];
  
  if (!isParticipant) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal rps-modal spectator">
          <h2>Rock Paper Scissors! 🪨📄✂️</h2>
          <p><strong>{challengerName}</strong> vs <strong>{targetName}</strong></p>
          <div className="rps-choices-display">
            {choices.map((c) => (
              <div key={c.id} className="rps-choice-display">
                <span className="rps-emoji">{c.emoji}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
          <p>Waiting for players to choose...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal rps-modal">
        <h2>Rock Paper Scissors! 🪨📄✂️</h2>
        <p>You're playing against {isChallenger ? targetName : challengerName}</p>
        <p className="rps-stakes">Loser drinks 2! 🍻🍻</p>
        
        <div className="rps-choices">
          {choices.map((c) => (
            <button
              key={c.id}
              onClick={() => handleChoice(c.id)}
              className={`rps-choice-btn ${choice === c.id ? 'selected' : ''}`}
              disabled={choice !== null || challenge.status !== "pending"}
            >
              <span className="rps-emoji-big">{c.emoji}</span>
              <span className="rps-label">{c.label}</span>
            </button>
          ))}
        </div>
        
        {choice && (
          <p className="rps-waiting">
            You chose: {choice} - Waiting for opponent...
          </p>
        )}
        
        {(challenge.status === "challenger-chose" || challenge.status === "target-chose") && !choice && (
          <p className="rps-waiting">
            Opponent has chosen! Make your selection.
          </p>
        )}
      </div>
    </div>
  );
}

// Helper function to get player name by ID
function getPlayerNameById(room: any, id: string): string {
  const player = room?.players?.find((p: any) => p.playerId === id);
  const spectator = room?.spectators?.find((s: any) => s.playerId === id);
  return player?.name || spectator?.name || id;
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
  
  // Kick declarations
  const [kickConfirmOpen, setKickConfirmOpen] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<{playerId: string; name: string} | null>(null);
  
  // Close room
  const [closeRoomConfirmOpen, setCloseRoomConfirmOpen] = useState(false);

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

  // ====================
  // NEW: TRUTH OR DRINK STATES
  // ====================
  const [currentTruthSession, setCurrentTruthSession] = useState<TruthSession | null>(null);
  const [currentWouldYouRather, setCurrentWouldYouRather] = useState<WouldYouRatherSession | null>(null);
  const [currentRPSChallenge, setCurrentRPSChallenge] = useState<RPSChallenge | null>(null);
  const [truthAnswerInput, setTruthAnswerInput] = useState<string>("");

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

    // ====================
    // NEW: TRUTH OR DRINK SOCKET LISTENERS
    // ====================
    const onTruthAsked = (data: any) => {
      console.log("🔍 Truth asked:", data);
      setCurrentTruthSession(data.session);
    };

    const onTruthAnswered = (data: any) => {
      console.log("🔍 Truth answered:", data);
      setCurrentTruthSession(null);
      toast({ 
        kind: "info", 
        title: "Truth Answered", 
        message: `${data.session.targetId === playerId ? "You" : "Someone"} answered a truth question.` 
      });
    };

    const onTruthDrank = (data: any) => {
      console.log("🔍 Player drank instead:", data);
      setCurrentTruthSession(null);
      toast({ 
        kind: "warning", 
        title: "Drank Instead", 
        message: `${data.session.targetId === playerId ? "You" : "Someone"} chose to drink instead of answering.` 
      });
    };

    const onWouldYouRatherStart = (data: any) => {
      console.log("🔍 Would You Rather:", data);
      setCurrentWouldYouRather(data);
    };

    const onWouldYouRatherResult = (data: any) => {
      console.log("🔍 WYR Result:", data);
      setCurrentWouldYouRather(null);
      toast({ 
        kind: data.aCount === data.bCount ? "warning" : "info", 
        title: "Would You Rather Result", 
        message: data.message 
      });
    };

    const onRPSChallenge = (data: any) => {
      console.log("🔍 RPS Challenge:", data);
      setCurrentRPSChallenge(data.challenge);
    };

    const onRPSChoiceMade = (data: any) => {
      console.log("🔍 RPS choice made:", data);
      if (currentRPSChallenge) {
        const updatedChallenge = { ...currentRPSChallenge };
        if (data.playerId === updatedChallenge.challengerId) {
          updatedChallenge.challengerChoice = data.choice;
          updatedChallenge.status = "challenger-chose";
        } else if (data.playerId === updatedChallenge.targetId) {
          updatedChallenge.targetChoice = data.choice;
          updatedChallenge.status = "target-chose";
        }
        setCurrentRPSChallenge(updatedChallenge);
      }
    };

    const onRPSResult = (data: any) => {
      console.log("🔍 RPS result:", data);
      setCurrentRPSChallenge(null);
      toast({ 
        kind: data.result === "tie" ? "warning" : "info", 
        title: "Rock Paper Scissors Result", 
        message: data.message 
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("room:state", onState);
    socket.on("card:drawn", onDrawn);
    socket.on("effect:applied", onEffect);
    socket.on("player:nudged", onNudged);

    // NEW: Truth or Drink listeners
    socket.on("truth:asked", onTruthAsked);
    socket.on("truth:answered", onTruthAnswered);
    socket.on("truth:drank", onTruthDrank);
    socket.on("would-you-rather:start", onWouldYouRatherStart);
    socket.on("would-you-rather:result", onWouldYouRatherResult);
    socket.on("rps:challenge", onRPSChallenge);
    socket.on("rps:choice-made", onRPSChoiceMade);
    socket.on("rps:result", onRPSResult);

    socket.on("kicked", (data: any) => {
      toast({ 
        kind: "error", 
        title: "Kicked", 
        message: data?.message || "You were kicked from the room" 
      });
      setTimeout(() => {
        router.push("/");
      }, 2000);
    });

    socket.on("room:closed", (data: any) => {
      toast({ 
        kind: "info", 
        title: "Room Closed", 
        message: data?.message || "The room has been closed" 
      });
      setTimeout(() => {
        router.push("/");
      }, 2000);
    });

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

      // NEW: Clean up Truth or Drink listeners
      socket.off("truth:asked", onTruthAsked);
      socket.off("truth:answered", onTruthAnswered);
      socket.off("truth:drank", onTruthDrank);
      socket.off("would-you-rather:start", onWouldYouRatherStart);
      socket.off("would-you-rather:result", onWouldYouRatherResult);
      socket.off("rps:challenge", onRPSChallenge);
      socket.off("rps:choice-made", onRPSChoiceMade);
      socket.off("rps:result", onRPSResult);

      socket.off("kicked");
      socket.off("room:closed");
    };
  }, [code, toast, playerId, router]);

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
  const kickPlayer = (targetPlayerId: string, targetPlayerName: string) => {
  if (!room || !playerId) return;
  
  if (!window.confirm(`Kick ${targetPlayerName} from the room?`)) {
    return;
  }
  
  const socket = getSocket();
  sfx.click();
  
  socket.emit("host:kick", { roomCode: room.roomCode, targetPlayerId }, (res: any) => {
    if (res?.error) {
      sfx.error();
      toast({ kind: "error", title: "Kick failed", message: String(res.error) });
    } else {
      toast({ kind: "success", title: "Player kicked", message: `${targetPlayerName} was removed from the room.` });
    }
  });
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
      {/* ==================== */}
      {/* TRUTH OR DRINK MODALS */}
      {/* ==================== */}
      
      {/* Truth or Drink Modal */}
      {currentTruthSession && (
        <TruthOrDrinkModal
          session={currentTruthSession}
          playerId={playerId || ""}
          roomCode={code}
          onClose={() => setCurrentTruthSession(null)}
        />
      )}

      {/* Would You Rather Modal */}
      {currentWouldYouRather && (
        <WouldYouRatherModal
          session={currentWouldYouRather}
          playerId={playerId || ""}
          roomCode={code}
          onClose={() => setCurrentWouldYouRather(null)}
        />
      )}

      {/* Rock Paper Scissors Modal */}
      {currentRPSChallenge && room && (
        <RPSModal
          challenge={currentRPSChallenge}
          playerId={playerId || ""}
          roomCode={code}
          challengerName={getPlayerNameById(room, currentRPSChallenge.challengerId)}
          targetName={getPlayerNameById(room, currentRPSChallenge.targetId)}
          onClose={() => setCurrentRPSChallenge(null)}
        />
      )}

      {/* Top "Your Turn" banner */}
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
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
			{/* ========== ADD PLAYER MANAGEMENT SECTION HERE ========== */}
			<div className="rounded-2xl border border-white/10 bg-black/30 p-4">
			  <div className="text-sm font-semibold mb-3">Player Management</div>
			  <div className="space-y-2">
				{playersSorted.map((p: any) => {
				  const isCurrentPlayer = p.playerId === playerId;
				  const isPlayerHost = p.seatIndex === 0;
				  
				  return (
					<div 
					  key={p.playerId} 
					  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
					>
					  <div className="min-w-0">
						<div className="font-semibold truncate">
						  {p.name}
						  {isCurrentPlayer && <span className="text-white/60 ml-2">(you)</span>}
						  {isPlayerHost && <span className="text-white/60 ml-2">(host)</span>}
						</div>
						<div className="text-xs text-white/60">
						  Seat {p.seatIndex + 1} • {p.connected ? "Online" : "Offline"}
						</div>
					  </div>
					  
					  {!isPlayerHost && !isCurrentPlayer && (
						<button
						  type="button"
						  onClick={() => {
							sfx.click();
							setPlayerToKick({ playerId: p.playerId, name: p.name });
							setKickConfirmOpen(true);
						  }}
						  className="rounded-xl border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
						>
						  Kick
						</button>
					  )}
					  
					  {(isPlayerHost || isCurrentPlayer) && (
						<div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40">
						  {isPlayerHost ? "Host" : "You"}
						</div>
					  )}
					</div>
				  );
				})}
			  </div>
			  
		{/* Kick Confirmation Modal */}
		<AnimatePresence>
		  {kickConfirmOpen && playerToKick && (
			<motion.div
			  className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
			  initial={{ opacity: 0 }}
			  animate={{ opacity: 1 }}
			  exit={{ opacity: 0 }}
			>
			  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setKickConfirmOpen(false)} />
			  <motion.div
				className="relative w-full max-w-md rounded-3xl border border-white/15 bg-black/80 p-5 shadow-[0_40px_120px rgba(0,0,0,0.8)]"
				initial={{ y: 18, scale: 0.98, opacity: 0 }}
				animate={{ y: 0, scale: 1, opacity: 1 }}
				exit={{ y: 18, scale: 0.98, opacity: 0 }}
				transition={{ type: "spring", stiffness: 520, damping: 40 }}
				onClick={(e) => e.stopPropagation()}
			  >
				<div className="flex items-start justify-between gap-4 mb-4">
				  <div>
					<div className="text-xl font-semibold">Kick Player</div>
					<div className="text-sm text-white/60 mt-1">Remove player from the room</div>
				  </div>
				  <button
					type="button"
					className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
					onClick={() => setKickConfirmOpen(false)}
				  >
					Cancel
				  </button>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-5">
				  <div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
					  <span className="text-lg">👤</span>
					</div>
					<div>
					  <div className="font-semibold">{playerToKick.name}</div>
					  <div className="text-xs text-white/60">Will be removed from the game</div>
					</div>
				  </div>
				</div>

				<div className="text-sm text-white/75 mb-5 leading-relaxed">
				  This player will be immediately removed from the room and won't be able to rejoin unless invited again.
				</div>

				<div className="grid grid-cols-2 gap-3">
				  <button
					type="button"
					className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-semibold hover:bg-white/10 active:scale-[0.98] transition"
					onClick={() => setKickConfirmOpen(false)}
				  >
					Cancel
				  </button>
				  <button
					type="button"
					className="rounded-2xl border border-red-500/40 bg-red-500/20 px-4 py-3 font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
					onClick={() => {
					  if (!room || !playerId || !playerToKick) return;
					  
					  const socket = getSocket();
					  sfx.click();
					  
					  socket.emit("host:kick", { 
						roomCode: room.roomCode, 
						targetPlayerId: playerToKick.playerId 
					  }, (res: any) => {
						if (res?.error) {
						  sfx.error();
						  toast({ kind: "error", title: "Kick failed", message: String(res.error) });
						} else {
						  sfx.confirm();
						  toast({ kind: "success", title: "Player kicked", message: `${playerToKick.name} was removed.` });
						}
						setKickConfirmOpen(false);
						setPlayerToKick(null);
					  });
					}}
				  >
					Confirm Kick
				  </button>
				</div>
			  </motion.div>
			</motion.div>
		  )}
		</AnimatePresence>
		
		{/* Close Room Confirmation Modal */}
		<AnimatePresence>
		  {closeRoomConfirmOpen && (
			<motion.div
			  className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
			  initial={{ opacity: 0 }}
			  animate={{ opacity: 1 }}
			  exit={{ opacity: 0 }}
			>
			  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCloseRoomConfirmOpen(false)} />
			  <motion.div
				className="relative w-full max-w-md rounded-3xl border border-white/15 bg-black/80 p-5 shadow-[0_40px_120px rgba(0,0,0,0.8)]"
				initial={{ y: 18, scale: 0.98, opacity: 0 }}
				animate={{ y: 0, scale: 1, opacity: 1 }}
				exit={{ y: 18, scale: 0.98, opacity: 0 }}
				transition={{ type: "spring", stiffness: 520, damping: 40 }}
				onClick={(e) => e.stopPropagation()}
			  >
				<div className="flex items-start justify-between gap-4 mb-4">
				  <div>
					<div className="text-xl font-semibold">Close Room</div>
					<div className="text-sm text-white/60 mt-1">End the game for everyone</div>
				  </div>
				  <button
					type="button"
					className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
					onClick={() => setCloseRoomConfirmOpen(false)}
				  >
					Cancel
				  </button>
				</div>

				<div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 mb-5">
				  <div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
					  <span className="text-lg">⚠️</span>
					</div>
					<div>
					  <div className="font-semibold text-red-300">This will end the game</div>
					  <div className="text-xs text-red-300/70">All players will be disconnected</div>
					</div>
				  </div>
				</div>

				<div className="text-sm text-white/75 mb-5 leading-relaxed">
				  Closing the room will immediately end the game for all {room?.players?.length || 0} player{room?.players?.length !== 1 ? 's' : ''}. 
				  The room code will become invalid and everyone will be returned to the home page.
				</div>

				<div className="grid grid-cols-2 gap-3">
				  <button
					type="button"
					className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-semibold hover:bg-white/10 active:scale-[0.98] transition"
					onClick={() => setCloseRoomConfirmOpen(false)}
				  >
					Cancel
				  </button>
				  <button
					type="button"
					className="rounded-2xl border border-red-500/40 bg-red-500/20 px-4 py-3 font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
					onClick={() => {
					  const socket = getSocket();
					  sfx.click();
					  socket.emit("host:close-room", { roomCode: room.roomCode }, (res: any) => {
						if (res?.error) {
						  sfx.error();
						  toast({ kind: "error", title: "Failed", message: String(res.error) });
						}
						setCloseRoomConfirmOpen(false);
					  });
					}}
				  >
					Close Room
				  </button>
				</div>
			  </motion.div>
			</motion.div>
		  )}
		</AnimatePresence>
			  
			  {/* Close Room Button */}
			  <div className="mt-4 pt-3 border-t border-white/10">
				<button
					  type="button"
					  onClick={() => {
						sfx.click();
						setCloseRoomConfirmOpen(true);
					  }}
					  className="w-full rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/30 active:scale-[0.98] transition"
					>
					  Close Room (End Game)
					</button>
				<div className="mt-1 text-xs text-white/60 text-center">
				  This ends the game for all players
				</div>
			  </div>
			</div>
			{/* ========== END PLAYER MANAGEMENT SECTION ========== */}

			{/* KEEP ALL EXISTING SETTINGS CONTROLS BELOW - DON'T TOUCH THESE */}
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
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0c0d] p-5 shadow-[0_40px_120px rgba(0,0,0,0.7)]"
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
              <div className="text-sm text-white/60">Draw a card when it's your turn.</div>
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

      {/* CSS Styles for Truth or Drink modals */}
      <style jsx global>{`
        /* Truth or Drink Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          padding: 20px;
        }

        .modal {
          background: white;
          padding: 2rem;
          border-radius: 16px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: modalAppear 0.3s ease-out;
        }

        @keyframes modalAppear {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Truth Modal */
        .truth-modal h2 {
          color: #d32f2f;
          margin-bottom: 1rem;
          font-size: 1.8rem;
        }

        .truth-question {
          font-size: 1.3rem;
          font-style: italic;
          margin: 1.5rem 0;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 12px;
          border-left: 4px solid #d32f2f;
          line-height: 1.5;
        }

        .truth-textarea {
          width: 100%;
          padding: 1rem;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          margin: 1rem 0;
          resize: vertical;
          min-height: 100px;
          font-family: inherit;
        }

        .truth-textarea:focus {
          outline: none;
          border-color: #d32f2f;
        }

        .truth-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .btn-truth, .btn-drink {
          flex: 1;
          padding: 1rem 1.5rem;
          border: none;
          border-radius: 10px;
          font-size: 1.1rem;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn-truth {
          background: #4CAF50;
          color: white;
        }

        .btn-truth:hover {
          background: #388E3C;
          transform: translateY(-2px);
        }

        .btn-drink {
          background: #f44336;
          color: white;
        }

        .btn-drink:hover {
          background: #d32f2f;
          transform: translateY(-2px);
        }

        .truth-modal.spectator .truth-question {
          border-left-color: #666;
        }

        /* Would You Rather Modal */
        .wyr-modal h2 {
          color: #2196F3;
          margin-bottom: 0.5rem;
        }

        .initiated-by {
          color: #666;
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
        }

        .wyr-question {
          font-size: 1.4rem;
          font-weight: bold;
          margin: 1.5rem 0;
          text-align: center;
          line-height: 1.4;
        }

        .wyr-options {
          margin: 2rem 0;
        }

        .wyr-option {
          display: block;
          width: 100%;
          padding: 1.5rem;
          margin: 1rem 0;
          border: 3px solid #ddd;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          text-align: left;
          transition: all 0.3s;
          position: relative;
        }

        .wyr-option:hover {
          border-color: #2196F3;
          background: #f1f8ff;
          transform: translateX(5px);
        }

        .wyr-option.selected {
          border-color: #2196F3;
          background: #e3f2fd;
        }

        .wyr-option:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .wyr-letter {
          display: inline-block;
          width: 36px;
          height: 36px;
          background: #2196F3;
          color: white;
          border-radius: 50%;
          text-align: center;
          line-height: 36px;
          margin-right: 1rem;
          font-weight: bold;
          font-size: 1.2rem;
        }

        .wyr-text {
          display: inline;
          font-size: 1.1rem;
          vertical-align: middle;
        }

        .wyr-or {
          text-align: center;
          margin: 1rem 0;
          font-weight: bold;
          font-size: 1.2rem;
          color: #666;
          position: relative;
        }

        .wyr-or:before, .wyr-or:after {
          content: "";
          position: absolute;
          top: 50%;
          width: 40%;
          height: 2px;
          background: #ddd;
        }

        .wyr-or:before { left: 0; }
        .wyr-or:after { right: 0; }

        .wyr-instruction {
          text-align: center;
          color: #666;
          font-size: 0.9rem;
          margin-top: 1.5rem;
          padding: 0.5rem;
          background: #f5f5f5;
          border-radius: 6px;
        }

        .wyr-timer {
          text-align: center;
          color: #ff9800;
          font-weight: bold;
          margin-top: 0.5rem;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }

        /* Rock Paper Scissors Modal */
        .rps-modal h2 {
          color: #9C27B0;
          margin-bottom: 0.5rem;
          text-align: center;
        }

        .rps-stakes {
          text-align: center;
          font-size: 1.3rem;
          color: #f44336;
          font-weight: bold;
          margin: 1rem 0;
        }

        .rps-choices {
          display: flex;
          gap: 1rem;
          margin: 2rem 0;
          justify-content: center;
        }

        .rps-choice-btn {
          padding: 1.5rem;
          border: 3px solid #9C27B0;
          border-radius: 12px;
          background: white;
          color: #9C27B0;
          font-size: 1.2rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          min-width: 100px;
        }

        .rps-choice-btn:hover {
          background: #f3e5f5;
          transform: scale(1.05);
        }

        .rps-choice-btn.selected {
          background: #9C27B0;
          color: white;
        }

        .rps-choice-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .rps-emoji-big {
          font-size: 2.5rem;
          display: block;
        }

        .rps-label {
          font-weight: bold;
        }

        .rps-waiting {
          text-align: center;
          color: #666;
          margin-top: 1rem;
          font-style: italic;
        }

        /* Spectator view for RPS */
        .rps-modal.spectator .rps-choices-display {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin: 2rem 0;
        }

        .rps-choice-display {
          text-align: center;
          padding: 1rem;
        }

        .rps-emoji {
          font-size: 2rem;
          display: block;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </BrandShell>
  );
}