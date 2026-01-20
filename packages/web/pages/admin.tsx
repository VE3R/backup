import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { BrandShell } from "../components/BrandShell";
import { Button, Panel, PanelBody, Tag } from "../components/UI";
import { useToast } from "../components/ToastProvider";
import { sfx } from "../lib/sfx";
import { getServerBase } from "../lib/socket";

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

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Password from environment (in production, this would be in .env)
  const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "default_admin_key_change_me_in_production";
  
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
	  
	  // Disconnect existing socket if any
	  if (socket) {
		socket.disconnect();
	  }
	  
	  // Use the same server detection as your main socket
	  const serverBase = getServerBase();
	  const newSocket = io(`${serverBase}/admin`, {
		auth: { adminKey: adminKey.trim() },
		transports: ["websocket", "polling"],
	  });
    
    newSocket.on("connect", () => {
      console.log("Admin socket connected");
      setIsConnected(true);
      setIsAuthenticated(true);
      // Store key in localStorage for convenience
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
    
    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });
    
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
      toast({ kind: "info", title: "Refreshing", message: "Fetching latest room data..." });
    }
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
  
  // Check for stored admin key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("sociables_admin_key");
    if (storedKey) {
      setAdminKey(storedKey);
    }
  }, []);
  
  // Auto-connect if key is stored
  useEffect(() => {
    const storedKey = localStorage.getItem("sociables_admin_key");
    if (storedKey && !socket) {
      setAdminKey(storedKey);
      // Small delay to ensure state is updated
      setTimeout(() => {
        if (storedKey) {
          connectAdminSocket();
        }
      }, 100);
    }
  }, []);
  
  // Auto-refresh rooms every 10 seconds
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-semibold">Room Administration</div>
            <div className="text-white/60">
              {rooms.length} active room{rooms.length !== 1 ? 's' : ''} • 
              {isConnected ? (
                <span className="text-emerald-400 ml-2">Connected</span>
              ) : (
                <span className="text-amber-400 ml-2">Connecting...</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={refreshRooms} disabled={!isConnected}>
              Refresh
            </Button>
            <Button variant="danger" onClick={disconnectAdminSocket}>
              Logout
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Room List - Left Column */}
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
          
          {/* Room Details - Right Column */}
          <div className="lg:col-span-1">
            <Panel>
              <PanelBody>
                <div className="text-lg font-semibold mb-4">
                  {selectedRoomData ? `Room ${selectedRoomData.roomCode}` : "Select a Room"}
                </div>
                
                {selectedRoomData ? (
                  <div className="space-y-4">
                    {/* Room Info */}
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
                    
                    {/* Players */}
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
                    
                    {/* Spectators */}
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
                    
                    {/* Close Room Button */}
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
      </div>
    </BrandShell>
  );
}