export type CardResolution =
  | { kind: "none" }
  | { kind: "chooseTarget"; min: 1; max: 1 }
  | { kind: "chooseNumber"; min: number; max: number }
  | { kind: "chooseTargetAndNumber"; numMin: number; numMax: number }
  | { kind: "chooseTwoTargets"; min: 2; max: 2 }
  | { kind: "createRuleText"; maxLen: number };

export type CardType =
  | "forfeit"
  | "rule"
  | "role"
  | "curse"
  | "event"
  | "joker"
  | "setup"
  | "endgame";

export type Card = {
  id: string;
  deck: "ultimate";
  type: CardType;
  title: string;
  body: string;
  resolution: CardResolution;
};

export type TurnTimer = {
  enabled: boolean;
  endsAt: number;
  secondsTotal: number;
  reason?: string;
};

export type Player = {
  playerId: string;
  name: string;
  seatIndex: number;
  connected: boolean;
  /** spectators can view but cannot take turns */
  mode?: "player" | "spectator";
};

export type PendingAck = {
  ackId: string;
  createdAt: number;
  cardId: string;
  cardTitle: string;
  instruction: string;
  createdByPlayerId: string;
  assignedToPlayerId: string;
  status: "pending" | "confirmed";
  confirmedAt?: number;
  meta?: {
    kind: string;
    numberValue?: number;
    ruleText?: string;
    targets?: string[];
  };
};

export type RoomSettings = {
  safeMode: boolean;
  dynamicWeighting: boolean;
  theme: "obsidian" | "wood" | "neon" | "dungeon";
  sfx: boolean;
  haptics: boolean;
  /** optional custom deck override (card ids) */
  customDeckOrder?: string[];
};

export type DrinkStats = Record<
  string,
  {
    given: number;
    taken: number;
  }
>;

export type RoomLogItem = {
  ts: number;
  type: "system" | "draw" | "resolve" | "ack" | "nudge" | "setting" | "deck";
  text: string;
  actorId?: string;
  cardId?: string;
};

export type ActiveEffects = {
  rules: { id: string; text: string; createdBy: string }[];
  rolesByPlayerId: Record<string, string>;
  cursesByPlayerId: Record<string, string>;
  currentEvent: { id: string; title: string } | null;
};

export type RoomState = {
  roomCode: string;
  deckId: "ultimate";
  deckOrder: string[];
  drawIndex: number;
  discard: string[];
  players: Player[];
  turnIndex: number;
  started: boolean;
  paused: boolean;
  currentDraw: { cardId: string; drawnByPlayerId: string } | null;
  activeEffects: ActiveEffects;
  turnTimer: TurnTimer | null;
  log: RoomLogItem[];

  // Multiplayer UX extras
  pendingAcks?: PendingAck[];
  awaitingAcksForCardId?: string | null;
  settings?: RoomSettings;
  drinkStats?: DrinkStats;
  spectators?: Player[];
};
