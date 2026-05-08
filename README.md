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
URL ──> oEmbed metadata
   └──> youtube-transcript (public timedtext endpoint)
                └──> lens pipeline (extraction + classification)
                            └──> server fuzzy-matches verbatim
                                     against transcript ──> claim ledger
```

The trust spine is at the server boundary. **The model never emits timestamps.** The model emits verbatim transcript substrings; the server fuzzy-matches each against the timestamped transcript and derives the timestamp deterministically. Claims that don't match are dropped silently. A wrong timestamp on a recruiter demo is fatal — better to under-show than to over-promise.

See [`DESIGN.md`](./DESIGN.md) §6 for the algorithm.

## Status

| Phase | Scope | State |
|---|---|---|
| **1** | Scaffold, deploy, transcript fetch, lens UI, ledger, timestamp validator (mocked extraction) | ✅ complete |
| **2** | Live Sonnet 4.6 extraction + Haiku 4.5 classification, prompt tuning, demo recording | not started |

Phase 1 currently runs against a real-transcript synthesizer + the production timestamp validator, so click-to-verify is honest even before live LLM calls land.

## Stack

Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript · Anthropic SDK (Phase 2) · `youtube-transcript` · YouTube oEmbed · Vercel.

No database, no accounts, no persistence. Every audit is computed fresh from the public transcript.

## Read more

- [`DESIGN.md`](./DESIGN.md) — design of record. 9 sections, including the timestamp-mitigation algorithm (§6) and 6 open questions (§8).
- [`PLAN.md`](./PLAN.md) — chunked implementation plan. 12 sessions across 2 phases.

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type-check + production build
npm test         # vitest run — 31 tests on the timestamp validator
```

## Hard constraints

This project will never:

- Defeat anti-bot measures or scrape behind login walls. Transcripts come from YouTube's public `timedtext` endpoint, the same one the YouTube web player uses.
- Show a timestamp the model invented. Claims that don't fuzzy-match a transcript span are dropped silently rather than displayed unverified.
- Claim claims are *true* — only that they are *made*.
