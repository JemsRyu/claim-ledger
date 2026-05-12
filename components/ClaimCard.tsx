import type { ValidatedClaim } from "@/lib/lens/types";
import { FlagBadge } from "./FlagBadge";

type Props = {
  claim: ValidatedClaim;
  classified: boolean;
  onSeek: (seconds: number) => void;
};

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClaimCard({ claim, classified, onSeek }: Props) {
  const hasFlags = classified && claim.flags.length > 0;
  // Verify link goes through the user's browser — we generate the search
  // URL but the actual retrieval is a click the user makes. No model
  // citation, no hallucinated DOI, no judgment of "supports/refutes".
  // The auditor still surfaces; the user still judges.
  const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(claim.claim)}`;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
      <header className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-foreground">
          {claim.claim}
        </p>
        <button
          type="button"
          onClick={() => onSeek(claim.span.startSeconds)}
          className="shrink-0 cursor-pointer rounded bg-foreground/[0.06] px-2 py-1 font-mono text-xs tabular-nums text-foreground/70 transition-colors hover:bg-foreground/[0.1] hover:text-foreground"
          title="Jump video to this timestamp"
        >
          {formatTimestamp(claim.span.startSeconds)}
        </button>
      </header>

      <blockquote className="border-l-2 border-foreground/15 pl-3 text-sm italic leading-relaxed text-foreground/65">
        &ldquo;{claim.matchedText}&rdquo;
      </blockquote>

      <footer className="flex flex-wrap items-center gap-1.5">
        {classified ? (
          claim.flags.length > 0 ? (
            claim.flags.map((flag) => <FlagBadge key={flag} flag={flag} />)
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/40">
              no flags
            </span>
          )
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/40">
            classifying…
          </span>
        )}
        {hasFlags && (
          <div className="ml-auto flex items-center gap-2 text-[10px] tracking-wider text-foreground/45">
            <span className="font-mono uppercase">verify:</span>
            <a
              href={scholarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
              title="Search Google Scholar for academic sources on this claim"
            >
              Scholar
            </a>
          </div>
        )}
      </footer>
    </article>
  );
}
