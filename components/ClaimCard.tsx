"use client";

import { useState } from "react";
import type { ResearchResult, ValidatedClaim } from "@/lib/lens/types";
import { FlagBadge } from "./FlagBadge";
import { ResearchPanel } from "./ResearchPanel";

type Props = {
  claim: ValidatedClaim;
  classified: boolean;
  onSeek: (seconds: number) => void;
};

type ResearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: ResearchResult }
  | { kind: "error"; message: string };

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
  // Verify links go through the user's browser — we generate the search
  // URLs but the actual retrieval is a click the user makes. No model
  // citation, no hallucinated DOI, no judgment of "supports/refutes".
  // The auditor still surfaces; the user still judges.
  //
  // Two different transformations from the same claim, each tuned to
  // the engine on the receiving end:
  //   - Scholar gets searchQuery (academic keywords, e.g. "human
  //     trophic level diet evolution") — Scholar matches paper titles
  //     and abstracts, so keywords beat natural language.
  //   - Google gets verifyQuestion (a real question, e.g. "Are humans
  //     actually apex predators?") — Google indexes journalism, Reddit,
  //     fact-checks, and surfaces them well for question-form queries.
  // Both fall back to claim.claim when the extraction model didn't
  // emit them (e.g., synthesizer fallback path).
  const scholarQuery = claim.searchQuery ?? claim.claim;
  const googleQuery = claim.verifyQuestion ?? claim.claim;
  const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;

  const [research, setResearch] = useState<ResearchState>({ kind: "idle" });

  async function handleResearch() {
    if (research.kind === "loading") return;
    setResearch({ kind: "loading" });
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claim: claim.claim,
          verbatim: claim.matchedText,
          searchQuery: scholarQuery,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setResearch({
          kind: "error",
          message:
            data.error ?? `Research request failed (${response.status}).`,
        });
        return;
      }
      const result = (await response.json()) as ResearchResult;
      setResearch({ kind: "done", result });
    } catch (error) {
      setResearch({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Network error during research.",
      });
    }
  }

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
            <button
              type="button"
              onClick={handleResearch}
              disabled={research.kind === "loading"}
              className="cursor-pointer rounded border border-foreground/15 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground/70 transition-colors hover:border-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              title="Retrieve abstracts from OpenAlex, then judge whether each supports, contradicts, or is tangential to this claim"
            >
              {research.kind === "loading" ? "researching…" : "research"}
            </button>
            <span aria-hidden className="text-foreground/30">
              ·
            </span>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
              title="Search Google for context on this claim"
            >
              Google
            </a>
            <span aria-hidden className="text-foreground/30">
              ·
            </span>
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

      {research.kind !== "idle" && <ResearchPanel state={research} />}
    </article>
  );
}
