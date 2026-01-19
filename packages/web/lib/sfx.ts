let enabled = true;
// Initialize from persisted preference
try {
  if (typeof window !== "undefined") {
    const v = localStorage.getItem("sociables_sfx");
    enabled = v === null ? true : v === "1";
  }
} catch {}

export function setSfxEnabled(v: boolean) {
  enabled = v;
  if (typeof window !== "undefined") {
    localStorage.setItem("sociables_sfx", v ? "1" : "0");
  }
}

export function getSfxEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem("sociables_sfx");
  if (v === null) return true;
  return v === "1";
}

function tone(freq: number, ms: number, gainValue: number) {
  if (!enabled) return;
  if (typeof window === "undefined") return;

  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = gainValue;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  setTimeout(() => {
    osc.stop();
    ctx.close().catch(() => {});
  }, ms);
}

export const sfx = {
  click: () => tone(280, 60, 0.03),
  draw: () => tone(190, 120, 0.04),
  flip: () => tone(420, 80, 0.03),
  confirm: () => tone(520, 90, 0.035),
  error: () => tone(120, 160, 0.05)
};
