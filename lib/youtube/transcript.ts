import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";

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

export async function fetchTranscript(
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
