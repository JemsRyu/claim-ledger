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
      {paper.quote && (
        <blockquote className="border-l-2 border-foreground/15 pl-2 text-[11px] italic leading-relaxed text-foreground/70">
          &ldquo;{paper.quote}&rdquo;
        </blockquote>
      )}
      <p className="text-[11px] leading-relaxed text-foreground/55">
        {paper.reasoning}
      </p>
      <p className="font-mono text-[10px] text-foreground/35">{meta}</p>
    </li>
  );
}

export function ResearchPanel({ state }: { state: State }) {
  const relevant =
    state.kind === "done"
      ? state.result.papers.filter((p) => p.verdict !== "tangential")
      : [];
  const tangential =
    state.kind === "done"
      ? state.result.papers.filter((p) => p.verdict === "tangential")
      : [];

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
            {relevant.length}/{state.result.papers.length} relevant
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
        <p className="text-xs text-foreground/55">
          No papers indexed for this query. Try the Scholar or Google links
          above.
        </p>
      )}

      {state.kind === "done" &&
        state.result.papers.length > 0 &&
        relevant.length === 0 && (
          <p className="text-xs text-foreground/55">
            No clearly relevant papers found. {tangential.length} were retrieved
            but the model judged each as tangential — they touch on related
            topics without addressing this specific claim. Try the Scholar or
            Google links above for broader verification.
          </p>
        )}

      {state.kind === "done" && relevant.length > 0 && (
        <ul className="flex flex-col gap-2">
          {relevant.map((p, i) => (
            <PaperRow key={`r-${i}`} paper={p} />
          ))}
        </ul>
      )}

      {state.kind === "done" &&
        relevant.length > 0 &&
        tangential.length > 0 && (
          <details className="mt-1 text-[10px] text-foreground/45">
            <summary className="cursor-pointer font-mono uppercase tracking-wider hover:text-foreground/70">
              + {tangential.length} tangential{" "}
              {tangential.length === 1 ? "paper" : "papers"}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {tangential.map((p, i) => (
                <PaperRow key={`t-${i}`} paper={p} />
              ))}
            </ul>
          </details>
        )}
    </section>
  );
}
