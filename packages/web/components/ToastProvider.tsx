import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Toast = {
  id: string;
  kind: "info" | "success" | "error";
  title?: string;
  message: string;
};

type ToastCtx = {
  toast: (t: Omit<Toast, "id">) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function ToastProvider(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const next: Toast = { ...t, id: id() };
    setToasts((prev) => [next, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== next.id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {props.children}

      {/* Toast UI */}
      <div className="fixed z-[9999] top-4 right-4 left-4 sm:left-auto sm:w-[420px] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 520, damping: 32 }}
              className="pointer-events-none mb-2 rounded-2xl border border-white/15 bg-black/70 backdrop-blur px-4 py-3 shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start gap-3">
                <div
                  className={
                    "mt-1 h-2.5 w-2.5 rounded-full " +
                    (t.kind === "success"
                      ? "bg-emerald-400"
                      : t.kind === "error"
                      ? "bg-red-400"
                      : "bg-white/60")
                  }
                />
                <div className="min-w-0">
                  {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
                  <div className="text-sm text-white/75">{t.message}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
