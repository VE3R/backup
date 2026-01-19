import Image from "next/image";

export function CardBackMini() {
  return (
    <div className="rounded-2xl border border-white/20 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.07),transparent_55%)]" />
      <div className="relative p-6">
        <div className="aspect-[2.5/3.5] w-full rounded-xl border border-white/15 bg-white/5 flex items-center justify-center">
          <div className="w-[54%] opacity-90">
            <Image src="/brand/pixel-skull.svg" alt="Sociables" width={220} height={220} className="pixelated" />
          </div>
        </div>
        <div className="mt-3 text-center text-xs text-white/55 tracking-[0.32em]">SOCIABLES</div>
      </div>
    </div>
  );
}
