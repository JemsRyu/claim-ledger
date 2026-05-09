import type { TranscriptSegment } from "./transcript";

const ENDPOINT = "https://www.youtube-transcript.io/api/transcripts";

export type TranscriptIoErrorKind =
  | "no-token"
  | "rate-limited"
  | "auth"
  | "no-transcript"
  | "upstream"
  | "unknown";

export class TranscriptIoError extends Error {
  constructor(
    public readonly kind: TranscriptIoErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TranscriptIoError";
  }
}

type RawSegment = { start: string; dur: string; text: string };
type RawResponseItem = {
  id: string;
  title?: string;
  tracks?: Array<{ language: string; transcript: RawSegment[] }>;
};

/**
 * Fetch a YouTube transcript via youtube-transcript.io.
 *
 * Why this exists: YouTube blocks Vercel's serverless egress IPs for
 * direct watch-page / Innertube fetches. youtube-transcript.io is a
 * paid third-party service that fetches on its own infrastructure and
 * returns transcripts via a documented API. Reliable from any cloud.
 *
 * Rate limit: 5 requests / 10 seconds (per their docs). Free-tier
 * quota: 25 transcripts (one-time, not per-period).
 *
 * Response shape (empirically confirmed):
 *   [{
 *     id: "<videoId>",
 *     title: "...",
 *     tracks: [{ language: "en", transcript: [{start, dur, text}] }, ...]
 *   }]
 *
 * `start` and `dur` come back as STRINGS; `dur` is occasionally "NaN"
 * for transition/silence frames.
 */
export async function fetchTranscriptViaIo(
  videoId: string,
): Promise<TranscriptSegment[]> {
  const token = process.env.YT_TRANSCRIPT_IO_TOKEN;
  if (!token) {
    throw new TranscriptIoError(
      "no-token",
      "YT_TRANSCRIPT_IO_TOKEN environment variable is not set.",
    );
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [videoId] }),
    });
  } catch (error) {
    throw new TranscriptIoError(
      "upstream",
      error instanceof Error ? error.message : "Network error contacting youtube-transcript.io.",
    );
  }

  if (response.status === 429) {
    throw new TranscriptIoError(
      "rate-limited",
      "youtube-transcript.io rate limit hit (5 requests / 10 seconds). Try again shortly.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new TranscriptIoError(
      "auth",
      `youtube-transcript.io rejected the API token (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new TranscriptIoError(
      "upstream",
      `youtube-transcript.io returned HTTP ${response.status}.`,
    );
  }

  let data: RawResponseItem[];
  try {
    data = (await response.json()) as RawResponseItem[];
  } catch {
    throw new TranscriptIoError(
      "upstream",
      "youtube-transcript.io returned a non-JSON response.",
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new TranscriptIoError(
      "upstream",
      "youtube-transcript.io returned an empty or malformed response.",
    );
  }

  const item = data[0];
  if (!item || item.id !== videoId) {
    throw new TranscriptIoError(
      "upstream",
      `Response videoId mismatch: expected ${videoId}, got ${item?.id ?? "<missing>"}.`,
    );
  }

  if (!item.tracks || item.tracks.length === 0) {
    throw new TranscriptIoError(
      "no-transcript",
      "No transcript tracks available for this video.",
    );
  }

  // Prefer English; fall back to first available track.
  const track =
    item.tracks.find((t) => t.language === "en") ?? item.tracks[0];

  const segments: TranscriptSegment[] = [];
  for (const raw of track.transcript ?? []) {
    const start = Number(raw.start);
    const durRaw = Number(raw.dur);
    const dur = Number.isFinite(durRaw) ? durRaw : 0;
    if (!Number.isFinite(start)) continue;
    if (typeof raw.text !== "string") continue;
    segments.push({
      text: raw.text,
      startSeconds: start,
      durationSeconds: dur,
      lang: track.language,
    });
  }

  if (segments.length === 0) {
    throw new TranscriptIoError(
      "no-transcript",
      "Transcript track returned no usable segments.",
    );
  }

  return segments;
}
