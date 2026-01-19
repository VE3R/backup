import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";

import { BrandShell } from "../components/BrandShell";
import { Button, Input, Panel, PanelBody, Tag } from "../components/UI";
import { CardBackMini } from "../components/CardBackMini";
import { getSocket } from "../lib/socket";
import { setSession } from "../lib/storage";
import { useToast } from "../components/ToastProvider";
import { sfx } from "../lib/sfx";

export default function Join() {
  const router = useRouter();
  const { toast } = useToast();

  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [spectator, setSpectator] = useState(false);

  useEffect(() => {
    const q = String(router.query.code || "").trim().toUpperCase();
    if (q) setRoomCode(q);
  }, [router.query.code]);

  const join = () => {
    const socket = getSocket();
    sfx.click();

    socket.emit(
      "room:join",
      { roomCode: roomCode.trim().toUpperCase(), name: name.trim(), spectator },
      (res: any) => {
      if (res?.error) {
        sfx.error();
        toast({ kind: "error", title: "Join failed", message: String(res.error) });
        return;
      }

      setSession(res.roomCode, res.playerId);
      toast({ kind: "success", title: "Joined", message: `Room ${res.roomCode}` });
      router.push(`/room/${res.roomCode}`);
      }
    );
  };

  return (
    <BrandShell subtitle="Join from any phone. No app install.">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
        <Panel>
          <PanelBody className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-2xl font-semibold">Join a Party</div>
                <div className="text-white/60 mt-1">Enter the code from the host.</div>
              </div>
              <Tag>Live Room</Tag>
            </div>

            <div className="space-y-3">
              <div className="text-sm text-white/60">Room code</div>
              <Input value={roomCode} onChange={(v) => setRoomCode(v.toUpperCase())} placeholder="e.g. PNAXO" />
            </div>

            <div className="space-y-3">
              <div className="text-sm text-white/60">Your name</div>
              <Input value={name} onChange={setName} placeholder="Your name" />
            </div>

            <Button onClick={join} disabled={!roomCode.trim() || !name.trim()} variant="primary">
              Join Party
            </Button>

            <label className="flex items-center gap-2 text-sm text-white/70 select-none">
              <input
                type="checkbox"
                checked={spectator}
                onChange={(e) => setSpectator(e.target.checked)}
                className="h-4 w-4 accent-white"
              />
              Join as spectator (view-only)
            </label>

            <div className="text-sm text-white/60">
              Want to host instead?{" "}
              <a className="text-white underline underline-offset-4" href="/">
                Create a Party
              </a>
            </div>
          </PanelBody>
        </Panel>

        <div className="relative">
          <motion.div
            animate={{ y: [0, 10, 0], rotate: [1.5, 0, 1.5] }}
            transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <CardBackMini />
          </motion.div>
        </div>
      </div>
    </BrandShell>
  );
}
