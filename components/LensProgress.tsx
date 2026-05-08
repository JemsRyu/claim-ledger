type Stage = "extraction" | "classification";
type StageState = "pending" | "running" | "complete";

type Props = {
  status: "extracting" | "classifying" | "done";
};

const STAGES: { id: Stage; label: string; activeCopy: string }[] = [
  {
    id: "extraction",
    label: "Extraction",
    activeCopy: "Reading the transcript, identifying factual claims.",
  },
  {
    id: "classification",
    label: "Classification",
    activeCopy: "Flagging hedging, sourcing, credentialing.",
  },
];

function stageStateFor(stage: Stage, status: Props["status"]): StageState {
  if (status === "extracting") {
    return stage === "extraction" ? "running" : "pending";
  }
  if (status === "classifying") {
    return stage === "extraction" ? "complete" : "running";
  }
  return "complete";
}

const STAGE_PILL_STYLES: Record<StageState, string> = {
  pending: "bg-foreground/[0.04] text-foreground/40",
  running:
    "bg-blue-500/10 text-blue-700 ring-1 ring-blue-500/20 dark:text-blue-400",
  complete:
    "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400",
};

function Spinner() {
  return (
    <svg
      aria-hidden
      className="size-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg
      aria-hidden
      className="size-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M5 13l4 4L19 7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "running") return <Spinner />;
  if (state === "complete") return <Check />;
  return <span aria-hidden className="size-1.5 rounded-full bg-foreground/20" />;
}

export function LensProgress({ status }: Props) {
  const activeStage = STAGES.find(
    (s) => stageStateFor(s.id, status) === "running",
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3 text-xs"
    >
      <ol className="flex items-center gap-2">
        {STAGES.map((stage, i) => {
          const state = stageStateFor(stage.id, status);
          return (
            <li key={stage.id} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono uppercase tracking-wider transition-colors ${STAGE_PILL_STYLES[state]}`}
              >
                <StageIcon state={state} />
                <span>{stage.label}</span>
              </span>
              {i < STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={`h-px w-4 transition-colors ${
                    state === "complete"
                      ? "bg-emerald-500/40"
                      : "bg-foreground/15"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-foreground/55">
        {activeStage
          ? activeStage.activeCopy
          : "Audit complete. Ledger below shows every claim that survived transcript validation."}
      </p>
    </div>
  );
}
