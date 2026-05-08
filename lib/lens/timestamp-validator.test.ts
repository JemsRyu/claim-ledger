import { describe, it, expect } from "vitest";
import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { RawClaim } from "./types";
import {
  validateClaim,
  findFuzzyMatches,
  levenshteinSimilarity,
  DEFAULT_THRESHOLD,
} from "./timestamp-validator";
import {
  normalizeForMatching,
  buildNormalizedTranscript,
} from "./normalize";

const seg = (
  text: string,
  startSeconds: number,
  durationSeconds: number,
): TranscriptSegment => ({ text, startSeconds, durationSeconds });

const claim = (verbatim: string, id = "c-0", text = "demo claim"): RawClaim => ({
  id,
  claim: text,
  verbatim,
});

// =============================================================================
// normalize
// =============================================================================
describe("normalizeForMatching", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeForMatching("Hello, World!")).toBe("hello world");
  });

  it("strips bracketed transcript markers like [Music] and [Applause]", () => {
    expect(normalizeForMatching("Welcome [Music] to the show")).toBe(
      "welcome to the show",
    );
    expect(normalizeForMatching("[APPLAUSE] thanks everyone")).toBe(
      "thanks everyone",
    );
    expect(normalizeForMatching("speaks in spanish [foreign language]")).toBe(
      "speaks in spanish",
    );
    expect(normalizeForMatching("[whispering] hello")).toBe("hello");
    expect(normalizeForMatching("(crowd noise) thank you")).toBe("thank you");
  });

  it("strips music notation like ♪ ... ♪", () => {
    expect(normalizeForMatching("♪ never gonna give you up ♪ said the song")).toBe(
      "said the song",
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeForMatching("a   b\n\tc")).toBe("a b c");
  });

  it("merges contractions (don't -> dont)", () => {
    expect(normalizeForMatching("don't stop")).toBe("dont stop");
  });

  it("returns empty string for input that's only markers", () => {
    expect(normalizeForMatching("[Music]")).toBe("");
    expect(normalizeForMatching("   ")).toBe("");
  });
});

describe("buildNormalizedTranscript", () => {
  it("produces a contiguous string with offsetMap aligned to segments", () => {
    const segments = [seg("Hello", 0, 1), seg("World", 1, 1)];
    const { text, offsetMap } = buildNormalizedTranscript(segments);
    expect(text).toBe("hello world");
    expect(text.length).toBe(offsetMap.length);
    expect(offsetMap[0]).toBe(0); // 'h' from segment 0
    expect(offsetMap[5]).toBe(1); // separator space assigned to upcoming segment
    expect(offsetMap[6]).toBe(1); // 'w' from segment 1
  });

  it("skips fully-empty (marker-only) segments", () => {
    const segments = [
      seg("Hello", 0, 1),
      seg("[Music]", 1, 2),
      seg("World", 3, 1),
    ];
    const { text } = buildNormalizedTranscript(segments);
    expect(text).toBe("hello world");
  });
});

// =============================================================================
// levenshteinSimilarity
// =============================================================================
describe("levenshteinSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(levenshteinSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for empty input", () => {
    expect(levenshteinSimilarity("", "hello")).toBe(0);
    expect(levenshteinSimilarity("hello", "")).toBe(0);
  });

  it("computes 1 - editDistance/maxLen", () => {
    // 'hello' -> 'hella': 1 substitution / 5 chars = 0.8 similarity
    expect(levenshteinSimilarity("hello", "hella")).toBeCloseTo(0.8, 5);
  });

  it("scores small typos high", () => {
    expect(
      levenshteinSimilarity("the quick brown fox", "the quik brown fox"),
    ).toBeGreaterThan(0.94);
  });
});

// =============================================================================
// findFuzzyMatches
// =============================================================================
describe("findFuzzyMatches", () => {
  it("returns the top-k matches sorted by score descending", () => {
    const haystack = "alpha beta gamma alpha beta gamma";
    const matches = findFuzzyMatches(haystack, "alpha beta", 0.9, 2);
    expect(matches.length).toBe(2);
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
  });

  it("returns no matches when nothing scores above threshold", () => {
    expect(findFuzzyMatches("zebra penguin", "the quick brown fox", 0.9, 2)).toEqual(
      [],
    );
  });

  it("returns at most one match when topK=1", () => {
    const haystack = "alpha beta gamma alpha beta gamma";
    expect(findFuzzyMatches(haystack, "alpha beta", 0.9, 1).length).toBe(1);
  });

  it("does not return overlapping matches", () => {
    const haystack = "the quick brown fox the quick brown fox";
    const matches = findFuzzyMatches(haystack, "the quick brown fox", 0.9, 2);
    for (let i = 0; i < matches.length; i++) {
      for (let j = i + 1; j < matches.length; j++) {
        const overlap =
          Math.max(matches[i].start, matches[j].start) <
          Math.min(matches[i].end, matches[j].end);
        expect(overlap).toBe(false);
      }
    }
  });
});

