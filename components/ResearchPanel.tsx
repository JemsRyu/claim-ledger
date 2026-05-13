import type {
  PaperVerdict,
  ResearchResult,
  ResearchedPaper,
} from "@/lib/lens/types";

type State =
  | { kind: "loading" }
  | { kind: "done"; result: ResearchResult }
  | { kind: "error"; message: string };

const VERDICT_LABEL: Record<PaperVerdict, string> = {
  supports: "supports",
  contradicts: "contradicts",
  tangential: "tangential",
};

const VERDICT_CLASS: Record<PaperVerdict, string> = {
  supports:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  contradicts:
    "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20",
  tangential:
    "bg-foreground/[0.06] text-foreground/60 ring-1 ring-foreground/10",
};

function PaperRow({ paper }: { paper: ResearchedPaper }) {
  const meta = [
    paper.authors,
    paper.year ?? null,
    typeof paper.citationCount === "number"
      ? `${paper.citationCount} cite${paper.citationCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter((x) => x !== null)
    .join(" · ");

  return (
    <li className="flex flex-col gap-1.5 border-t border-foreground/10 pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium leading-snug text-foreground/85 underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
        >
          {paper.title}
        </a>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${VERDICT_CLASS[paper.verdict]}`}
        >
          {VERDICT_LABEL[paper.verdict]}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-foreground/55">
        {paper.reasoning}
      </p>
      <p className="font-mono text-[10px] text-foreground/35">{meta}</p>
    </li>
  );
}

export function ResearchPanel({ state }: { state: State }) {
  return (
    <section
      aria-label="Research results"
      className="flex flex-col gap-2 rounded-md border border-foreground/10 bg-foreground/[0.03] p-3"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground/55">
          Research · OpenAlex
        </h3>
        {state.kind === "done" && (
          <span className="font-mono text-[10px] tabular-nums text-foreground/35">
            {state.result.papers.length} paper
            {state.result.papers.length === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {state.kind === "loading" && (
        <p className="text-xs text-foreground/50">
          Retrieving abstracts and judging relevance…
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-rose-700 dark:text-rose-400">
          {state.message}
        </p>
      )}

      {state.kind === "done" && state.result.papers.length === 0 && (
        <p className="text-xs text-foreground/50">
          No relevant papers found for this claim. Try the Scholar or Google
          links above.
        </p>
      )}

      {state.kind === "done" && state.result.papers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {state.result.papers.map((p, i) => (
            <PaperRow key={i} paper={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
