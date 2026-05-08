import { NextRequest, NextResponse } from "next/server";
import { parseYouTubeUrl } from "@/lib/youtube/url-parser";
import { fetchOembedMetadata, OembedError } from "@/lib/youtube/oembed";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter." },
      { status: 400 },
    );
  }

  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Not a valid YouTube URL." },
      { status: 400 },
    );
  }

  try {
    const metadata = await fetchOembedMetadata(parsed.canonicalUrl);
    return NextResponse.json({ videoId: parsed.videoId, metadata });
  } catch (error) {
    if (error instanceof OembedError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Unexpected error fetching video metadata." },
      { status: 502 },
    );
  }
}
