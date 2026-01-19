import Image from "next/image";
import { motion } from "framer-motion";
import { ReactNode } from "react";

type Props = {
  faceUp: boolean;
  title?: string;
  body?: string;
  badge?: string;
  footer?: ReactNode;
  className?: string;
};

export function PlayingCard(props: Props) {
  return (
    <div className={`relative [perspective:1800px] ${props.className ?? ""}`}>
      <motion.div
        className="relative w-full aspect-[2.5/3.5]"
        initial={false}
        animate={{
          rotateY: props.faceUp ? 180 : 0,
          rotateX: props.faceUp ? 0.6 : 0,
          scale: props.faceUp ? 1 : 0.99
        }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        {/* BACK */}
        <div
          className="absolute inset-0 rounded-3xl border border-white/25 bg-black shadow-[0_30px_90px_rgba(0,0,0,0.65)] overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.14),transparent_55%),radial-gradient(circle_at_75%_75%,rgba(255,255,255,0.09),transparent_55%)]" />
          <div className="absolute inset-[12px] rounded-2xl border border-white/15 bg-white/5" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[52%] opacity-95">
              <Image src="/brand/pixel-skull.svg" alt="Sociables" width={256} height={256} className="pixelated" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/55 tracking-[0.34em]">
            SOCIABLES
          </div>
        </div>

        {/* FRONT */}
        <div
          className="absolute inset-0 rounded-3xl border border-white/25 bg-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.65)] overflow-hidden"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.12),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(255,255,255,0.07),transparent_55%)]" />
          <div className="absolute inset-[12px] rounded-2xl border border-white/15 bg-black/25" />

          {/* corner skulls */}
          <div className="absolute top-5 left-5 w-7 opacity-90">
            <Image src="/brand/pixel-skull.svg" alt="" width={28} height={28} className="pixelated" />
          </div>
          <div className="absolute bottom-5 right-5 w-7 opacity-90 rotate-180">
            <Image src="/brand/pixel-skull.svg" alt="" width={28} height={28} className="pixelated" />
          </div>

          {/* CONTENT ON THE CARD */}
          <div className="absolute inset-0 px-7 py-7 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[11px] text-white/60 tracking-[0.24em]">{props.badge ?? ""}</div>
              <div className="text-[10px] text-white/45 tracking-[0.28em]">SOCIABLES</div>
            </div>

            <div className="mt-3 text-[22px] font-semibold leading-tight">
              {props.title ?? "—"}
            </div>

            <div className="mt-3 text-[14px] text-white/85 whitespace-pre-wrap leading-relaxed">
              {props.body ?? ""}
            </div>

            <div className="mt-auto pt-4">
              {props.footer ? (
                <div className="text-xs text-white/60">{props.footer}</div>
              ) : (
                <div className="text-xs text-white/55">Resolve as instructed.</div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
