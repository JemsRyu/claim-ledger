import { NextRequest, NextResponse } from "next/server";
import { researchClaim, ResearchError } from "@/lib/lens/research";

// Node runtime — this is a single-shot request/response, no streaming.
// Anthropic SDK isn't imported (we use raw fetch in research.ts) so the
// Edge runtime constraint doesn't apply here; Node is fine and cheaper
// to cold-start.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  claim?: string;
  verbatim?: string;
  searchQuery?: string;
};

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const claim = (body.claim ?? "").trim();
  const verbatim = (body.verbatim ?? "").trim();
  const searchQuery = (body.searchQuery ?? "").trim();

  if (!claim || !searchQuery) {
    return NextResponse.json(
      { error: "Missing 'claim' or 'searchQuery' in body." },
      { status: 400 },
    );
  }

  try {
    const result = await researchClaim({ claim, verbatim, searchQuery });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResearchError) {
      const status =
        error.kind === "no-key" || error.kind === "bad-input"
          ? 400
          : error.kind === "ss-rate-limited"
            ? 429
            : 502;
      return NextResponse.json(
        { error: error.message, kind: error.kind },
        { status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown research failure.",
      },
      { status: 500 },
    );
  }
}
