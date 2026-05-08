import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { RawClaim, ValidatedClaim } from "./types";
import {
  buildNormalizedTranscript,
  normalizeForMatching,
} from "./normalize";

export const DEFAULT_THRESHOLD = 0.9;
export const DEFAULT_AMBIGUITY_MARGIN = 0.05;

export type ValidateClaimOptions = {
  threshold?: number;
  ambiguityMargin?: number;
};

/**
 * The trust spine. Given a model-emitted RawClaim and the timestamped
 * transcript, attempts to fuzzy-match the claim's verbatim against the
 * transcript and derive a span deterministically. Returns null if:
 *   - the verbatim doesn't match anywhere with score >= threshold
 *   - multiple non-overlapping spans match within `ambiguityMargin` of the
 *     top score (we cannot trust any one of them)
 *   - inputs are empty
 *
 * The algorithm never trusts model-supplied timestamps. The matchedText
 * returned in the ValidatedClaim is the actual transcript text in the
 * matched span (not the model's verbatim, which may have been paraphrased).
 */
export function validateClaim(
  transcript: TranscriptSegment[],
  rawClaim: RawClaim,
  options: ValidateClaimOptions = {},
): ValidatedClaim | null {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const ambiguityMargin = options.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN;

  if (transcript.length === 0) return null;
  if (!rawClaim.verbatim || rawClaim.verbatim.trim().length === 0) return null;

  const { text: normTranscript, offsetMap } =
    buildNormalizedTranscript(transcript);
  if (normTranscript.length === 0) return null;

  const normVerbatim = normalizeForMatching(rawClaim.verbatim);
  if (normVerbatim.length === 0) return null;

  const matches = findFuzzyMatches(normTranscript, normVerbatim, threshold, 2);
  if (matches.length === 0) return null;

  if (
    matches.length >= 2 &&
    matches[1].score >= matches[0].score - ambiguityMargin
  ) {
    return null;
  }

  const best = matches[0];
  const startSegmentIndex = offsetMap[best.start];
  const endSegmentIndex = offsetMap[Math.min(best.end - 1, offsetMap.length - 1)];
  if (
    startSegmentIndex === undefined ||
    endSegmentIndex === undefined ||
    startSegmentIndex > endSegmentIndex
  ) {
    return null;
  }

  const startSegment = transcript[startSegmentIndex];
  const endSegment = transcript[endSegmentIndex];
  const matchedText = transcript
    .slice(startSegmentIndex, endSegmentIndex + 1)
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join(" ");

  return {
    id: rawClaim.id,
    claim: rawClaim.claim,
    verbatim: rawClaim.verbatim,
    span: {
      startSeconds: startSegment.startSeconds,
      endSeconds: endSegment.startSeconds + endSegment.durationSeconds,
    },
    matchedText,
    flags: [],
  };
}

type Match = { start: number; end: number; score: number };

/**
 * Scans haystack for non-overlapping windows that fuzzy-match needle above
 * threshold. Returns up to `topK` highest-scoring non-overlapping matches,
 * sorted by score descending.
 *
 * Window length is constrained to ±15% of needle length to avoid pathologically
 * tiny or huge matches scoring well by accident.
 *
 * Note: O(N * W * L^2) brute force where N = haystack length, W = window
 * range, L = needle length. Fine for transcripts up to a few thousand chars.
 * Optimize if/when 30-min videos start showing measurable lag (P2.3).
 */
export function findFuzzyMatches(
  haystack: string,
  needle: string,
  threshold: number,
  topK: number,
): Match[] {
  const minWindow = Math.max(1, Math.floor(needle.length * 0.85));
  const maxWindow = Math.ceil(needle.length * 1.15);

  const candidates: Match[] = [];

  for (let start = 0; start + minWindow <= haystack.length; start++) {
    let bestForStart: Match | null = null;
    for (let len = minWindow; len <= maxWindow; len++) {
      if (start + len > haystack.length) break;
      const window = haystack.slice(start, start + len);
      const score = levenshteinSimilarity(window, needle);
      if (score >= threshold) {
        if (bestForStart === null || score > bestForStart.score) {
          bestForStart = { start, end: start + len, score };
        }
      }
    }
    if (bestForStart) candidates.push(bestForStart);
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.score - a.score);
  const accepted: Match[] = [];
  for (const c of candidates) {
    const overlaps = accepted.some(
      (a) => Math.max(c.start, a.start) < Math.min(c.end, a.end),
    );
    if (!overlaps) {
      accepted.push(c);
      if (accepted.length === topK) break;
    }
  }
  return accepted;
}

/**
 * 1 - normalized_levenshtein_distance. 1.0 = identical, 0.0 = completely
 * different. Uses rolling-row dynamic programming for O(m + n) memory.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }

  const distance = prev[n];
  return 1 - distance / Math.max(m, n);
}
