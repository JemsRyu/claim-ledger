import type { TranscriptSegment } from "@/lib/youtube/transcript";

type Props = {
  segments: TranscriptSegment[];
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

export function TranscriptView({ segments, onSeek }: Props) {
  if (segments.length === 0) {
    return (
      <section
        aria-label="Transcript"
        className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-5 text-sm text-foreground/60"
      >
        Transcript loaded but contains no segments.
      </section>
    );
  }

  return (
    <section
      aria-label="Transcript"
      className="flex max-h-96 flex-col gap-0.5 overflow-y-auto rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3 text-sm leading-relaxed text-foreground/80"
    >
      {segments.map((seg, i) => (
        <div
          key={i}
          className="flex gap-3 rounded px-2 py-1 hover:bg-foreground/[0.04]"
        >
          <button
            type="button"
            onClick={() => onSeek(seg.startSeconds)}
            className="shrink-0 cursor-pointer bg-transparent font-mono text-xs tabular-nums text-foreground/50 hover:text-foreground"
            title="Jump video to this moment"
          >
            {formatTimestamp(seg.startSeconds)}
          </button>
          <p className="text-balance">{seg.text}</p>
        </div>
      ))}
    </section>
  );
}
