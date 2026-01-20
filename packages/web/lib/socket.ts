import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

function getServerBase(): string {
  // Production / Railway
  const env = process.env.NEXT_PUBLIC_SERVER_URL;
  if (env && env.trim().length > 0) return env.trim().replace(/\/$/, "");

  // Dev fallback: same host, port 3001
  if (typeof window !== "undefined") {
    const proto = window.location.protocol; // http or https
    const host = window.location.hostname;
    return `${proto}//${host}:3001`;
  }

  // SSR fallback
  return "http://localhost:3001";
}

/**
 * Returns a singleton Socket.IO client instance.
 * Existing code expects `getSocket()` to exist.
 */
export function getSocket(): Socket {
  if (_socket) return _socket;

  const base = getServerBase();

  _socket = io(base, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    autoConnect: true
  });

  return _socket;
}

/** Optional: helps in tests or if you ever need to force a reconnect. */
export function resetSocket() {
  try {
    _socket?.disconnect();
  } catch {}
  _socket = null;
}

/** Optional: expose base for debugging. */
export function getServerUrlForDebug() {
  return getServerBase();
}
// In packages/web/lib/socket.ts, add to exports:
export function getSocket(): Socket { /* ... */ }
export function resetSocket() { /* ... */ }
export function getServerUrlForDebug() { /* ... */ }
// ========== ADD THIS ==========
export function getServerBase(): string {
  // Production / Railway
  const env = process.env.NEXT_PUBLIC_SERVER_URL;
  if (env && env.trim().length > 0) return env.trim().replace(/\/$/, "");

  // Dev fallback: same host, port 3001
  if (typeof window !== "undefined") {
    const proto = window.location.protocol; // http or https
    const host = window.location.hostname;
    return `${proto}//${host}:3001`;
  }

  // SSR fallback
  return "http://localhost:3001";
}
// ==============================