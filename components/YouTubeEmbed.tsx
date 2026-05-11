"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { OembedMetadata } from "@/lib/youtube/oembed";

export type YouTubeEmbedHandle = {
  seekTo: (seconds: number) => void;
};

type Props = {
  videoId: string;
  metadata: OembedMetadata;
};

/**
 * Embedded YouTube player wrapping the official iframe with `enablejsapi=1`,
 * which exposes a postMessage command channel without needing the IFrame
 * Player API script. Parents get an imperative `seekTo(seconds)` handle via
 * ref — clicking a claim's timestamp jumps the embedded video instead of
 * opening a new tab.
 */
export const YouTubeEmbed = forwardRef<YouTubeEmbedHandle, Props>(
  function YouTubeEmbed({ videoId, metadata }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number) => {
          const win = iframeRef.current?.contentWindow;
          if (!win) return;
          // YouTube's iframe API listens for stringified command messages
          // when the embed URL includes `enablejsapi=1`. The second
          // seekTo arg (`true`) means "allow seek ahead even when the
          // target frame isn't buffered yet".
          win.postMessage(
            JSON.stringify({
              event: "command",
              func: "seekTo",
              args: [Math.max(0, seconds), true],
            }),
            "*",
          );
          win.postMessage(
            JSON.stringify({
              event: "command",
              func: "playVideo",
              args: [],
            }),
            "*",
          );
        },
      }),
      [],
    );

    return (
      <article className="flex flex-col gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
            title={metadata.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-1">
          <h2 className="text-balance font-medium leading-snug text-foreground">
            {metadata.title}
          </h2>
          {metadata.authorUrl ? (
            <a
              href={metadata.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start text-sm text-foreground/60 hover:text-foreground"
            >
              {metadata.authorName}
            </a>
          ) : (
            <span className="text-sm text-foreground/60">
              {metadata.authorName}
            </span>
          )}
        </div>
      </article>
    );
  },
);
