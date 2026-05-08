import type { ValidatedClaim } from "@/lib/lens/types";
import { FlagBadge } from "./FlagBadge";

type Props = {
  videoId: string;
  claim: ValidatedClaim;
  classified: boolean;
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

export function ClaimCard({ videoId, claim, classified }: Props) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(claim.span.startSeconds)}s`;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
      <header className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-foreground">
          {claim.claim}
        </p>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded bg-foreground/[0.06] px-2 py-1 font-mono text-xs tabular-nums text-foreground/70 transition-colors hover:bg-foreground/[0.1] hover:text-foreground"
          title="Open video at this timestamp in a new tab"
        >
          {formatTimestamp(claim.span.startSeconds)}
        </a>
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
      </footer>
    </article>
  );
}
