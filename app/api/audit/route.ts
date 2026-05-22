import { NextRequest } from "next/server";
import {
  getMockFixture,
  mockFlagsForIndex,
  synthesizeRawClaims,
} from "@/lib/lens/mock-fixtures";
import { fetchTranscript, TranscriptError } from "@/lib/youtube/transcript";
import { validateClaim } from "@/lib/lens/timestamp-validator";
import { extractClaims, ExtractionError } from "@/lib/lens/extract";
import { classifyClaim, ClassificationError } from "@/lib/lens/classify";
import { guardHedge } from "@/lib/lens/hedge-guard";
import type {
  AdversarialFlag,
  AuditEvent,
  RawClaim,
  ValidatedClaim,
} from "@/lib/lens/types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$|^MOCK_[A-Z]+$/;

// Edge runtime: streaming budget on Vercel Hobby is 300s vs 10s for Node
// functions. Real Sonnet extraction on a long transcript + parallel
// Haiku classification can blow past 10s. The audit endpoint is the
// only route that needs this — /api/transcript and /api/oembed stay
// on Node (single-shot, fast).
export const runtime = "edge";
export const dynamic = "force-dynamic";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Race a promise against a timeout. Returns the resolved value, or rejects
 * with a timeout error if the deadline passes first. Belt-and-suspenders
 * guard above the per-SDK timeouts in extract.ts and classify.ts — if a
 * downstream SDK hangs without honoring its own timeout, the audit
 * pipeline still moves on.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} exceeded ${ms}ms hard timeout`)),
        ms,
      ),
    ),
  ]);
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return new Response("Invalid videoId", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Vercel's edge proxy buffers SSE responses until ~enough bytes
      // accumulate, which makes the audit feel chunky (events arrive in
      // 10-15s clumps rather than streaming smoothly). Comment lines (`:`)
      // are valid SSE per spec — clients ignore them — so we use them as
      // a keepalive that pushes the proxy past its buffer threshold.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Controller already closed; the interval will be cleared below.
        }
      }, 3000);

      const send = (event: AuditEvent) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      };

      const close = () => {
        clearInterval(keepalive);
        controller.close();
      };

      try {
        const fixture = getMockFixture(videoId);

        // Path 1: MOCK_* synthetic IDs and hardcoded non-informational real IDs
        if (fixture) {
          if (fixture.kind === "no-audit-applicable") {
            send({ type: "no-audit-applicable", reason: fixture.reason });
            send({ type: "done" });
            close();
            return;
          }
          await streamPrefabFixture(fixture.claims, send);
          send({ type: "done" });
          close();
          return;
        }

        // Path 2: real videoId — synthesize from transcript, run through validator
        let transcript;
        try {
          transcript = await fetchTranscript(videoId);
        } catch (error) {
          if (error instanceof TranscriptError) {
            send({ type: "no-transcript", reason: error.message });
            send({ type: "done" });
            close();
            return;
          }
          throw error;
        }

        send({ type: "transcript-ready", segmentCount: transcript.length });
        await sleep(200);

        // Try real Sonnet 4.6 extraction first; fall back to the synthesizer
        // on any SDK error (no key, no credits, rate limit, network) or
        // hard timeout. The fallback keeps the demo working regardless.
        let rawClaims: RawClaim[];
        let extractionMode: "live" | "synthesizer" = "live";
        let failureReason: string | undefined;
        try {
          rawClaims = await withTimeout(
            extractClaims(transcript),
            90_000,
            "extractClaims",
          );
        } catch (error) {
          extractionMode = "synthesizer";
          if (error instanceof ExtractionError) {
            failureReason = error.kind;
            console.warn(
              `[audit] live extraction failed (${error.kind}): ${error.message}. Falling back to synthesizer.`,
            );
          } else {
            failureReason = "unknown";
            console.warn(
              "[audit] live extraction threw unexpectedly. Falling back to synthesizer.",
              error,
            );
          }
          rawClaims = synthesizeRawClaims(transcript, 4, failureReason);
        }

        if (rawClaims.length === 0) {
          send({
            type: "no-audit-applicable",
            reason:
              extractionMode === "live"
                ? "The auditor surfaces factual claims, and none were identified. Likely non-informational content (narrative, performance, music)."
                : "Transcript too short or sparse to demonstrate the audit on this video.",
          });
          send({ type: "done" });
          close();
          return;
        }

        send({ type: "lens-start", lens: "extraction" });
        await sleep(300);

        const validated: ValidatedClaim[] = [];
        for (const raw of rawClaims) {
          send({ type: "claim", claim: raw });
          await sleep(120);
          const result = validateClaim(transcript, raw);
          if (result) {
            validated.push(result);
            send({ type: "validated", claim: result });
          }
          await sleep(180);
        }

        send({ type: "lens-start", lens: "classification" });
        await sleep(300);

        // Classify all claims in parallel via Haiku 4.5. Each call is
        // independent — one failure doesn't block the others; that claim
        // gets mock flags as fallback. Emit events sequentially with
        // small spacing so the UI shows the progressive-classification
        // animation rather than a burst.
        const flagResults = await Promise.all(
          validated.map(async (claim, i) => {
            let flags: AdversarialFlag[];
            try {
              flags = await withTimeout(
                classifyClaim(transcript, claim),
                30_000,
                `classify ${claim.id}`,
              );
            } catch (error) {
              if (error instanceof ClassificationError) {
                console.warn(
                  `[audit] classify ${claim.id} failed (${error.kind}): ${error.message}. Using mock flags.`,
                );
              } else {
                console.warn(
                  `[audit] classify ${claim.id} threw unexpectedly. Using mock flags.`,
                  error,
                );
              }
              flags = mockFlagsForIndex(i) as AdversarialFlag[];
            }
            // Trust-spine guard: model emits, server enforces. Strip the
            // "hedged" flag if no hedge token appears in the matched span,
            // since the prompt's hedge-locality rule isn't reliably honored
            // when the speaker hedges elsewhere in the transcript.
            return guardHedge(flags, claim.matchedText);
          }),
        );

        for (let i = 0; i < validated.length; i++) {
          send({
            type: "classified",
            claimId: validated[i].id,
            flags: flagResults[i],
          });
          await sleep(150);
        }

        send({ type: "done" });
        close();
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unknown audit error.",
        });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function streamPrefabFixture(
  claims: ValidatedClaim[],
  send: (event: AuditEvent) => void,
) {
  send({ type: "lens-start", lens: "extraction" });
  await sleep(400);
  for (const claim of claims) {
    send({
      type: "claim",
      claim: { id: claim.id, claim: claim.claim, verbatim: claim.verbatim },
    });
    await sleep(120);
    send({ type: "validated", claim: { ...claim, flags: [] } });
    await sleep(180);
  }
  send({ type: "lens-start", lens: "classification" });
  await sleep(300);
  for (const claim of claims) {
    send({
      type: "classified",
      claimId: claim.id,
      flags: claim.flags,
    });
    await sleep(150);
  }
}
