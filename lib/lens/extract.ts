import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { RawClaim } from "./types";

const MODEL_ID = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 30_000;

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

For each claim, emit two fields:
- claim: a short paraphrase, one sentence, of what is being asserted.
- verbatim: the EXACT substring from the transcript where the speaker says it.

Critical rules:
1. NEVER emit timestamps. Timestamps are derived server-side from your verbatim strings.
2. NEVER invent claims. If the speaker did not assert it, do not include it.
3. The verbatim MUST appear in the transcript word-for-word. Do not paraphrase, fix grammar, or smooth disfluencies in the verbatim field. (You may paraphrase freely in the claim field.)
4. If the transcript contains no factual claims (music, narrative, fiction, performance), return {"claims": []}.
5. Aim for the most informative claims. A typical 5-minute informational video yields 5-15 claims; a 30-minute interview might yield 30-60. If the video is sparse, fewer is fine.

Output: JSON object with a "claims" array. Empty array is valid for non-informational content.`;

const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          verbatim: { type: "string" },
        },
        required: ["claim", "verbatim"],
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

/**
 * Extract factual claims from a timestamped transcript using Claude Sonnet 4.6.
 *
 * Uses output_config.format with a json_schema for guaranteed structure, and
 * top-level prompt caching so repeat audits of the same video read from cache
 * (~10% of input price). Falls back to throwing ExtractionError on any
 * SDK-level failure; the audit route catches and degrades gracefully.
 *
 * The model never emits timestamps (per system prompt). All timestamps are
 * derived downstream by validateClaim against the same transcript.
 */
export async function extractClaims(
  transcript: TranscriptSegment[],
): Promise<RawClaim[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError(
      "no-key",
      "ANTHROPIC_API_KEY is not set in the environment.",
    );
  }
  if (transcript.length === 0) return [];

  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  const transcriptText = buildTranscriptText(transcript);

  let response;
  try {
    response = await client.messages.create({
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
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError) {
      const message = error.message ?? "";
      if (/credit balance/i.test(message)) {
        throw new ExtractionError(
          "no-credits",
          "Anthropic account has insufficient credits.",
        );
      }
      throw new ExtractionError("bad-request", `Bad request: ${message}`);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ExtractionError("auth", "Invalid Anthropic API key.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractionError(
        "rate-limited",
        "Anthropic rate limit hit. Try again shortly.",
      );
    }
    throw new ExtractionError(
      "unknown",
      error instanceof Error ? error.message : "Unknown extraction failure.",
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ExtractionError(
      "unknown",
      "Claude returned no text content in the extraction response.",
    );
  }

  let parsed: { claims?: { claim: string; verbatim: string }[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError(
      "unknown",
      "Claude's response was not valid JSON despite the schema constraint.",
    );
  }

  const claims = parsed.claims ?? [];
  return claims.map((c, i) => ({
    id: `c-${i}`,
    claim: String(c.claim ?? ""),
    verbatim: String(c.verbatim ?? ""),
  }));
}
