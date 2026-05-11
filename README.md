# claim-ledger

> Claim auditor for informational video. Paste any informational YouTube URL → get a structured ledger of every factual claim being made, with verbatim quotes, click-to-verify timestamps, and adversarial flags.

**Live:** https://claim-ledger-jemsryus-projects.vercel.app/

A recruiter-facing portfolio demo built to communicate, in 60 seconds, what disciplined LLM engineering looks like on a non-trivial problem.

## What this is

- A **claim auditor** for informational video. Surfaces *the structure of factual claims being made* — not whether they are true.
- Adversarial reader: per-claim flags for `contradicted` / `hedged` / `vague-sourced` / `unsourced` / `un-credentialed`.
- Click-to-verify: every claim's timestamp links straight to the moment in the video where the speaker says it.
- Refuses to speak when nothing factual is being said — non-informational video gets an explicit empty state, not noise.

## What this is not

- **Not an AI summarizer.** No compression of meaning.
- **Not a fact-checker.** No retrieval, no source corpus, no verification against the outside world. Real-world fact-checking is v2.
- **Not a misinformation classifier.** Adversarial flags are heuristic signals, not verdicts.

## How it works

```
URL ──> oEmbed metadata (public, no key)
   │
   └──> Transcript:
        Tier 0: build-time fixture for curated samples (instant)
        Tier 1: youtube-transcript.io (works on Vercel)
        Tier 2: direct via youtube-transcript npm (fallback)
                   │
                   └──> Sonnet 4.6 extraction (verbatim claims, no timestamps)
                          │
                          └──> server fuzzy-matches verbatim ─> derives timestamp
                                 │
                                 └──> Haiku 4.5 classification (per-claim flags)
                                        │
                                        └──> SSE-streamed claim ledger
```

The trust spine is at the server boundary. **The model never emits timestamps.** The extraction model emits verbatim transcript substrings; the server fuzzy-matches each against the timestamped transcript and derives the timestamp deterministically. Claims that don't match are dropped silently. A wrong timestamp on a recruiter demo is fatal — better to under-show than to over-promise.

See [`DESIGN.md`](./DESIGN.md) §6 for the algorithm.

## Status

| Phase | Scope | State |
|---|---|---|
| **1** | Scaffold, deploy, transcript fetch, lens UI, ledger, timestamp validator | ✅ complete |
| **2.1** | Live Sonnet 4.6 extraction with synthesizer fallback | ✅ wired |
| **2.2** | Live Haiku 4.5 classification with mock-flag fallback | ✅ wired |
| **2.3** | Prompt tuning across the curated sample set | ✅ tuned over 5 eval iterations |
| **2.4** | 60-second demo recording | deferred |

Both LLM lenses fall back gracefully on any API failure (no key, no credits, rate limit) so the demo always works. When the Anthropic account has credits, real extraction and classification fire automatically — no redeploy required.

## Stack

Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript · Anthropic Messages API via raw `fetch` (Sonnet 4.6 + Haiku 4.5) · YouTube oEmbed · `youtube-transcript.io` (primary) · `youtube-transcript` (fallback) · Vercel (Edge runtime on `/api/audit`).

No database, no accounts, no persistence beyond a 5-minute in-memory transcript cache. Every audit is computed fresh.

## Decisions worth flagging

- **The transcript fetch goes through a paid third party.** YouTube blocks transcript fetches from Vercel's serverless egress IPs (and any cloud egress, as far as we tested). Originally we hit YouTube's public `timedtext` endpoint directly; that path now fails 9-of-10 popular videos when run from cloud. Options were (a) rotate residential proxies ourselves, (b) delegate the fetch to a paid service, or (c) accept that arbitrary URLs would be best-effort. We chose (b) — `youtube-transcript.io` — because being a customer is a different ethical position than running rotation infrastructure. Curated samples ship as build-time fixtures so they never burn the third-party quota.
- **Lens calls bypass the Anthropic SDK.** The SDK transitively imports `node:fs`/`node:path` for its OAuth credential chain. Vercel's edge function validator static-analyzes the bundle and rejects any reference to Node-only built-ins, so the deploy failed when `/api/audit` was switched to edge runtime (needed for the 300s streaming budget on the free Hobby tier). The lens code now calls `https://api.anthropic.com/v1/messages` directly via `fetch`, preserving prompt caching and structured output via `output_config.format`. Roughly 40 lines per lens, fully edge-compatible.
- **Server is stateless across the lens pipeline.** No persisted prompt artifacts, no claim history, no analytics. A claim that drops to the synthesizer fallback today produces the same output if re-audited next week.
- **Click-to-verify timestamps are honest even when extraction degrades.** The synthesizer fallback (triggered on Anthropic API failure) pulls real transcript substrings, runs them through the same `validateClaim` the live extraction would use, and emits real spans. The "(demo)" prefix on synthesized claim text is the only visible signal that LLM extraction wasn't live.
- **Fuzzy-match validator uses seed-anchored search.** The naive brute-force fuzzy matcher was `O(N · W · L²)` and took minutes per claim on long transcripts. The current implementation uses pigeonhole seeding (any match with ≤k edits leaves at least one of k+1 disjoint needle seeds untouched in the haystack) plus banded Levenshtein with early termination — ~100× speedup, same 31-case test suite still passes. Details in `lib/lens/timestamp-validator.ts`.

## Read more

- [`DESIGN.md`](./DESIGN.md) — design of record. 9 sections, including the timestamp-mitigation algorithm (§6) and the open questions list (§8).
- [`PLAN.md`](./PLAN.md) — chunked implementation plan. 12 sessions across 2 phases.

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type-check + production build
npm test         # vitest — 31 tests on the timestamp validator
```

Local dev works without `YT_TRANSCRIPT_IO_TOKEN` because youtube-transcript's npm package works fine from residential IP.
