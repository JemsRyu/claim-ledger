export type OembedMetadata = {
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
};

export class OembedError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OembedError";
  }
}

export async function fetchOembedMetadata(
  canonicalUrl: string,
): Promise<OembedMetadata> {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), {
    next: { revalidate: 3600 },
  });

  if (response.status === 401) {
    throw new OembedError(
      401,
      "This video is private, age-gated, or blocked from embedding.",
    );
  }
  if (response.status === 404) {
    throw new OembedError(404, "Video not found.");
  }
  if (!response.ok) {
    throw new OembedError(
      response.status,
      `Failed to fetch video metadata (HTTP ${response.status}).`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    title: String(data.title ?? ""),
    authorName: String(data.author_name ?? ""),
    authorUrl: String(data.author_url ?? ""),
    thumbnailUrl: String(data.thumbnail_url ?? ""),
    thumbnailWidth: Number(data.thumbnail_width ?? 0),
    thumbnailHeight: Number(data.thumbnail_height ?? 0),
  };
}
