import { motion } from "framer-motion";
import Image from "next/image";

export function DeckPile(props: {
  onDraw?: () => void;
  disabled?: boolean;
}) {
  const disabled = !!props.disabled;

  return (
    <div className="relative w-[220px] max-w-full">
      {/* stacked cards */}
      <div className="relative">
        <div className="absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-2xl border border-white/10 bg-white/5" />
        <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-2xl border border-white/12 bg-white/5" />
        <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-2xl border border-white/14 bg-white/5" />

        <motion.button
          onClick={props.onDraw}
          disabled={disabled}
          whileHover={!disabled ? { y: -4 } : undefined}
          whileTap={!disabled ? { scale: 0.98 } : undefined}
          className="relative w-full aspect-[2.5/3.5] rounded-2xl border border-white/20 bg-black shadow-[0_26px_80px_rgba(0,0,0,0.55)] overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.10),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.07),transparent_55%)]" />
          <div className="absolute inset-[10px] rounded-xl border border-white/15 bg-white/5" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[54%] opacity-90">
              <Image src="/brand/pixel-skull.svg" alt="Deck" width={256} height={256} className="pixelated" />
            </div>
          </div>

          <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/60 tracking-[0.32em]">
            DRAW
          </div>
        </motion.button>
      </div>
    </div>
  );
}
