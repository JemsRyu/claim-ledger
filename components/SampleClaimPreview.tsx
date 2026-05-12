import { FlagBadge } from "./FlagBadge";

/**
 * Static onboarding preview: a sample ledger entry with the two
 * clickable elements (timestamp pill + Scholar link) highlighted with
 * a colored ring, plus speech-bubble callouts positioned outside the
 * card on the right pointing at each. On mobile the callouts collapse
 * to a stack below the card.
 *
 * The preview itself isn't interactive — the call to action is the
 * sample gallery directly below. The rings + bubbles teach the
 * affordances; clicking a sample puts them into practice.
 */
const RING = "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background";
const BUBBLE =
  "rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 shadow-sm dark:border-amber-600/50 dark:bg-amber-950/60 dark:text-amber-100";

export function SampleClaimPreview() {
  return (
    <section aria-label="Sample output" className="flex flex-col gap-2">
      <h2 className="font-mono text-xs uppercase tracking-widest text-foreground/50">
        What an audit looks like
      </h2>

      <div className="relative sm:pr-48">
        <article className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
          <header className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-snug text-foreground">
              Sugar receptors exist in the gut, not just on the tongue.
            </p>
            <span
              className={`shrink-0 rounded bg-foreground/[0.06] px-2 py-1 font-mono text-xs tabular-nums text-foreground/70 ${RING}`}
            >
              2:13
            </span>
          </header>

          <blockquote className="border-l-2 border-foreground/15 pl-3 text-sm italic leading-relaxed text-foreground/65">
            &ldquo;sugar receptors are not only located on the tongue, but they
            exist in the gut as well&rdquo;
          </blockquote>

          <footer className="flex flex-wrap items-end gap-1.5">
            <FlagBadge flag="unsourced" />
            <div className="ml-auto flex items-center gap-2 text-[10px] tracking-wider text-foreground/45">
              <span className="font-mono uppercase">verify:</span>
              <span
                className={`inline-flex rounded-full bg-amber-100/40 px-2 py-0.5 dark:bg-amber-950/40 ${RING}`}
              >
                <span className="text-amber-900 underline decoration-amber-700/40 underline-offset-2 dark:text-amber-100">
                  Scholar
                </span>
              </span>
            </div>
          </footer>
        </article>

        {/* Desktop callouts — absolute-positioned bubbles outside the card */}
        <div
          className={`absolute right-0 top-2 hidden w-44 rotate-3 sm:block ${BUBBLE}`}
        >
          ← yep, click! the video jumps right to that second
        </div>
        <div
          className={`absolute bottom-2 right-0 hidden w-44 -rotate-2 sm:block ${BUBBLE}`}
        >
          ← this one runs a Google Scholar search
        </div>

        {/* Mobile callouts — stacked below the card */}
        <div className="mt-3 flex flex-col gap-2 sm:hidden">
          <div className={BUBBLE}>
            ↑ click the timestamp — the video jumps to that exact second
          </div>
          <div className={BUBBLE}>
            ↑ click &ldquo;Scholar&rdquo; to open a Google Scholar search for
            the claim
          </div>
        </div>
      </div>
    </section>
  );
}
