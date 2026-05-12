import type { AdversarialFlag } from "./types";

/**
 * Tokens that mark a claim as hedged. Tight on purpose: false negatives
 * (missing a real hedge) only cost us one flag; false positives (treating
 * a non-hedge as a hedge) re-enable the very classifier failure mode this
 * guard exists to fix.
 *
 * Each pattern is word-boundary anchored and case-insensitive. The list
 * mirrors the hedge examples the classifier prompt enumerates (i think,
 * might, could, possibly, maybe, studies suggest) plus close variants
 * that obviously hedge.
 */
const HEDGE_TOKEN_PATTERNS: readonly RegExp[] = [
  /\bi think\b/i,
  /\bi believe\b/i,
  /\bi feel\b/i,
  /\bi guess\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\bpossibly\b/i,
  /\bperhaps\b/i,
  /\bmaybe\b/i,
  /\bprobably\b/i,
  /\bpotentially\b/i,
  /\bseem(?:s|ed|ing)?\b/i,
  /\bappear(?:s|ed|ing)?\b/i,
  /\bsuggest(?:s|ed|ing|ion)?\b/i,
  /\btend(?:s|ed|ing)? to\b/i,
  /\bsome (?:say|believe|think|argue|claim)\b/i,
  /\bsort of\b/i,
  /\bkind of\b/i,
];

export function hasHedgeToken(text: string): boolean {
  return HEDGE_TOKEN_PATTERNS.some((rx) => rx.test(text));
}

/**
 * Strip the "hedged" classifier flag if no hedge token appears locally
 * in the matched transcript span. Same trust-spine pattern as the
 * timestamp validator: the model emits a signal, the server enforces a
 * ground-truth check before accepting.
 *
 * Why: Haiku tends to attribute the speaker's overall hedging tone to
 * specific direct assertions ("the speaker sounds tentative throughout
 * the talk, so this assertion must be tentative too"), even though the
 * classifier system prompt explicitly says the hedge must be on THIS
 * claim, not a different one. This guard enforces locality
 * deterministically — no extra model call.
 *
 * Other flags are returned unchanged.
 */
export function guardHedge(
  flags: AdversarialFlag[],
  matchedText: string,
): AdversarialFlag[] {
  if (!flags.includes("hedged")) return flags;
  if (hasHedgeToken(matchedText)) return flags;
  return flags.filter((f) => f !== "hedged");
}
