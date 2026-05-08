# claim-ledger

> Claim auditor for informational video. Paste any informational YouTube URL → get a structured ledger of every factual claim being made, with verbatim quotes, click-to-verify timestamps, and adversarial flags.

This is a portfolio project — a recruiter-facing demo built to communicate, in 60 seconds, what disciplined LLM engineering looks like on a non-trivial problem.

It is **not** an AI summarizer, not a fact-checker, and not a misinformation classifier. It surfaces the *structure of claims being made* in a video, leaves judgment to the reader, and refuses to show a claim it cannot ground in a verbatim transcript span.

## Status

Phase 1 — scaffolding. Pipeline runs on mocked fixtures. Live URL coming once Vercel is connected.

| Phase | What it covers | State |
|---|---|---|
| 1 | Scaffold, deploy, transcript fetch, mocked lens pipeline, ledger UI, timestamp validator | in progress |
| 2 | Wire Claude (Sonnet 4.6 extraction + Haiku 4.5 classification), tune, record demo | not started |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Anthropic SDK · `youtube-transcript` · YouTube oEmbed · deployed on Vercel.

No database, no accounts, no persistence. Every audit is computed fresh from the public transcript.

## Read more

- [`DESIGN.md`](./DESIGN.md) — the design of record (problem, scope, demo arc, architecture, **timestamp mitigation algorithm**, failure modes, open questions)
- [`PLAN.md`](./PLAN.md) — chunked implementation plan, two phases, ~12 work sessions

## Local dev

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Hard constraints

This project will never:

- Defeat anti-bot measures or scrape behind login walls. Transcripts come from YouTube's public `timedtext` endpoint, the same one the YouTube web player uses.
- Show a timestamp the model invented. Claims that don't fuzzy-match a transcript span are dropped silently rather than displayed unverified.
- Claim claims are *true* — only that they are *made*.
