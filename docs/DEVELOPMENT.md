# Development

Internal notes for running, testing, and iterating on claim-ledger locally. The polished product description lives in the root [`README.md`](../README.md); the design of record is in [`DESIGN.md`](../DESIGN.md); the implementation plan history is in [`PLAN.md`](../PLAN.md).

## Local dev

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # type-check + production build
npm test          # vitest — 43 tests on validator + hedge guard
npm run eval      # extract + validate + classify over the curated fixture set,
                  # dumps JSON snapshots to eval-output/ for prompt iteration
```

Requires `ANTHROPIC_API_KEY` in `.env.local`. Local dev works without `YT_TRANSCRIPT_IO_TOKEN` — the `youtube-transcript` npm package fetches fine from residential IPs (it's the Vercel egress that YouTube blocks, not your laptop).

## Test suite

`npm test` runs vitest against the trust-spine code paths:

- **`lib/lens/timestamp-validator.test.ts`** — 31 cases covering exact-match, fuzzy match above threshold, fuzzy match below threshold (correctly dropped), ambiguity (multi-match drops), span derivation across segment boundaries, marker normalization, and edge cases (empty transcript, empty verbatim, music-only transcript).
- **`lib/lens/hedge-guard.test.ts`** — 12 cases covering hedge-token detection (`i think`, `might`, `could`, `suggest`, `tend to`, etc.), false-positive rejection on direct assertions, and the `guardHedge` post-processing rule.

Both files cover the deterministic guards. The LLM calls themselves aren't tested — those are validated empirically via the eval harness.

## Eval harness

`scripts/eval.ts` runs the full pipeline against every fixture in `lib/samples/transcripts/` and writes per-sample JSON snapshots to `eval-output/<timestamp>/`. Useful for:

- Comparing prompt iterations side-by-side (diff two snapshot directories).
- Spot-checking the extraction model's `searchQuery` and `verifyQuestion` outputs.
- Confirming the no-audit-applicable empty-state fires consistently on the music sample (`--music-runs=N`).

Flags:

```bash
npm run eval                          # all samples, one run each (music: 3 runs)
npm run eval -- --only=<videoId>      # one sample
npm run eval -- --no-classify         # extraction only — cheaper, faster
npm run eval -- --music-runs=5        # vary the empty-state consistency runs
```

Each snapshot file is gitignored (`eval-output/`).

## Adding a curated sample

1. Pick a videoId. Confirm the video has English captions: `node --input-type=module -e "import { YoutubeTranscript } from 'youtube-transcript'; console.log((await YoutubeTranscript.fetchTranscript('<id>', { lang: 'en' })).length, 'segments');"`
2. Regenerate the fixture via the recipe inlined at the top of [`lib/samples/transcripts/index.ts`](../lib/samples/transcripts/index.ts). `{ lang: 'en' }` is critical — multi-language videos default to alphabetically-first track (often not English).
3. Add the import + entry to `TRANSCRIPT_FIXTURES` in the same file.
4. Add the sample entry to `CURATED_SAMPLES` in [`lib/samples/curated.ts`](../lib/samples/curated.ts) with a content-type label (not creator-recognizable).
5. Run `npm run eval -- --only=<videoId>` and hand-check the output for claim quality and flag coverage.

## Status

Phase 2 is feature-complete. The pipeline is wired end-to-end (real Sonnet extraction, real Haiku classification, both with graceful fallback on API failure), prompt-tuned across the curated sample set, and live on Vercel.

| Phase | Scope | State |
|---|---|---|
| 1 | Scaffold, deploy, transcript fetch, lens UI, ledger, timestamp validator | ✅ complete |
| 2.1 | Live Sonnet 4.6 extraction with synthesizer fallback | ✅ wired |
| 2.2 | Live Haiku 4.5 classification with mock-flag fallback | ✅ wired |
| 2.3 | Prompt tuning across the curated sample set | ✅ tuned over 5 eval iterations |

Both LLM lenses fall back gracefully on any API failure (no key, no credits, rate limit). When Anthropic credits exhaust, the synthesizer fallback pulls real transcript substrings, runs them through the same validator, and emits real spans with a `(demo)` prefix on the claim text. Real extraction and classification resume automatically when credits return — no redeploy required.

See [`PLAN.md`](../PLAN.md) for the chunked implementation history.

## Fallback behavior in detail

The synthesizer fallback is the audit pipeline's degraded-mode promise: the demo never breaks visibly even when the Anthropic API is unreachable.

- **Extraction fails** (no key / no credits / rate limit / timeout) → `synthesizeRawClaims` in `lib/lens/mock-fixtures.ts` chunks the transcript into pseudo-claims, prefixed with `(demo)`. They run through the same validator and emit real spans, so click-to-verify still lands correctly — the only visible signal is the prefix.
- **Classification fails** per-claim → `mockFlagsForIndex` round-robins through a fixed list of flag combinations. The hedge-guard still runs over the result, so the locality check applies to mock flags too.
- **Both** fall through silently from the client's perspective — no error banner unless the transcript fetch itself fails.
