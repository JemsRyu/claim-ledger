import { NextRequest, NextResponse } from "next/server";
import { fetchTranscript, TranscriptError } from "@/lib/youtube/transcript";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json(
      { error: "Missing 'videoId' query parameter." },
      { status: 400 },
    );
  }
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId." }, { status: 400 });
  }

  try {
    const segments = await fetchTranscript(videoId);
    return NextResponse.json({ segments });
  } catch (error) {
    if (error instanceof TranscriptError) {
      return NextResponse.json(
        { error: error.message, kind: error.kind },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Unexpected error fetching transcript." },
      { status: 502 },
    );
  }
}
