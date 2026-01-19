import { ReactNode } from "react";
import { motion } from "framer-motion";

export function Panel(props: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
      {props.children}
    </div>
  );
}

export function PanelBody(props: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${props.className ?? ""}`}>{props.children}</div>;
}

export function Tag(props: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white/75">
      {props.children}
    </span>
  );
}

export type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
};

export function Button(props: ButtonProps) {
  const v = props.variant ?? "primary";
  const disabled = !!props.disabled;

  const base =
    "w-full rounded-2xl px-4 py-3 font-semibold tracking-wide focus-ring focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer";

  const styles =
    v === "primary"
      ? "bg-white text-black hover:bg-white/90"
      : v === "secondary"
      ? "bg-white/10 text-white border border-white/15 hover:bg-white/14"
      : v === "danger"
      ? "bg-red-500/90 text-white hover:bg-red-500"
      : "bg-transparent text-white border border-white/15 hover:bg-white/8";

  // IMPORTANT: use both touch + click; avoid preventDefault here
  const fire = () => {
    if (disabled) return;
    props.onClick?.();
  };

  return (
    <motion.button
      type="button"
      className={`${base} ${styles} ${props.className ?? ""}`}
      disabled={disabled}
      style={{ pointerEvents: "auto" }}
      onClick={fire}
      onTouchEnd={(e) => {
        // Ensures iOS Safari reliably triggers the action
        e.stopPropagation();
        fire();
      }}
      whileHover={!disabled ? { y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
    >
      {props.children}
    </motion.button>
  );
}

export function Input(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white placeholder:text-white/40 focus-ring"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      type={props.type ?? "text"}
    />
  );
}

export function Select(props: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      className="w-full rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-white focus-ring"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      style={{ colorScheme: "dark" as any }}
    >
      {props.children}
    </select>
  );
}
