import type { AdversarialFlag } from "@/lib/lens/types";

const FLAG_STYLES: Record<AdversarialFlag, string> = {
  contradicted:
    "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  unsourced:
    "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-400",
  "vague-sourced":
    "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  "un-credentialed":
    "bg-purple-500/10 text-purple-700 ring-purple-500/20 dark:text-purple-400",
  hedged: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-400",
};

const FLAG_DESCRIPTIONS: Record<AdversarialFlag, string> = {
  contradicted:
    "The speaker contradicts this claim elsewhere in the video.",
  unsourced: "No source is cited for this claim.",
  "vague-sourced":
    "The claim references an unnamed authority (e.g. \"studies show…\").",
  "un-credentialed":
    "The speaker has no known credentials in this domain.",
  hedged:
    "The speaker hedges with words like \"might,\" \"could,\" or \"I think.\" Less assertive.",
};

export function FlagBadge({ flag }: { flag: AdversarialFlag }) {
  return (
    <span
      title={FLAG_DESCRIPTIONS[flag]}
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ring-1 ring-inset ${FLAG_STYLES[flag]}`}
    >
      {flag}
    </span>
  );
}
