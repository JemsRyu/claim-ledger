import type { TranscriptSegment } from "@/lib/youtube/transcript";

/**
 * Strips bracketed/parenthesized transcript markers, music notation,
 * punctuation, and normalizes whitespace + case. The output is what the
 * fuzzy matcher compares against — never displayed to the user.
 *
 * In YouTube transcripts almost every bracketed segment is non-speech
 * annotation ([Music], [Applause], [foreign language], [♪ inaudible ♪]).
 * We strip them all rather than enumerating known markers — defensive
 * against future YouTube tag additions.
 */
export function normalizeForMatching(input: string): string {
  let s = input;
  // Strip square-bracketed and parenthesized annotations.
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  // Strip music notation framing.
  s = s.replace(/♪[^♪]*♪/g, " ");
  s = s.toLowerCase();
  // Merge contractions (don't -> dont, it's -> its) into single words.
  s = s.replace(/'/g, "");
  // Replace any remaining non-letter/non-digit/non-whitespace with space.
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Builds a single normalized string from the transcript along with an
 * index map: for each character position in the normalized string, which
 * segment did it come from. The map lets callers project a fuzzy-match
 * span back onto the original timestamped segments.
 */
export function buildNormalizedTranscript(
  segments: TranscriptSegment[],
): { text: string; offsetMap: number[] } {
  let text = "";
  const offsetMap: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const normalized = normalizeForMatching(segments[i].text);
    if (normalized.length === 0) continue;

    if (text.length > 0) {
      text += " ";
      offsetMap.push(i);
    }

    for (let c = 0; c < normalized.length; c++) {
      offsetMap.push(i);
    }
    text += normalized;
  }

  return { text, offsetMap };
}
