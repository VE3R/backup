export function getPlayerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sociables_playerId");
}

export function getRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sociables_roomCode");
}

export function setSession(roomCode: string, playerId: string) {
  localStorage.setItem("sociables_roomCode", roomCode);
  localStorage.setItem("sociables_playerId", playerId);
}

export function clearSession() {
  localStorage.removeItem("sociables_roomCode");
  localStorage.removeItem("sociables_playerId");
}
