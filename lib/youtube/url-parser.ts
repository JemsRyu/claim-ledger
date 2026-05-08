const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type ParsedYouTubeUrl = {
  videoId: string;
  canonicalUrl: string;
};

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const segments = url.pathname.split("/").filter(Boolean);
      if (
        segments.length >= 2 &&
        (segments[0] === "shorts" ||
          segments[0] === "embed" ||
          segments[0] === "live")
      ) {
        videoId = segments[1] ?? null;
      }
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
