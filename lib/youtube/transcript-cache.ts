import type { TranscriptSegment } from "./transcript";

/**
 * Module-scope LRU-style cache for transcripts, keyed by videoId.
 *
 * Why this is here: youtube-transcript.io's free tier is 25 lifetime
 * fetches. Without caching, a single user who refreshes the page five
 * times burns 5 quota slots on the same video. With this cache, only
 * the first fetch counts; subsequent fetches inside the TTL hit memory.
 *
 * Vercel reality: serverless function instances share memory only
 * within a warm-start window (~5 min idle before cold). Same-instance
 * cache hits are common for back-to-back requests; cold starts always
 * miss. This is fine — the goal is reducing quota burn from active
 * sessions, not building a CDN.
 *
 * Fixture-keyed videoIds are NOT cached here because they're already
 * served from the static map and can't burn quota.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 64;

type CacheEntry = {
  segments: TranscriptSegment[];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function getCachedTranscript(
  videoId: string,
): TranscriptSegment[] | null {
  const entry = cache.get(videoId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(videoId);
    return null;
  }
  // Move to end of insertion order to mark as recently used
  cache.delete(videoId);
  cache.set(videoId, entry);
  return entry.segments;
}

export function setCachedTranscript(
  videoId: string,
  segments: TranscriptSegment[],
): void {
  if (segments.length === 0) return;
  cache.set(videoId, {
    segments,
    expiresAt: Date.now() + TTL_MS,
  });
  // Evict oldest if over capacity
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}
