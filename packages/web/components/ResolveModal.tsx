import { AnimatePresence, motion } from "framer-motion";
import { Button, Input, Select, Tag } from "./UI";

type Props = {
  open: boolean;
  onClose: () => void;
  onResolve: () => void;

  // context
  title: string;
  kind?: string;
  disabled?: boolean;

  // inputs
  players: { playerId: string; name: string }[];
  target1: string;
  setTarget1: (v: string) => void;
  target2: string;
  setTarget2: (v: string) => void;
  numVal: string;
  setNumVal: (v: string) => void;
  ruleText: string;
  setRuleText: (v: string) => void;
};

export function ResolveModal(p: Props) {
  const kind = p.kind ?? "none";

  const ruleSuggestions = [
    "No swearing",
    "No saying anyone's name",
    "Everyone drinks with non-dominant hand",
    "No pointing",
    "If you check your phone, take 1",
    "Questions must be answered with a question",
    "No using the word 'drink'",
    "Before you sip, say 'Sociables'"
  ];

  return (
    <AnimatePresence>
      {p.open ? (
        <motion.div
          className="fixed inset-0 z-[9998]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={p.onClose} />

          {/* Modal */}
          <motion.div
            className="absolute left-1/2 top-1/2 w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/15 bg-black/70 shadow-[0_30px_120px_rgba(0,0,0,0.75)]"
            initial={{ y: 18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 18, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
          >
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold">Resolve Card</div>
                  <div className="text-sm text-white/60 mt-1">{p.title}</div>
                </div>
                <Tag>{kind}</Tag>
              </div>

              <div className="mt-5 space-y-4">
                {(kind === "chooseTarget" || kind === "chooseTargetAndNumber") && (
                  <div>
                    <div className="text-xs text-white/60 mb-2">Target player</div>
                    <Select value={p.target1} onChange={p.setTarget1}>
                      <option value="">Select…</option>
                      {p.players.map((pl) => (
                        <option key={pl.playerId} value={pl.playerId}>
                          {pl.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {kind === "chooseTwoTargets" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-white/60 mb-2">First player</div>
                      <Select value={p.target1} onChange={p.setTarget1}>
                        <option value="">Select…</option>
                        {p.players.map((pl) => (
                          <option key={pl.playerId} value={pl.playerId}>
                            {pl.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-white/60 mb-2">Second player</div>
                      <Select value={p.target2} onChange={p.setTarget2}>
                        <option value="">Select…</option>
                        {p.players.map((pl) => (
                          <option key={pl.playerId} value={pl.playerId}>
                            {pl.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}

                {(kind === "chooseNumber" || kind === "chooseTargetAndNumber") && (
                  <div>
                    <div className="text-xs text-white/60 mb-2">Number</div>
                    <Input value={p.numVal} onChange={p.setNumVal} placeholder="e.g. 2" />
                  </div>
                )}

                {kind === "createRuleText" && (
                  <div>
                    <div className="text-xs text-white/60 mb-2">Rule text</div>
                    <Input value={p.ruleText} onChange={p.setRuleText} placeholder="Type the rule…" />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                        onClick={() => {
                          const pick = ruleSuggestions[Math.floor(Math.random() * ruleSuggestions.length)];
                          p.setRuleText(pick);
                        }}
                      >
                        Suggestions
                      </button>

                      {ruleSuggestions.slice(0, 4).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/75 hover:bg-white/10"
                          onClick={() => p.setRuleText(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="ghost" onClick={p.onClose}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={p.onResolve} disabled={p.disabled}>
                  Confirm Resolve
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
