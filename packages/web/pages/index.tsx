import { useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";

import { BrandShell } from "../components/BrandShell";
import { Button, Input, Panel, PanelBody, Tag } from "../components/UI";
import { CardBackMini } from "../components/CardBackMini";
import { getSocket } from "../lib/socket";
import { setSession } from "../lib/storage";
import { useToast } from "../components/ToastProvider";
import { sfx } from "../lib/sfx";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");

  const create = () => {
    const socket = getSocket();
    sfx.click();

    socket.emit("room:create", { name: name.trim() }, (res: any) => {
      if (res?.error) {
        sfx.error();
        toast({ kind: "error", title: "Create failed", message: String(res.error) });
        return;
      }
      setSession(res.roomCode, res.playerId);
      toast({ kind: "success", title: "Room created", message: `Code: ${res.roomCode}` });
      router.push(`/room/${res.roomCode}`);
    });
  };

  return (
    <BrandShell subtitle="A premium party card experience. Pixel-skull deck. Real-time rooms.">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
        <Panel>
          <PanelBody className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-2xl font-semibold">Host a Party</div>
                <div className="text-white/60 mt-1">
                  Create a room, share the code, everyone joins from their own device.
                </div>
              </div>
              <Tag>Ultimate Deck</Tag>
            </div>

            <div className="space-y-3">
              <div className="text-sm text-white/60">Host name</div>
              <Input value={name} onChange={setName} placeholder="Your name (Host)" />
            </div>

            <Button onClick={create} disabled={!name.trim()} variant="primary">
              Create Party
            </Button>

            <div className="text-sm text-white/60">
              Already have a code?{" "}
              <a className="text-white underline underline-offset-4" href="/join">
                Join a Party
              </a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">Safety</div>
              <div className="text-sm text-white/70 mt-1">
                No pressure. Anyone can substitute water/soft drink. Respect boundaries.
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Right: animated deck preview */}
        <div className="relative">
          <motion.div
            className="absolute -top-6 -left-4 w-[92%] opacity-90"
            animate={{ y: [0, 8, 0], rotate: [-2, -1, -2] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="rotate-[-6deg] scale-[0.98]">
              <CardBackMini />
            </div>
          </motion.div>

          <motion.div
            className="relative"
            animate={{ y: [0, 10, 0], rotate: [0.8, 0, 0.8] }}
            transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="rotate-[4deg]">
              <CardBackMini />
            </div>
          </motion.div>

          <div className="mt-5 text-sm text-white/60">
            Smooth gameplay: draw → flip → resolve → confirmations when targeted.
          </div>
        </div>
      </div>
    </BrandShell>
  );
}
