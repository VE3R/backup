import { ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { getSfxEnabled, setSfxEnabled } from "../lib/sfx";

export function BrandShell(props: { children: ReactNode; subtitle?: string }) {
  const sfxOn = getSfxEnabled();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Decorative background — MUST NOT capture taps */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.10),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />

        {/* subtle floating skull watermark */}
        <motion.div
          className="absolute right-6 top-6 opacity-[0.08]"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src="/brand/pixel-skull.svg"
            alt=""
            width={120}
            height={120}
            className="pixelated"
          />
        </motion.div>
      </div>

      {/* Foreground content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 opacity-95">
              <Image
                src="/brand/pixel-skull.svg"
                alt="Sociables"
                width={40}
                height={40}
                className="pixelated"
              />
            </div>
            <div>
              <div className="text-xl font-semibold tracking-wide">Sociables</div>
              {props.subtitle ? (
                <div className="text-sm text-white/60">{props.subtitle}</div>
              ) : null}
            </div>
          </div>

          {/* SFX toggle - tap safe */}
          <button
            type="button"
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 active:scale-[0.98]"
            onClick={() => setSfxEnabled(!sfxOn)}
          >
            SFX: {sfxOn ? "ON" : "OFF"}
          </button>
        </div>

        <div className="mt-6">{props.children}</div>
      </div>
    </div>
  );
}
