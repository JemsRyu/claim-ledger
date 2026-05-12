import type { TranscriptSegment } from "@/lib/youtube/transcript";

import aircAruvnKk from "./aircAruvnKk.json";
import dQw4w9WgXcQ from "./dQw4w9WgXcQ.json";
import iCvmsMzlF7o from "./iCvmsMzlF7o.json";
import jEPgI3RvjSU from "./jEPgI3RvjSU.json";
import lEXBxijQREo from "./lEXBxijQREo.json";
import WSKi8HfcxEk from "./WSKi8HfcxEk.json";

/**
 * Build-time-fetched transcripts for the curated sample gallery.
 *
 * Why these exist as fixtures:
 *   - youtube-transcript.io free tier is 25 lifetime fetches; the curated
 *     samples shouldn't keep eating it on every audit.
 *   - Insurance: if youtube-transcript.io has an outage, the curated
 *     gallery still works — the primary path most visitors take.
 *
 * To regenerate (e.g. when adding a curated sample):
 *   node --input-type=module -e "
 *     import { YoutubeTranscript } from 'youtube-transcript';
 *     import { writeFileSync } from 'fs';
 *     const ids = ['<videoId1>', '<videoId2>'];
 *     for (const id of ids) {
 *       // { lang: 'en' } is critical — multi-language videos default to
 *       // alphabetically-first track (often Arabic/Bangla), not English.
 *       const raw = await YoutubeTranscript.fetchTranscript(id, { lang: 'en' });
 *       const segments = raw.map(s => ({
 *         text: s.text,
 *         startSeconds: s.offset / 1000,
 *         durationSeconds: s.duration / 1000,
 *         lang: s.lang,
 *       }));
 *       writeFileSync('lib/samples/transcripts/' + id + '.json',
 *                     JSON.stringify(segments, null, 2));
 *     }
 *   "
 * Then add the new import + entry below.
 */
export const TRANSCRIPT_FIXTURES: Record<string, TranscriptSegment[]> = {
  aircAruvnKk: aircAruvnKk as TranscriptSegment[],
  dQw4w9WgXcQ: dQw4w9WgXcQ as TranscriptSegment[],
  iCvmsMzlF7o: iCvmsMzlF7o as TranscriptSegment[],
  jEPgI3RvjSU: jEPgI3RvjSU as TranscriptSegment[],
  lEXBxijQREo: lEXBxijQREo as TranscriptSegment[],
  WSKi8HfcxEk: WSKi8HfcxEk as TranscriptSegment[],
};
