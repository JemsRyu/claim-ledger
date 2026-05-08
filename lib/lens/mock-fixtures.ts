import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type {
  AdversarialFlag,
  RawClaim,
  ValidatedClaim,
} from "./types";

type Fixture =
  | { kind: "audit"; claims: ValidatedClaim[] }
  | { kind: "no-audit-applicable"; reason: string };

// =============================================================================
// Special-case fixtures (keyed by MOCK_* synthetic IDs for unit-test demos)
// =============================================================================
const wellnessReelFixture: Fixture = {
  kind: "audit",
  claims: [
    {
      id: "c-0",
      claim: "Drinking celery juice on an empty stomach detoxifies the liver.",
      verbatim:
        "Drinking celery juice every morning on an empty stomach is going to detox your liver",
      span: { startSeconds: 4, endSeconds: 9 },
      matchedText:
        "Drinking celery juice every morning on an empty stomach is going to detox your liver",
      flags: ["unsourced", "un-credentialed"],
    },
    {
      id: "c-1",
      claim: "Sixteen ounces is the daily minimum for benefits.",
      verbatim: "you need at least sixteen ounces a day to see results",
      span: { startSeconds: 11, endSeconds: 14 },
      matchedText: "you need at least sixteen ounces a day to see results",
      flags: ["unsourced", "vague-sourced"],
    },
    {
      id: "c-2",
      claim: "The speaker hedges that studies might support the practice.",
      verbatim: "I think studies have shown this might help with inflammation",
      span: { startSeconds: 18, endSeconds: 23 },
      matchedText:
        "I think studies have shown this might help with inflammation",
      flags: ["hedged", "vague-sourced"],
    },
  ],
};

const techTalkFixture: Fixture = {
  kind: "audit",
  claims: [
    {
      id: "c-0",
      claim: "Transformer attention is O(n²) in sequence length.",
      verbatim:
        "the attention mechanism scales quadratically with sequence length",
      span: { startSeconds: 32, endSeconds: 36 },
      matchedText:
        "the attention mechanism scales quadratically with sequence length",
      flags: [],
    },
    {
      id: "c-1",
      claim: "FlashAttention reduces memory bandwidth bottlenecks.",
      verbatim:
        "FlashAttention basically eliminates the memory bandwidth bottleneck on modern GPUs",
      span: { startSeconds: 47, endSeconds: 53 },
      matchedText:
        "FlashAttention basically eliminates the memory bandwidth bottleneck on modern GPUs",
      flags: ["hedged"],
    },
  ],
};

const NO_AUDIT_REASON =
  "This video appears non-informational (music, narrative, or entertainment content). The auditor surfaces factual claims; nothing to audit here.";

const FIXTURE_KEYS: Record<string, Fixture> = {
  MOCK_WELLNESS: wellnessReelFixture,
  MOCK_TECHTALK: techTalkFixture,
  MOCK_MUSIC: { kind: "no-audit-applicable", reason: NO_AUDIT_REASON },
};

/**
 * Real YouTube videoIds we know to be non-informational. Hardcoded for the
 * Phase-1 demo set — Phase 2 replaces this with a Haiku-based classifier
 * that decides at runtime.
 */
const NON_INFORMATIONAL_REAL_IDS = new Set<string>([
  "dQw4w9WgXcQ", // Music video sample (curated empty-state proof)
]);

export function getMockFixture(videoId: string): Fixture | null {
  if (FIXTURE_KEYS[videoId]) return FIXTURE_KEYS[videoId];
  if (NON_INFORMATIONAL_REAL_IDS.has(videoId)) {
    return { kind: "no-audit-applicable", reason: NO_AUDIT_REASON };
  }
  return null; // signal: synthesize from real transcript
}

// =============================================================================
// Real-transcript synthesis (Phase 1 mock — Phase 2 replaces with Sonnet+Haiku)
// =============================================================================

/**
 * Picks N segments evenly distributed across the transcript and turns each
 * into a RawClaim whose verbatim is literally a transcript snippet. The
 * timestamp validator then derives spans correctly because the verbatim is
 * guaranteed to fuzzy-match.
 *
 * The claim text is a synthesized "(demo) The speaker states: …" — explicit
 * about being placeholder. Phase 2 replaces this whole function with the
 * Sonnet extraction lens.
 */
export function synthesizeRawClaims(
  transcript: TranscriptSegment[],
  count = 4,
): RawClaim[] {
  const usable = transcript.filter((s) => s.text.trim().length >= 12);
  if (usable.length === 0) return [];

  const target = Math.min(count, usable.length);
  const stride = usable.length / target;
  const claims: RawClaim[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < target; i++) {
    const idx = Math.min(
      usable.length - 1,
      Math.floor(i * stride + stride / 2),
    );
    if (seen.has(idx)) continue;
    seen.add(idx);

    const text = usable[idx].text.trim();
    const summary = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    claims.push({
      id: `c-${i}`,
      claim: `(demo) The speaker states: "${summary}"`,
      verbatim: text,
    });
  }

  return claims;
}

const MOCK_FLAG_PATTERNS: AdversarialFlag[][] = [
  ["unsourced"],
  ["hedged"],
  ["vague-sourced", "un-credentialed"],
  [],
  ["hedged", "unsourced"],
];

/**
 * Round-robins through a fixed list of flag combinations to populate the
 * adversarial-flag UI in Phase 1. Phase 2 replaces with the Haiku classifier.
 */
export function mockFlagsForIndex(index: number): AdversarialFlag[] {
  return MOCK_FLAG_PATTERNS[index % MOCK_FLAG_PATTERNS.length];
}
