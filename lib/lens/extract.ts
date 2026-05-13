import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { RawClaim } from "./types";

const MODEL_ID = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 60_000;
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are an extraction lens for a YouTube claim auditor.

Your job: read a timestamped transcript of an informational video and identify every factual claim the speaker presents as true.

What counts as a claim:
- Assertions about the world, science, history, biology, products, persons, events.
- Hedged claims ("I think", "studies suggest", "might"). The hedging is a separate signal we surface elsewhere; still emit them.
- Opinions framed as fact ("X is harmful," "Y is the best Z"). Emit these.

What does NOT count:
- Personal narrative ("I went to the store"). Skip.
- Opinions framed as opinions ("I personally prefer pineapple"). Skip.
- Throwaway framing ("today we're going to talk about X", "stay tuned"). Skip.
- Performative content (lyrics, fictional dialogue, dramatic monologue). Skip.

For each claim, emit FOUR fields:
- claim: a short paraphrase, one sentence, of what is being asserted.
- verbatim: the EXACT substring from the transcript where the speaker says it.
- searchQuery: a DISCRIMINATING academic-keyword query (NOT a natural-language sentence) that a user could paste into Google Scholar / OpenAlex to find peer-reviewed work specifically on this claim. The query must single out this claim's phenomenon, not match generic words.

  Quality rules:
  • Use multi-word compound phrases over single words. "plant-based diet" beats "plant diet"; "neural plasticity" beats "neural learning".
  • Use the exact academic terminology researchers use, not colloquial paraphrase. "phytochemicals" not "plant chemicals"; "macronutrient adequacy" not "balanced eating"; "trophic level" not "food chain spot".
  • When applicable, add methodology or outcome terms: "meta-analysis", "randomized trial", "cohort study", "longitudinal", "mortality", "deficiency", "biomarker". Skip these if they don't fit.
  • Strip filler ("the", "a", "is") and avoid generic single words ("research", "study", "health", "diet" alone — these match anything).
  • 4-10 terms total. Specificity beats length.

  Examples (BAD versus GOOD for the same claim):
    claim: "Humans are apex predators."
      BAD: "humans predators food chain"  (matches anything about food chains)
      GOOD: "human trophic level Homo sapiens dietary ecology"

    claim: "Sugar causes dopamine release in the brain."
      BAD: "sugar dopamine brain"  (single generic words)
      GOOD: "sucrose dopamine reward pathway mesolimbic nucleus accumbens"

    claim: "You do not need to eat plants to be healthy."
      BAD: "plant-based diet health"  (matches mammal welfare research, plant biology — too broad)
      GOOD: "carnivore diet nutritional adequacy plant-free human health"

    claim: "ReLU is easier to train than sigmoid in deep networks."
      BAD: "ReLU sigmoid deep learning"
      GOOD: "ReLU activation function vanishing gradient deep neural network training"

    claim: "Whole-hearted people fully embrace vulnerability."
      BAD: "vulnerability research"
      GOOD: "self-compassion vulnerability shame qualitative grounded theory"
- verifyQuestion: a natural-language YES/NO question that a curious reader would type into Google to fact-check this claim. Phrase it as a real question, not the claim flipped to a question. Aim for the question someone with healthy skepticism would actually ask. Examples:
    claim: "Humans are apex predators." → verifyQuestion: "Are humans actually apex predators in biology?"
    claim: "There are essential nutrients in meat that cannot be obtained from plants." → verifyQuestion: "Are there essential nutrients only found in meat?"
    claim: "Sugar causes dopamine release in the brain." → verifyQuestion: "Does eating sugar release dopamine in the brain?"
    claim: "ReLU is easier to train than sigmoid in deep networks." → verifyQuestion: "Is ReLU easier to train than sigmoid in deep networks?"

Critical rules:
1. NEVER emit timestamps. Timestamps are derived server-side from your verbatim strings.
2. NEVER invent claims. If the speaker did not assert it, do not include it.
3. The verbatim MUST appear in the transcript word-for-word. Do not paraphrase, fix grammar, or smooth disfluencies in the verbatim field. (You may paraphrase freely in the claim field.)
4. The verbatim MUST be 30-120 characters — a short distinctive phrase, not a paragraph. Pick the single most identifying sentence-fragment that locates the claim in the transcript. The verbatim is fed to a substring matcher; longer verbatims slow it to a crawl. If your verbatim exceeds 120 characters, you are doing it wrong — pick a tighter fragment of the same sentence.
5. The searchQuery must be DISCRIMINATING — it should match the specific phenomenon in this claim, not the generic words that appear in it. Prefer multi-word academic phrases ("plant-based diet" not "plant diet"), exact field terminology over colloquialisms, and methodology / outcome terms when they fit ("meta-analysis", "longitudinal", "deficiency"). A bad searchQuery is the claim text re-encoded; a good one is the terms a researcher would actually use to find this work.
6. The verifyQuestion is a real natural-language question, NOT the claim text with a question mark appended. A reader with healthy skepticism — "wait, is that actually true?" — should sound natural asking it.
7. If the transcript contains no factual claims (music, narrative, fiction, performance), return {"claims": []}.
8. Aim for the most informative claims. A typical 5-minute informational video yields 5-15 claims; a 30-minute interview might yield 30-60. If the video is sparse, fewer is fine. Consolidate redundant claims rather than listing each repetition.