// =============================================================================
// validateClaim — the trust-spine cases from DESIGN.md §6
// =============================================================================
describe("validateClaim — exact and fuzzy positive cases", () => {
  it("returns a claim on exact verbatim match", () => {
    const transcript = [
      seg("we are going to talk about hydration today", 10, 4),
      seg("drink eight glasses of water every day", 14, 3),
    ];
    const result = validateClaim(
      transcript,
      claim("drink eight glasses of water every day"),
    );
    expect(result).not.toBeNull();
    expect(result?.span.startSeconds).toBe(14);
    expect(result?.span.endSeconds).toBe(17);
    expect(result?.matchedText).toContain("drink eight glasses");
  });

  it("returns a claim on fuzzy match with one typo (~0.95 similarity)", () => {
    const transcript = [
      seg("celery juice detoxifies the liver every morning", 5, 5),
    ];
    // model emits a slight paraphrase / typo
    const result = validateClaim(
      transcript,
      claim("celery juice detoxifys the liver every morning"),
    );
    expect(result).not.toBeNull();
    expect(result?.span.startSeconds).toBe(5);
  });

  it("returns a claim when fuzzy score is just above threshold (~0.92)", () => {
    // 50-char string with 4 character substitutions = 46/50 = 0.92 similarity
    const transcript = [seg("the quadratic formula gives exact roots quickly", 0, 5)];
    const result = validateClaim(
      transcript,
      claim("the quadratic farmula gives exact rools quikly"),
      { threshold: 0.9 },
    );
    expect(result).not.toBeNull();
  });

  it("preserves the actual transcript text in matchedText (not the model's verbatim)", () => {
    const transcript = [
      seg("the speaker says studies might support inflammation", 8, 4),
    ];
    const result = validateClaim(
      transcript,
      claim("studies migt support inflamation"),
    );
    expect(result).not.toBeNull();
    expect(result?.matchedText).toBe(
      "the speaker says studies might support inflammation",
    );
    expect(result?.verbatim).toBe("studies migt support inflamation");
  });
});

describe("validateClaim — drop cases (under-promise, never over-promise)", () => {
  it("returns null when verbatim is absent from transcript", () => {
    const transcript = [seg("the weather is nice today", 0, 3)];
    const result = validateClaim(
      transcript,
      claim("blockchain solves world hunger"),
    );
    expect(result).toBeNull();
  });

  it("returns null when best fuzzy score is below threshold", () => {
    const transcript = [seg("the quick brown fox jumps over the lazy dog", 0, 4)];
    // Half the words replaced — should score well below 0.9
    const result = validateClaim(
      transcript,
      claim("the slow purple cat walks past the angry man"),
    );
    expect(result).toBeNull();
  });

  it("returns null when the same phrase appears twice (ambiguous)", () => {
    const transcript = [
      seg("you need to drink more water at noon", 30, 4),
      seg("then later in the day", 34, 2),
      seg("you need to drink more water at night", 255, 4),
    ];
    const result = validateClaim(
      transcript,
      claim("you need to drink more water"),
    );
    // Two near-identical matches separated by ~3.5 minutes — must drop
    expect(result).toBeNull();
  });

  it("returns null when transcript is empty", () => {
    expect(validateClaim([], claim("anything"))).toBeNull();
  });

  it("returns null when verbatim is empty", () => {
    const transcript = [seg("hello world", 0, 1)];
    expect(validateClaim(transcript, claim(""))).toBeNull();
    expect(validateClaim(transcript, claim("   "))).toBeNull();
  });

  it("returns null when transcript is only [Music] markers (effectively empty)", () => {
    const transcript = [
      seg("[Music]", 0, 5),
      seg("[Applause]", 5, 2),
      seg("[♪ instrumental ♪]", 7, 10),
    ];
    expect(validateClaim(transcript, claim("any phrase at all"))).toBeNull();
  });
});

describe("validateClaim — span derivation", () => {
  it("derives a span that crosses two adjacent segments", () => {
    const transcript = [
      seg("the very first part of the claim", 100, 3),
      seg("and the second part comes here", 103, 3),
    ];
    const result = validateClaim(
      transcript,
      claim("first part of the claim and the second part"),
    );
    expect(result).not.toBeNull();
    // Span should start in segment 0 (startSeconds=100) and end at the end
    // of segment 1 (startSeconds=103, duration=3 → end at 106)
    expect(result?.span.startSeconds).toBe(100);
    expect(result?.span.endSeconds).toBe(106);
  });

  it("matches correctly through [Music] markers (normalization strips them)", () => {
    const transcript = [
      seg("the speaker said this is important", 10, 3),
      seg("[Music]", 13, 2),
      seg("and then continued the thought", 15, 3),
    ];
    const result = validateClaim(
      transcript,
      claim("the speaker said this is important"),
    );
    expect(result).not.toBeNull();
    expect(result?.span.startSeconds).toBe(10);
  });

  it("respects the configured threshold", () => {
    const transcript = [seg("the cat sat on the mat", 0, 3)];
    // ~0.86 similarity (3 chars different out of 22)
    const slightlyDifferent = "the bat sat in the mat";
    expect(
      validateClaim(transcript, claim(slightlyDifferent), {
        threshold: 0.95,
      }),
    ).toBeNull();
    expect(
      validateClaim(transcript, claim(slightlyDifferent), {
        threshold: 0.85,
      }),
    ).not.toBeNull();
  });
});

describe("validateClaim — misc invariants", () => {
  it("default threshold is 0.9", () => {
    expect(DEFAULT_THRESHOLD).toBe(0.9);
  });

  it("returned claim preserves id and claim text from input", () => {
    const transcript = [seg("hello world this is a test", 0, 3)];
    const result = validateClaim(
      transcript,
      claim("hello world this is a test", "claim-42", "the claim text"),
    );
    expect(result?.id).toBe("claim-42");
    expect(result?.claim).toBe("the claim text");
    expect(result?.flags).toEqual([]); // classification fills these in later
  });
});
