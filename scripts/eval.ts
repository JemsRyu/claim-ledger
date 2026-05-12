/**
 * P2.3 evaluation harness — runs the full audit pipeline (extract +
 * validate + classify) against the curated sample fixtures and dumps the
 * results to JSON snapshots. Each invocation writes to a timestamped
 * subdirectory under eval-output/, so prompt-tuning iterations are diffable.
 *
 * Usage:
 *   npm run eval                          # all samples, one run each (music: 3 runs)
 *   npm run eval -- --only=aircAruvnKk    # one sample
 *   npm run eval -- --no-classify         # extraction only (cheaper, faster)
 *
 * Requires ANTHROPIC_API_KEY in .env.local (loaded via Node's --env-file flag
 * configured in the npm script).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { CURATED_SAMPLES } from "../lib/samples/curated";
import { TRANSCRIPT_FIXTURES } from "../lib/samples/transcripts";
import type { TranscriptSegment } from "../lib/youtube/transcript";
import { extractClaims, ExtractionError } from "../lib/lens/extract";
import { classifyClaim, ClassificationError } from "../lib/lens/classify";
import { validateClaim } from "../lib/lens/timestamp-validator";
import type { AdversarialFlag, ValidatedClaim } from "../lib/lens/types";

type SampleResult = {
  sampleId: string;
  label: string;
  expectedKind: "audit" | "no-audit-applicable";
  transcriptSegmentCount: number;
  runs: RunResult[];
};

type RunResult = {
  runIndex: number;
  durationMs: number;
  rawClaimCount: number;
  validatedClaimCount: number;
  validationDropRate: number;
  claims: EvaluatedClaim[];
  error?: string;
};

type EvaluatedClaim = {
  id: string;
  claim: string;
  verbatim: string;
  searchQuery?: string;
  verifyQuestion?: string;
  validated: boolean;
  matchedText?: string;
  startSeconds?: number;
  endSeconds?: number;
  flags?: AdversarialFlag[];
  classifyError?: string;
};

type Args = {
  only?: string;
  classify: boolean;
  musicRuns: number;
};

function parseArgs(): Args {
  const args: Args = { classify: true, musicRuns: 3 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length);
    else if (arg === "--no-classify") args.classify = false;
    else if (arg.startsWith("--music-runs=")) {
      args.musicRuns = parseInt(arg.slice("--music-runs=".length), 10);
    }
  }
  return args;
}

async function runOne(
  sampleId: string,
  transcript: TranscriptSegment[],
  runIndex: number,
  classify: boolean,
): Promise<RunResult> {
  const start = Date.now();
  let rawClaims;
  try {
    const t0 = Date.now();
    rawClaims = await extractClaims(transcript);
    console.log(
      `    [${sampleId}.${runIndex}] extract: ${rawClaims.length} claims in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  } catch (error) {
    return {
      runIndex,
      durationMs: Date.now() - start,
      rawClaimCount: 0,
      validatedClaimCount: 0,
      validationDropRate: 0,
      claims: [],
      error:
        error instanceof ExtractionError
          ? `[${error.kind}] ${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown extraction failure",
    };
  }

  const evaluated: EvaluatedClaim[] = [];
  const validated: ValidatedClaim[] = [];
  const tValidate = Date.now();
  for (const raw of rawClaims) {
    const tClaim = Date.now();
    const v = validateClaim(transcript, raw);
    const dt = Date.now() - tClaim;
    if (dt > 1000) {
      console.log(
        `    [${sampleId}.${runIndex}] validate ${raw.id} took ${(dt / 1000).toFixed(1)}s (verbatim len ${raw.verbatim.length})`,
      );
    }
    if (v) {
      validated.push(v);
      evaluated.push({
        id: v.id,
        claim: v.claim,
        verbatim: v.verbatim,
        searchQuery: v.searchQuery,
        verifyQuestion: v.verifyQuestion,
        validated: true,
        matchedText: v.matchedText,
        startSeconds: v.span.startSeconds,
        endSeconds: v.span.endSeconds,
      });
    } else {
      evaluated.push({
        id: raw.id,
        claim: raw.claim,
        verbatim: raw.verbatim,
        searchQuery: raw.searchQuery,
        verifyQuestion: raw.verifyQuestion,
        validated: false,
      });
    }
  }

  console.log(
    `    [${sampleId}.${runIndex}] validate: ${validated.length}/${rawClaims.length} in ${((Date.now() - tValidate) / 1000).toFixed(1)}s`,
  );

  if (classify && validated.length > 0) {
    const tClassify = Date.now();
    const flagResults = await Promise.all(
      validated.map(async (claim) => {
        try {
          return { id: claim.id, flags: await classifyClaim(transcript, claim) };
        } catch (error) {
          return {
            id: claim.id,
            flags: [] as AdversarialFlag[],
            classifyError:
              error instanceof ClassificationError
                ? `[${error.kind}] ${error.message}`
                : error instanceof Error
                  ? error.message
                  : "unknown classify failure",
          };
        }
      }),
    );
    const byId = new Map(flagResults.map((r) => [r.id, r]));
    for (const claim of evaluated) {
      if (!claim.validated) continue;
      const r = byId.get(claim.id);
      if (r) {
        claim.flags = r.flags;
        if (r.classifyError) claim.classifyError = r.classifyError;
      }
    }
    console.log(
      `    [${sampleId}.${runIndex}] classify: ${validated.length} claims in ${((Date.now() - tClassify) / 1000).toFixed(1)}s`,
    );
  }

  const validationDropRate =
    rawClaims.length === 0
      ? 0
      : (rawClaims.length - validated.length) / rawClaims.length;

  return {
    runIndex,
    durationMs: Date.now() - start,
    rawClaimCount: rawClaims.length,
    validatedClaimCount: validated.length,
    validationDropRate,
    claims: evaluated,
  };
}

async function main() {
  const args = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Run via `npm run eval` (loads .env.local).",
    );
    process.exit(1);
  }

  const samples = args.only
    ? CURATED_SAMPLES.filter((s) => s.id === args.only)
    : CURATED_SAMPLES;
  if (samples.length === 0) {
    console.error(`No samples matched --only=${args.only}`);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("eval-output", timestamp);
  mkdirSync(outDir, { recursive: true });
  console.log(`Writing results to ${outDir}\n`);

  for (const sample of samples) {
    const transcript = TRANSCRIPT_FIXTURES[sample.id];
    if (!transcript) {
      console.warn(`[${sample.id}] no fixture, skipping`);
      continue;
    }
    const runCount =
      sample.expectedKind === "no-audit-applicable" ? args.musicRuns : 1;
    console.log(
      `[${sample.id}] ${sample.label} — ${transcript.length} segments — ${runCount} run(s)`,
    );

    const runs: RunResult[] = [];
    for (let i = 0; i < runCount; i++) {
      const result = await runOne(sample.id, transcript, i, args.classify);
      runs.push(result);
      const flagSummary =
        result.claims
          .flatMap((c) => c.flags ?? [])
          .reduce<Record<string, number>>(
            (acc, f) => ((acc[f] = (acc[f] ?? 0) + 1), acc),
            {},
          ) ?? {};
      console.log(
        `  run ${i}: raw=${result.rawClaimCount} validated=${result.validatedClaimCount} ` +
          `drop=${(result.validationDropRate * 100).toFixed(0)}% ` +
          `flags=${JSON.stringify(flagSummary)} ` +
          `time=${(result.durationMs / 1000).toFixed(1)}s` +
          (result.error ? ` ERROR=${result.error}` : ""),
      );
    }

    const out: SampleResult = {
      sampleId: sample.id,
      label: sample.label,
      expectedKind: sample.expectedKind,
      transcriptSegmentCount: transcript.length,
      runs,
    };
    writeFileSync(
      join(outDir, `${sample.id}.json`),
      JSON.stringify(out, null, 2),
    );
  }

  console.log(`\nDone. Snapshot: ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
