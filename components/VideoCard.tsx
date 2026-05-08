import type { OembedMetadata } from "@/lib/youtube/oembed";

type Props = {
  videoId: string;
  metadata: OembedMetadata;
};

export function VideoCard({ videoId, metadata }: Props) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 sm:flex-row">
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block shrink-0 overflow-hidden rounded-md sm:w-48"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={metadata.thumbnailUrl}
          alt={metadata.title}
          width={metadata.thumbnailWidth || 480}
          height={metadata.thumbnailHeight || 360}
          className="h-auto w-full"
          loading="lazy"
        />
      </a>
      <div className="flex min-w-0 flex-col gap-1.5">
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
}
