import { FlagBadge } from "./FlagBadge";

/**
 * Static onboarding preview: shows the shape of a single ledger entry
 * — claim, timestamp, verbatim, flags, verify link — with annotated
 * hints that both the timestamp and the Scholar link are clickable.
 * The preview itself isn't interactive; the call to action is the
 * sample gallery directly below it.
 */
export function SampleClaimPreview() {
  return (
    <section aria-label="Sample output" className="flex flex-col gap-2">
      <h2 className="font-mono text-xs uppercase tracking-widest text-foreground/50">
        What an audit looks like
      </h2>
      <article className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
        <header className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug text-foreground">
            Sugar receptors exist in the gut, not just on the tongue.
          </p>
          <div className="flex flex-col items-end gap-1">
            <span className="shrink-0 rounded bg-foreground/[0.06] px-2 py-1 font-mono text-xs tabular-nums text-foreground/70">
              2:13
            </span>
            <span className="font-mono text-[10px] leading-tight text-foreground/45">
              ↑ click to jump the video here
            </span>
          </div>
        </header>

        <blockquote className="border-l-2 border-foreground/15 pl-3 text-sm italic leading-relaxed text-foreground/65">
          &ldquo;sugar receptors are not only located on the tongue, but they
          exist in the gut as well&rdquo;
        </blockquote>

        <footer className="flex flex-wrap items-end gap-1.5">
          <FlagBadge flag="unsourced" />
          <div className="ml-auto flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-[10px] tracking-wider text-foreground/45">
              <span className="font-mono uppercase">verify:</span>
              <span className="underline decoration-foreground/25 underline-offset-2">
                Scholar
              </span>
            </div>
            <span className="font-mono text-[10px] leading-tight text-foreground/45">
              ↑ click to search academic sources
            </span>
          </div>
        </footer>
      </article>
    </section>
  );
}
