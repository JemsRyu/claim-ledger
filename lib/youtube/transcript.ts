import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { fetchTranscriptViaIo, TranscriptIoError } from "./transcript-io";

export type TranscriptSegment = {
  text: string;
  startSeconds: number;
  durationSeconds: number;
  lang?: string;
};

export type TranscriptErrorKind =
  | "disabled"
  | "not-available"
  | "language-not-available"
  | "rate-limited"
  | "video-unavailable"
  | "unknown";

export class TranscriptError extends Error {
  constructor(
    public readonly kind: TranscriptErrorKind,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TranscriptError";
  }
}

type RawSegment = {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
};

/**
 * Fetch a transcript with two-tier fallback:
 *   1. youtube-transcript.io (works on Vercel — third-party service handles
 *      the YouTube fetch from non-blocked egress). Requires
 *      YT_TRANSCRIPT_IO_TOKEN env var.
 *   2. Direct via the youtube-transcript npm package (works locally + for
 *      the rare videos YouTube doesn't block from cloud egress).
 *
 * The .io path runs first because it's reliable on Vercel; direct is only
 * a backup for outages, missing token, or the rate-limit case.
 */
export async function fetchTranscript(
  videoId: string,
): Promise<TranscriptSegment[]> {
  const hasToken = !!process.env.YT_TRANSCRIPT_IO_TOKEN;

  // Tier 1: youtube-transcript.io — works on Vercel
  let ioError: TranscriptIoError | null = null;
  if (hasToken) {
    try {
      return await fetchTranscriptViaIo(videoId);
    } catch (error) {
      if (error instanceof TranscriptIoError) {
        ioError = error;
        if (error.kind === "no-transcript") {
          throw new TranscriptError(
            "disabled",
            404,
            "This video has no captions available.",
          );
        }
        console.warn(
          `[transcript] youtube-transcript.io failed (${error.kind}): ${error.message}. Falling back to direct.`,
        );
      } else {
        throw error;
      }
    }
  }

  // Tier 2: direct via youtube-transcript npm package
  try {
    return await fetchDirectly(videoId);
  } catch (directError) {
    // If both .io and direct failed, surface the .io error — it's far more
    // informative than direct's "no captions enabled" (which on Vercel is
    // a bot-detection masquerade, not the literal cause).
    if (ioError) {
      throw new TranscriptError(
        "unknown",
        502,
        `Primary source (youtube-transcript.io) failed: ${ioError.kind} — ${ioError.message}`,
      );
    }
    if (!hasToken) {
      // Surface the no-token case so the user can see why the .io path was skipped.
      if (directError instanceof TranscriptError && directError.kind === "disabled") {
        throw new TranscriptError(
          "disabled",
          404,
          "Direct fetch failed (likely YouTube blocking serverless egress) and no YT_TRANSCRIPT_IO_TOKEN env var is set to use the third-party fallback.",
        );
      }
    }
    throw directError;
  }
}

async function fetchDirectly(
  videoId: string,
): Promise<TranscriptSegment[]> {
  try {
    const raw = (await YoutubeTranscript.fetchTranscript(
      videoId,
    )) as RawSegment[];
    return raw.map((seg) => ({
      text: seg.text,
      startSeconds: seg.offset / 1000,
      durationSeconds: seg.duration / 1000,
      lang: seg.lang,
    }));
  } catch (error) {
    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new TranscriptError(
        "disabled",
        404,
        "This video has no captions enabled.",
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new TranscriptError(
        "not-available",
        404,
        "No transcript available for this video.",
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new TranscriptError(
        "language-not-available",
        404,
        "Transcript not available in a supported language.",
      );
    }
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      throw new TranscriptError(
        "rate-limited",
        429,
        "YouTube is rate-limiting transcript requests. Try again in a moment.",
      );
    }
    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new TranscriptError(
        "video-unavailable",
        404,
        "Video is unavailable (private, deleted, or region-locked).",
      );
    }
    throw new TranscriptError(
      "unknown",
      502,
      error instanceof Error
        ? error.message
        : "Unknown error fetching transcript.",
    );
  }
}
