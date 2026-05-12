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
    ...(rawClaim.searchQuery ? { searchQuery: rawClaim.searchQuery } : {}),
    ...(rawClaim.verifyQuestion
      ? { verifyQuestion: rawClaim.verifyQuestion }
      : {}),
  };
}

type Match = { start: number; end: number; score: number };

/**
 * Returns a sorted list of haystack positions where a fuzzy match could
 * START. Uses pigeonhole + exact substring search: if (editBudget+1)
 * disjoint seeds tile the needle, any match leaves at least one seed
 * unedited, so it must appear exactly in the haystack window. The
 * candidate window start is then `seedHaystackPos - seedOffset ± shift`
 * where shift accommodates insertions/deletions before the seed.
 *
 * Degrades gracefully: if the seed is too short to be distinctive
 * (occurs everywhere), we still bound candidates by occurrence count,
 * which is always ≤ haystack.length anyway.
 */
function collectCandidateStarts(
  haystack: string,
  needle: string,
  editBudget: number,
  minLen: number,
  maxLen: number,
): number[] {
  const baseLen = needle.length;
  const seedCount = editBudget + 1;
  // Seed length: tile the needle into seedCount disjoint pieces.
  const seedLen = Math.max(1, Math.floor(baseLen / seedCount));

  // If the seed degenerates (1-char seeds match too liberally), fall back
  // to scanning all start positions. This only triggers for very short
  // needles at high edit budgets.
  if (seedLen < 2) {
    const all: number[] = [];
    for (let i = 0; i + minLen <= haystack.length; i++) all.push(i);
    return all;
  }

  const starts = new Set<number>();
  const maxStart = haystack.length - minLen;
  for (let k = 0; k < seedCount; k++) {
    const seedOffset = k * seedLen;
    if (seedOffset + seedLen > baseLen) break;
    const seed = needle.slice(seedOffset, seedOffset + seedLen);
    let pos = haystack.indexOf(seed);
    while (pos !== -1) {
      // Candidate window start = where the needle would have started
      // if this seed matched at position `pos`, ± editBudget slack for
      // edits before the seed shifting alignment.
      const center = pos - seedOffset;
      const low = Math.max(0, center - editBudget);
      const high = Math.min(maxStart, center + editBudget);
      for (let s = low; s <= high; s++) starts.add(s);
      pos = haystack.indexOf(seed, pos + 1);
    }
  }

  return [...starts].sort((a, b) => a - b);
}


/**
 * Scans haystack for non-overlapping windows that fuzzy-match needle above
 * threshold. Returns up to `topK` highest-scoring non-overlapping matches,
 * sorted by score descending.
 *
 * Window lengths are constrained to [needle.length - editBudget,
 * needle.length + editBudget] where editBudget = floor((1 - threshold) *
 * needle.length). Any match with a window outside this range is
 * mathematically impossible to score above threshold (the length delta
 * alone exceeds the edit budget).
 *
 * Each Levenshtein call is bounded by editBudget and early-terminates
 * once the DP row min exceeds the budget — most non-matching positions
 * exit in ~10 rows instead of filling the full L*L matrix.
 *
 * Net: O(N * editBudget * K * L) where K is the early-exit depth on
 * non-matches (~10). On a TED-length transcript (~25K chars, ~80-char
 * needles, ~30 claims) this is the difference between ~minutes and ~seconds.
 * The previous unbounded brute-force was O(N * 0.3L * L²) which hit
 * minutes-to-hours for long transcripts.
 */
export function findFuzzyMatches(
  haystack: string,
  needle: string,
  threshold: number,
  topK: number,
): Match[] {
  if (needle.length === 0) return [];
  const baseLen = needle.length;
  const editBudget = Math.floor((1 - threshold) * baseLen);
  const minLen = Math.max(1, baseLen - editBudget);
  const maxLen = baseLen + editBudget;
  if (haystack.length < minLen) return [];

  // Pigeonhole: any match with ≤editBudget edits leaves at least one of
  // (editBudget+1) disjoint seed substrings of the needle untouched, so
  // that seed must appear exactly in the haystack window. Find seeds via
  // native indexOf (memchr-speed), then run Levenshtein only at candidate
  // positions anchored on those seeds — O(N) instead of O(N * W).
  const candidateStarts = collectCandidateStarts(
    haystack,
    needle,
    editBudget,
    minLen,
    maxLen,
  );

  const candidates: Match[] = [];
  for (const start of candidateStarts) {
    let bestForStart: Match | null = null;
    for (let len = minLen; len <= maxLen; len++) {
      if (start + len > haystack.length) break;
      // Cutoff scales with the longer of (window, needle) — a 2-char-longer
      // window matching needle exactly has score 1 - 2/(L+2), still above
      // threshold; we must not early-exit before reaching that conclusion.
      const cutoff = Math.floor((1 - threshold) * Math.max(len, baseLen));
      const score = levenshteinSimilarity(
        haystack.slice(start, start + len),
        needle,
        cutoff,
      );
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
 *
 * If `maxDistance` is provided, early-terminates when the DP row min
 * exceeds it (the final distance can drop by at most 1 per remaining row,
 * so rowMin > maxDistance + remainingRows implies the answer also
 * exceeds maxDistance). On early-exit returns 0 — callers compare against
 * a similarity threshold so the exact sub-threshold score is irrelevant.
 */
export function levenshteinSimilarity(
  a: string,
  b: string,
  maxDistance?: number,
): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const m = a.length;
  const n = b.length;
  const cutoff = maxDistance ?? Infinity;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Each remaining row can reduce the final distance by at most 1.
    if (rowMin > cutoff + (m - i)) return 0;
    [prev, curr] = [curr, prev];
  }

  const distance = prev[n];
  if (distance > cutoff) return 0;
  return 1 - distance / Math.max(m, n);
}
