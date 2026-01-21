import { RoomState, Card } from "./types.js";

export type ClientToServerEvents = {
  "room:create": (p: { name: string }, cb: any) => void;
  "room:join": (p: { roomCode: string; name: string; spectator?: boolean }, cb: any) => void;
  "room:sync": (p: { roomCode: string }, cb: any) => void;
  "game:start": (p: { roomCode: string }, cb: any) => void;
  "turn:draw": (p: { roomCode: string; playerId: string }, cb: any) => void;
  "interaction:rps:choose": (
  p: { roomCode: string; playerId: string; choice: "rock" | "paper" | "scissors" },
  cb: any
) => void;
"interaction:wyr:vote": (p: { roomCode: string; playerId: string; vote: "A" | "B" }, cb: any) => void;

"card:resolve": (
    p: {
      roomCode: string;
      playerId: string;
      cardId: string;
      resolution: {
        targetPlayerId?: string;
        targetPlayerId2?: string;
        numberValue?: number;
        ruleText?: string;
      };
    },
    cb: any
  ) => void;

  "ack:confirm": (p: { roomCode: string; playerId: string; ackId: string }, cb: any) => void;
  "turn:nudge": (p: { roomCode: string; fromPlayerId: string; toPlayerId: string }, cb: any) => void;
  "room:updateSettings": (p: { roomCode: string; playerId: string; patch: any }, cb: any) => void;
  "room:setDeck": (p: { roomCode: string; playerId: string; deckOrder: string[] }, cb: any) => void;
};

export type ServerToClientEvents = {
  "room:state": (p: { room: RoomState }) => void;
  "turn:changed": (p: { turnIndex: number; playerId: string }) => void;
  "card:drawn": (p: { card: Card; drawnByPlayerId: string }) => void;
  "effect:applied": (p: { room: RoomState; message: string }) => void;

  "player:nudged": (p: { roomCode: string; toPlayerId: string; fromName: string }) => void;
};
