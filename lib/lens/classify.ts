import type { TranscriptSegment } from "@/lib/youtube/transcript";
import type { AdversarialFlag, ValidatedClaim } from "./types";
import { ADVERSARIAL_FLAGS } from "./types";

const MODEL_ID = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 256;
const REQUEST_TIMEOUT_MS = 20_000;
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are a classification lens for a YouTube claim auditor.

You will receive the full video transcript and one specific claim made by the speaker. Your job: evaluate which adversarial flags apply to this claim. Return all flags that apply.

Flags:
- "contradicted": The speaker explicitly contradicts this claim elsewhere in the transcript.
- "hedged": The speaker uses hedging language when stating THIS claim ("I think", "might", "could", "possibly", "maybe", "studies suggest"). The hedge must be on this specific claim, not a different one.
- "vague-sourced": The claim cites an unnamed authority ("studies show", "research indicates", "scientists say", "experts agree", "a study found") without naming a specific source by name, year, or publication.
- "unsourced": The claim asserts a specific fact — a number, date, statistic, named entity, comparison, or causal relationship — and the transcript does NOT cite any source for it. This is the DEFAULT state for factual claims in most informational videos; do not skip it because the fact "sounds well-known". If "vague-sourced" applies, use that instead — they're mutually exclusive.
- "un-credentialed": The speaker has no apparent expertise in the domain of this claim, based on the transcript content. Apply when there's a clear domain mismatch (e.g., a comedian making medical claims).

Apply flags decisively. The auditor's value comes from surfacing unsourced and weakly-sourced claims, so under-flagging is a worse failure mode than over-flagging. Specifically:
- Numerical or dated factual claims (years, dollar amounts, percentages, employee counts) with no cited source → unsourced.
- Mechanism / definitional / how-it-works claims (e.g. "the sigmoid function squishes input to 0-1") are NOT factual assertions about the world that need sourcing — leave unflagged unless the speaker hedges or contradicts.
- Personal narrative ("I went to college at Reed") is not a factual claim that needs sourcing — leave unflagged.

Worked examples (use these to calibrate; the actual claim is below):
  Claim: "In 1979, General Motors employed more than 800,000 workers and made about $11 billion." → ["unsourced"]
    (Specific year + employee count + revenue, no source cited in transcript.)
  Claim: "A 2013 study found that almost half of US jobs could be automated." → ["vague-sourced"]
    (Cites "a 2013 study" but no author, journal, or specific title.)
  Claim: "Studies suggest that meditation might help with anxiety." → ["vague-sourced", "hedged"]
    (Vague authority + hedging language on the same claim.)
  Claim: "The sigmoid function squishes its input to a value between 0 and 1." → []
    (Mathematical definition / mechanism — not a factual world-claim.)
  Claim: "I dropped out of Reed College after six months." → []
    (First-person narrative — speaker's own life, not a sourceable external fact.)

Output: a JSON object with a "flags" array. Empty array is valid for claims with no applicable flag.`;

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

const EMIT_FLAGS_TOOL = {
  name: "emit_flags",
  description:
    "Emit the list of adversarial flags that apply to this claim. Always call this tool exactly once with the full flags array.",
  input_schema: FLAGS_SCHEMA,
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

type MessagesResponse = {
  content?: ({ type: "text"; text?: string } | { type: "tool_use"; name?: string; input?: unknown })[];
};

/**
 * Classify a single validated claim against adversarial flags using
 * Claude Haiku 4.5.
 *
 * Hits the Messages API directly via fetch — keeps the audit route edge-safe.
 * Uses tool-use with a forced tool_choice so the response comes back as a
 * structured tool_use block (no JSON.parse on free-form text). Prompt
 * caching: the transcript prefix is cached so subsequent claims for the same
 * video read at ~10% of input cost. Claim-specific text comes after the cache
 * breakpoint.
 *
 * Throws ClassificationError on any failure; the audit route catches and
 * falls back to mockFlagsForIndex so the demo never breaks.
 */
export async function classifyClaim(
  transcript: TranscriptSegment[],
  claim: ValidatedClaim,
): Promise<AdversarialFlag[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClassificationError(
      "no-key",
      "ANTHROPIC_API_KEY is not set in the environment.",
    );
  }
  if (transcript.length === 0) return [];

  const transcriptText = buildTranscriptText(transcript);
  const claimSection = `Claim to evaluate:\n  Paraphrase: ${claim.claim}\n  Verbatim quote: "${claim.matchedText}"`;

  const body = {
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [EMIT_FLAGS_TOOL],
    tool_choice: { type: "tool", name: EMIT_FLAGS_TOOL.name },
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
      throw new ClassificationError(
        "unknown",
        `Anthropic request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
      );
    }
    throw new ClassificationError(
      "unknown",
      error instanceof Error ? error.message : "Unknown classification failure.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new ClassificationError("auth", "Invalid Anthropic API key.");
    }
    if (response.status === 429) {
      throw new ClassificationError("rate-limited", "Anthropic rate limit hit.");
    }
    if (response.status === 400) {
      if (/credit balance/i.test(errorText)) {
        throw new ClassificationError(
          "no-credits",
          "Anthropic account has insufficient credits.",
        );
      }
      throw new ClassificationError("bad-request", errorText);
    }
    throw new ClassificationError(
      "unknown",
      `Anthropic API ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as MessagesResponse;
  const toolUse = data.content?.find(
    (b): b is { type: "tool_use"; name?: string; input?: unknown } =>
      b.type === "tool_use" && b.name === EMIT_FLAGS_TOOL.name,
  );
  if (!toolUse || !toolUse.input || typeof toolUse.input !== "object") {
    throw new ClassificationError(
      "unknown",
      "Haiku did not return an emit_flags tool_use block.",
    );
  }

  const parsed = toolUse.input as { flags?: unknown };
  if (!Array.isArray(parsed.flags)) return [];

  const validFlags = new Set<string>(ADVERSARIAL_FLAGS);
  return parsed.flags.filter(
    (f): f is AdversarialFlag =>
      typeof f === "string" && validFlags.has(f),
  );
}
