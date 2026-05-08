import { NextRequest } from "next/server";
import {
  getMockFixture,
  mockFlagsForIndex,
  synthesizeRawClaims,
} from "@/lib/lens/mock-fixtures";
import { fetchTranscript, TranscriptError } from "@/lib/youtube/transcript";
import { validateClaim } from "@/lib/lens/timestamp-validator";
import type { AuditEvent, ValidatedClaim } from "@/lib/lens/types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$|^MOCK_[A-Z]+$/;

export const dynamic = "force-dynamic";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return new Response("Invalid videoId", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AuditEvent) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      };

      try {
        const fixture = getMockFixture(videoId);

        // Path 1: MOCK_* synthetic IDs and hardcoded non-informational real IDs
        if (fixture) {
          if (fixture.kind === "no-audit-applicable") {
            send({ type: "no-audit-applicable", reason: fixture.reason });
            send({ type: "done" });
            controller.close();
            return;
          }
          await streamPrefabFixture(fixture.claims, send);
          send({ type: "done" });
          controller.close();
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
            controller.close();
            return;
          }
          throw error;
        }

        send({ type: "transcript-ready", segmentCount: transcript.length });
        await sleep(200);

        const rawClaims = synthesizeRawClaims(transcript, 4);
        if (rawClaims.length === 0) {
          send({
            type: "no-audit-applicable",
            reason:
              "Transcript is too short or sparse to identify factual claims.",
          });
          send({ type: "done" });
          controller.close();
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

        for (let i = 0; i < validated.length; i++) {
          send({
            type: "classified",
            claimId: validated[i].id,
            flags: mockFlagsForIndex(i),
          });
          await sleep(150);
        }

        send({ type: "done" });
        controller.close();
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unknown audit error.",
        });
        controller.close();
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
