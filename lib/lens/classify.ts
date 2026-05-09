import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { AdversarialFlag, ValidatedClaim } from "./types";
import { ADVERSARIAL_FLAGS } from "./types";

const MODEL_ID = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 256;

const SYSTEM_PROMPT = `You are a classification lens for a YouTube claim auditor.

You will receive the full video transcript and one specific claim made by the speaker. Your job: evaluate which adversarial flags apply to this claim. Return ONLY the flags that CLEARLY apply.

Flags:
- "contradicted": The speaker explicitly contradicts this claim elsewhere in the transcript.
- "hedged": The speaker uses hedging language when stating this claim ("I think", "might", "could", "possibly", "maybe", "studies suggest"). The hedge must be on THIS claim, not a different one.
- "vague-sourced": The claim references an unnamed authority ("studies show", "research indicates", "scientists say", "experts agree") without naming a specific source.
- "unsourced": The claim asserts a fact with no source cited at all. (If "vague-sourced" applies, do NOT also include "unsourced" — they're mutually exclusive; pick the more specific one.)
- "un-credentialed": The speaker has no apparent expertise in the domain of this claim, based on the transcript content. Apply when there's a clear domain mismatch (e.g., a comedian making medical claims).

Be conservative. Only include a flag if it CLEARLY applies. When in doubt, leave it out. Most claims will have 0-2 flags.

Output: a JSON object with a "flags" array. The array may be empty.`;

const FLAGS_SCHEMA = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      items: {
        type: "string",
        enum: [...ADVERSARIAL_FLAGS],
      },
    },
  },
  required: ["flags"],
  additionalProperties: false,
} as const;

export type ClassificationErrorKind =
  | "no-key"
  | "no-credits"
  | "auth"
  | "rate-limited"
  | "bad-request"
  | "unknown";

export class ClassificationError extends Error {
  constructor(
    public readonly kind: ClassificationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ClassificationError";
  }
}

function buildTranscriptText(transcript: TranscriptSegment[]): string {
  return transcript
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join(" ");
}

/**
 * Classify a single validated claim against adversarial flags using
 * Claude Haiku 4.5.
 *
 * Prompt caching: the system prompt + transcript prefix are cached so
 * subsequent claims for the same video read at ~10% of input cost.
 * Claim-specific text comes after the cache breakpoint.
 *
 * Throws ClassificationError on any SDK-level failure; the audit route
 * catches and falls back to mockFlagsForIndex so the demo never breaks.
 */
export async function classifyClaim(
  transcript: TranscriptSegment[],
  claim: ValidatedClaim,
): Promise<AdversarialFlag[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClassificationError(
      "no-key",
      "ANTHROPIC_API_KEY is not set in the environment.",
    );
  }
  if (transcript.length === 0) return [];

  const client = new Anthropic();
  const transcriptText = buildTranscriptText(transcript);
  const claimSection = `Claim to evaluate:\n  Paraphrase: ${claim.claim}\n  Verbatim quote: "${claim.matchedText}"`;

  let response;
  try {
    response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Transcript:\n\n${transcriptText}`,
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: claimSection },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: FLAGS_SCHEMA,
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError) {
      const message = error.message ?? "";
      if (/credit balance/i.test(message)) {
        throw new ClassificationError(
          "no-credits",
          "Anthropic account has insufficient credits.",
        );
      }
      throw new ClassificationError("bad-request", message);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ClassificationError("auth", "Invalid Anthropic API key.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ClassificationError(
        "rate-limited",
        "Anthropic rate limit hit.",
      );
    }
    throw new ClassificationError(
      "unknown",
      error instanceof Error ? error.message : "Unknown classification failure.",
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ClassificationError(
      "unknown",
      "Haiku returned no text content.",
    );
  }

  let parsed: { flags?: unknown };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ClassificationError(
      "unknown",
      "Haiku returned non-JSON despite the schema constraint.",
    );
  }

  if (!Array.isArray(parsed.flags)) return [];

  const validFlags = new Set<string>(ADVERSARIAL_FLAGS);
  return parsed.flags.filter(
    (f): f is AdversarialFlag =>
      typeof f === "string" && validFlags.has(f),
  );
}
