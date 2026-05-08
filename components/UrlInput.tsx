"use client";

import { useState, type FormEvent } from "react";
import { VideoCard } from "./VideoCard";
import { TranscriptView } from "./TranscriptView";
import { Ledger } from "./Ledger";
import { SampleGallery } from "./SampleGallery";
import type { OembedMetadata } from "@/lib/youtube/oembed";
import type { TranscriptSegment } from "@/lib/youtube/transcript";

type TranscriptState =
  | { kind: "loading" }
  | { kind: "ready"; segments: TranscriptSegment[] }
  | { kind: "error"; message: string };

type FetchState =
  | { kind: "idle" }
  | { kind: "loading-metadata" }
  | { kind: "metadata-error"; message: string }
  | {
      kind: "loaded";
      videoId: string;
      metadata: OembedMetadata;
      transcript: TranscriptState;
    };

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  async function runAudit(submittedUrl: string) {
    const trimmed = submittedUrl.trim();
    if (!trimmed) return;

    setState({ kind: "loading-metadata" });

    let videoId: string;
    let metadata: OembedMetadata;
    try {
      const response = await fetch(
        `/api/oembed?url=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as
        | { videoId: string; metadata: OembedMetadata }
        | { error: string };

      if (!response.ok) {
        const message = "error" in data ? data.error : "Unknown error.";
        setState({ kind: "metadata-error", message });
        return;
      }
      if (!("metadata" in data)) {
        setState({ kind: "metadata-error", message: "Malformed response." });
        return;
      }
      videoId = data.videoId;
      metadata = data.metadata;
    } catch {
      setState({
        kind: "metadata-error",
        message: "Network error. Please try again.",
      });
      return;
    }

    setState({
      kind: "loaded",
      videoId,
      metadata,
      transcript: { kind: "loading" },
    });

    try {
      const response = await fetch(
        `/api/transcript?videoId=${encodeURIComponent(videoId)}`,
      );
      const data = (await response.json()) as
        | { segments: TranscriptSegment[] }
        | { error: string; kind?: string };

      if (!response.ok) {
        const message =
          "error" in data ? data.error : "Failed to load transcript.";
        setState({
          kind: "loaded",
          videoId,
          metadata,
          transcript: { kind: "error", message },
        });
        return;
      }
      if (!("segments" in data)) {
        setState({
          kind: "loaded",
          videoId,
          metadata,
          transcript: {
            kind: "error",
            message: "Malformed transcript response.",
          },
        });
        return;
      }
      setState({
        kind: "loaded",
        videoId,
        metadata,
        transcript: { kind: "ready", segments: data.segments },
      });
    } catch {
      setState({
        kind: "loaded",
        videoId,
        metadata,
        transcript: {
          kind: "error",
          message: "Network error fetching transcript.",
        },
      });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runAudit(url);
  }

  function handleSampleSelect(sampleUrl: string) {
    setUrl(sampleUrl);
    void runAudit(sampleUrl);
  }

  const isAuditing =
    state.kind === "loading-metadata" ||
    (state.kind === "loaded" && state.transcript.kind === "loading");
  const submitDisabled = state.kind === "loading-metadata" || !url.trim();

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube URL…"
          aria-label="YouTube URL"
          className="flex-1 rounded-md border border-foreground/15 bg-foreground/[0.02] px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-foreground/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === "loading-metadata" ? "Fetching…" : "Audit"}
        </button>
      </form>

      {state.kind === "idle" && (
        <SampleGallery disabled={isAuditing} onSelect={handleSampleSelect} />
      )}

      {state.kind === "metadata-error" && (
        <>
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
          <SampleGallery disabled={isAuditing} onSelect={handleSampleSelect} />
        </>
      )}

      {state.kind === "loaded" && (
        <>
          <VideoCard videoId={state.videoId} metadata={state.metadata} />

          {state.transcript.kind === "loading" && (
            <p className="text-sm text-foreground/50">Loading transcript…</p>
          )}

          {state.transcript.kind === "error" && (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-sm">
              <p className="text-foreground/80">{state.transcript.message}</p>
              <p className="mt-1 text-xs text-foreground/50">
                Auditing requires a transcript. This video can&rsquo;t be
                audited until captions are available.
              </p>
            </div>
          )}

          {state.transcript.kind === "ready" && (
            <>
              <TranscriptView
                videoId={state.videoId}
                segments={state.transcript.segments}
              />
              <Ledger videoId={state.videoId} />
            </>
          )}
        </>
      )}
    </div>
  );
}