Output: JSON object with a "claims" array. Empty array is valid for non-informational content.`;

const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string", maxLength: 200 },
          verbatim: { type: "string", maxLength: 150 },
          searchQuery: { type: "string", maxLength: 120 },
          verifyQuestion: { type: "string", maxLength: 200 },
        },
        required: ["claim", "verbatim", "searchQuery", "verifyQuestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

export type ExtractionErrorKind =
  | "no-key"
  | "no-credits"
  | "auth"
  | "rate-limited"
  | "bad-request"
  | "unknown";

export class ExtractionError extends Error {
  constructor(
    public readonly kind: ExtractionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

function buildTranscriptText(transcript: TranscriptSegment[]): string {
  return transcript
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join(" ");
}

type MessagesResponse = {
  content?: { type: string; text?: string }[];
};

/**
 * Extract factual claims from a timestamped transcript using Claude Sonnet 4.6.
 *
 * Hits the Messages API directly via fetch — keeps the audit route edge-safe.
 * The official SDK transitively imports node:fs/node:path (its credentials
 * chain), which Vercel's edge function validator rejects on deploy.
 *
 * Uses output_config.format with a json_schema for guaranteed structure, and
 * top-level prompt caching so repeat audits of the same video read from cache
 * (~10% of input price). Throws ExtractionError on any failure; the audit
 * route catches and degrades gracefully.
 */
export async function extractClaims(
  transcript: TranscriptSegment[],
): Promise<RawClaim[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractionError(
      "no-key",
      "ANTHROPIC_API_KEY is not set in the environment.",
    );
  }
  if (transcript.length === 0) return [];

  const transcriptText = buildTranscriptText(transcript);
  const body = {
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    cache_control: { type: "ephemeral" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcript:\n\n${transcriptText}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: CLAIMS_SCHEMA,
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ExtractionError(
        "unknown",
        `Anthropic request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
      );
    }
    throw new ExtractionError(
      "unknown",
      error instanceof Error ? error.message : "Unknown extraction failure.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new ExtractionError("auth", "Invalid Anthropic API key.");
    }
    if (response.status === 429) {
      throw new ExtractionError(
        "rate-limited",
        "Anthropic rate limit hit. Try again shortly.",
      );
    }
    if (response.status === 400) {
      if (/credit balance/i.test(errorText)) {
        throw new ExtractionError(
          "no-credits",
          "Anthropic account has insufficient credits.",
        );
      }
      throw new ExtractionError("bad-request", `Bad request: ${errorText}`);
    }
    throw new ExtractionError(
      "unknown",
      `Anthropic API ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as MessagesResponse;
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new ExtractionError(
      "unknown",
      "Claude returned no text content in the extraction response.",
    );
  }

  let parsed: {
    claims?: {
      claim: string;
      verbatim: string;
      searchQuery?: string;
      verifyQuestion?: string;
    }[];
  };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError(
      "unknown",
      "Claude's response was not valid JSON despite the schema constraint.",
    );
  }

  const claims = parsed.claims ?? [];
  return claims.map((c, i) => {
    const searchQuery = c.searchQuery
      ? String(c.searchQuery).slice(0, 120)
      : undefined;
    const verifyQuestion = c.verifyQuestion
      ? String(c.verifyQuestion).slice(0, 200)
      : undefined;
    return {
      id: `c-${i}`,
      claim: String(c.claim ?? ""),
      // Defensive cap — schema says 150 but models can drift. Validator
      // performance scales sharply with verbatim length (O(L²) hot path),
      // so truncate at the source rather than relying on the model.
      verbatim: String(c.verbatim ?? "").slice(0, 150),
      ...(searchQuery ? { searchQuery } : {}),
      ...(verifyQuestion ? { verifyQuestion } : {}),
    };
  });
}
