"use client";

import { useState, type FormEvent } from "react";
import { VideoCard } from "./VideoCard";
import type { OembedMetadata } from "@/lib/youtube/oembed";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; videoId: string; metadata: OembedMetadata }
  | { kind: "error"; message: string };

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setState({ kind: "loading" });
    try {
      const response = await fetch(
        `/api/oembed?url=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as
        | { videoId: string; metadata: OembedMetadata }
        | { error: string };

      if (!response.ok) {
        const message = "error" in data ? data.error : "Unknown error.";
        setState({ kind: "error", message });
        return;
      }
      if (!("metadata" in data)) {
        setState({ kind: "error", message: "Malformed response." });
        return;
      }
      setState({
        kind: "success",
        videoId: data.videoId,
        metadata: data.metadata,
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error. Please try again.",
      });
    }
  }

  const submitDisabled = state.kind === "loading" || !url.trim();

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
          {state.kind === "loading" ? "Fetching…" : "Audit"}
        </button>
      </form>

      {state.kind === "error" && (
        <p
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {state.message}
        </p>
      )}

      {state.kind === "success" && (
        <VideoCard videoId={state.videoId} metadata={state.metadata} />
      )}
    </div>
  );
}
