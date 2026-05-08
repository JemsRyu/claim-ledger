import { NextRequest } from "next/server";
import { getMockFixture } from "@/lib/lens/mock-fixtures";
import type { AuditEvent } from "@/lib/lens/types";

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

        if (fixture.kind === "no-audit-applicable") {
          send({ type: "no-audit-applicable", reason: fixture.reason });
          send({ type: "done" });
          controller.close();
          return;
        }

        send({ type: "lens-start", lens: "extraction" });
        await sleep(400);

        for (const claim of fixture.claims) {
          send({
            type: "claim",
            claim: { id: claim.id, claim: claim.claim, verbatim: claim.verbatim },
          });
          await sleep(120);
          send({
            type: "validated",
            claim: { ...claim, flags: [] },
          });
          await sleep(180);
        }

        send({ type: "lens-start", lens: "classification" });
        await sleep(300);

        for (const claim of fixture.claims) {
          send({
            type: "classified",
            claimId: claim.id,
            flags: claim.flags,
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
