# claim-ledger — Implementation Plan

Chunked into focused work sessions. Each chunk has a single goal, named files it touches, an acceptance criterion, and a rough time estimate. Sequence is strict within a phase; phases gate on the Anthropic key.

**Phase 1** — no Anthropic key. Scaffold + Vercel deploy + transcript + mocked lens + ledger UI + timestamp validator. Should be fully demoable end-to-end against fixtures.

**Phase 2** — Anthropic key required. Wire live LLM calls into the slot left by mocked fixtures. Tune. Record.

Total estimated effort: 16–22 hours of focused time, spread across ~12 chunks. Each chunk is committable.

## Status (2026-05-11)

| Phase | Chunk | State |
|---|---|---|
| 1 | P1.1–P1.8 | ✅ all 8 complete |
| 2 | P2.1 — Sonnet extraction | ✅ wired with synthesizer fallback |
| 2 | P2.2 — Haiku classification | ✅ wired with mock-flag fallback |
| 2 | P2.3 — live run + prompt tuning | ✅ tuned across 5 eval iterations; all 5 informational samples produce defensible ledgers, music sample returns no-audit-applicable across 3 consecutive runs, validator passes 100% of model-extracted claims with zero false-grounded matches |
| 2 | P2.4 — demo recording | deferred (live URL is the demo) |

Bonus work that landed alongside the plan:
- youtube-transcript.io as the primary transcript source (works on Vercel; the npm package alone fails 9-of-10 popular videos due to YouTube's cloud-IP blocking).
- Build-time fixtures for the curated sample set (Tier 0 — instant, free, can never fail).
- 5-minute in-memory transcript cache (saves .io quota on repeat audits).
- /api/audit on Edge runtime (300s streaming budget vs Hobby's 10s for Node functions).
- Anthropic SDK replaced with raw `fetch` calls to the Messages API — the SDK pulled `node:fs`/`node:path` (its OAuth credential chain) which Vercel's edge validator rejects on deploy.
- Seed-anchored fuzzy matcher in `lib/lens/timestamp-validator.ts` — pigeonhole-based candidate generation + banded Levenshtein with early termination. Brings validation on long transcripts from minutes to seconds while preserving the 31-test trust-spine suite.
- `scripts/eval.ts` harness — runs extract+validate+classify against the fixture set and dumps JSON snapshots to `eval-output/` for diff-based prompt iteration.
- Sample swap: `gAjR4_CbPpQ` (broken — pure music-marker transcript) replaced with `lEXBxijQREo` (TED-Ed "How sugar affects the brain"), the gallery's wellness/health slot.
- SSE keepalive comment lines on `/api/audit` — Vercel's edge proxy buffered SSE responses until ~enough bytes accumulated; `:keepalive\n\n` every 3s pushes past the buffer threshold without polluting the event stream.

---

## Phase 1 — Scaffold to mocked end-to-end

### P1.1 — Scaffold + Vercel deploy from day 1
**Estimate.** 1–2h
**Goal.** Fresh Next.js 15 app with TS + Tailwind + shadcn/ui, deployed to a Vercel subdomain, returning a styled placeholder page.
**Files.**
- `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `components/ui/*` (shadcn init output)
- `.gitignore` (Node defaults + `.vercel`, `excalidraw.log`)
- `README.md` (project tagline, live URL, status badge)
- `vercel.json` if any project-level overrides needed
**Acceptance.**
- `pnpm dev` (or `npm run dev`) renders the placeholder locally.
- Pushed to `origin/master` → Vercel auto-deploys → public URL responds 200 with the placeholder page.
- Lighthouse score on the placeholder ≥95 (sanity check that the baseline isn't already broken).
**Why first.** Get the deploy pipeline working before any logic — "deploy from day 1" must be a fact, not a phase-2 promise. Every subsequent chunk pushes through this pipeline.

---

### P1.2 — URL input + oEmbed metadata
**Estimate.** 1–2h
**Goal.** Paste a YouTube URL → see video card with title, channel, thumbnail.
**Files.**
- `lib/youtube/url-parser.ts` — extract `videoId` from any YouTube URL form (`youtu.be/X`, `youtube.com/watch?v=X`, `youtube.com/shorts/X`)
- `lib/youtube/oembed.ts` — fetch metadata from `https://www.youtube.com/oembed?url=…&format=json`
- `app/api/oembed/route.ts` — GET handler
- `components/UrlInput.tsx`, `components/VideoCard.tsx`
- `app/page.tsx` — wire input → metadata fetch → card
**Acceptance.**
- Paste a known-good URL → metadata renders within ~500ms.
- Paste a bad URL → graceful error message, no console errors.
- Paste a non-YouTube URL → URL parser rejects before any network call.
**Edge cases.** URL has tracking params (`&t=…&ab_channel=…`); URL is age-gated (oEmbed returns 401 — show graceful error).

---

### P1.3 — Transcript fetch
**Estimate.** 1–2h
**Goal.** Below the video card, render the timestamped transcript scrollable.
**Files.**
- `lib/youtube/transcript.ts` — wrap `youtube-transcript` npm package; return `TranscriptSegment[]`
- `app/api/transcript/route.ts` — GET handler
- `components/TranscriptView.tsx`
**Acceptance.**
- URL with captions → transcript renders, click on a segment seeks the video preview to that moment (stretch goal).
- URL without captions → "No transcript available" empty state with explanation.
- Auto-generated transcript renders correctly (lowercased, no punctuation is fine).
- `[Music]` / `[Applause]` markers are visible in transcript view (they get stripped only at lens-validation time, not display time).
**Why this chunk before the lens.** Confirms the data spine (transcript with seconds-precise timestamps) is real before we build anything that depends on it.

---

### P1.4 — Mocked lens pipeline + ledger UI
**Estimate.** 2–3h
**Goal.** Ledger renders from a hardcoded fixture; click-to-verify timestamp links open YouTube at the correct moment.
**Files.**
- `lib/lens/types.ts` — `RawClaim`, `ValidatedClaim`, `AdversarialFlag`, `AuditResult` (per design §4)
- `lib/lens/mock-fixtures.ts` — 2–3 hand-crafted `ValidatedClaim[]` keyed by `videoId`
- `app/api/audit/route.ts` — POST handler, returns mocked SSE stream from fixture (real protocol shape, fake data)
- `components/Ledger.tsx`, `components/ClaimCard.tsx`, `components/FlagBadge.tsx`
- `app/page.tsx` — wire URL submission → SSE subscription → ledger
**Acceptance.**
- Submit URL → ledger streams in claim-by-claim with a small visible delay between claims (mocked timing).
- Each claim shows verbatim quote, click-to-verify timestamp link, flag badges.
- Click any timestamp → `youtube.com/watch?v=<id>&t=<seconds>s` opens in a new tab at the right moment.
**Why mock first.** Pipeline UI must exist before pipeline logic so visual design isn't gated on the Anthropic key. The SSE protocol shape gets baked in here so P2.1 only swaps the *source* of events.

---

### P1.5 — Substring fuzzy-match + timestamp derivation
**Estimate.** 2–3h
**Goal.** Given a `RawClaim` and a `TranscriptSegment[]`, return either a `ValidatedClaim` or null. This is the trust-critical core (design §6).
**Files.**
- `lib/lens/timestamp-validator.ts` — pure function, no I/O
- `lib/lens/timestamp-validator.test.ts` — extensive unit tests
- `lib/lens/normalize.ts` — transcript & verbatim normalization (lowercase, strip markers, collapse whitespace)
**Acceptance — unit test cases (must all pass).**
- Exact match → returns claim with correct `startSeconds`/`endSeconds`.
- Fuzzy match (typo in verbatim) at score 0.92 → returns claim.
- No match (verbatim absent from transcript) → returns null.
- Score below threshold (0.85) → returns null.
- Ambiguous match (same phrase appears at 0:30 and 4:15) → returns null.
- Cross-segment span (verbatim spans segments 12–13) → correct start from seg 12, end from seg 13.
- Empty transcript → returns null without crashing.
- Empty verbatim → returns null without crashing.
- Transcript with `[Music]` markers → matched correctly after normalization.
**Why this chunk gets disproportionate testing.** This is the only place in the whole product where a bug is *fatal*. A wrong timestamp on the first click breaks the trust contract that the rest of the product depends on. Coverage here is non-negotiable.

---

### P1.6 — Lens-progress UI + non-informational empty state
**Estimate.** 1–2h
**Goal.** While the pipeline runs, the UI shows discrete steps (extraction → classification), not a generic spinner. If the pipeline returns zero claims, show "Non-informational — no audit applicable."
**Files.**
- `components/LensProgress.tsx` — listens for `lens-start` events, renders step indicator
- `components/EmptyAudit.tsx` — non-informational empty state
- `components/Ledger.tsx` — branches on `AuditResult.kind`
**Acceptance.**
- Mocked slow pipeline (artificial delays in `app/api/audit/route.ts`) → UI shows "Extracting claims…" then "Classifying…" with step transition visible.
- Mocked empty result → "Non-informational" empty state renders with copy explaining why no audit applies.
- No CLS (cumulative layout shift) when steps transition.
**Why this chunk.** Memory: "Loading UI must show lens-selection + re-pass step legibly so the agentic claim is visible (not a generic spinner)." This is where we earn the "agentic" credit.

---

### P1.7 — Curated sample set
**Estimate.** 1h
**Goal.** Sample gallery on the landing page with 6 videos labeled by *content type* (not creator).
**Files.**
- `lib/samples/curated.ts` — array of `{ url, label, expectedKind }` entries
- `components/SampleGallery.tsx` — grid of clickable sample tiles, each sets the URL input on click
**Acceptance.**
- 6 samples, labels: "wellness reel", "tech talk", "long-form interview clip", "30-sec health short", "food influencer reel", "music video (non-informational)".
- Each sample's URL has a verified-good transcript (manually checked once during this chunk).
- The music video sample is included specifically to demonstrate the `no-audit-applicable` empty state — the pipeline must return that branch on this URL.
- Clicking a sample tile populates the URL input; user clicks Audit to run.
**Selection criteria.** Pick by *content type* not creator — users seeing one creator they recognize may project taste-judgments onto the tool. Generic content-type labels keep focus on the auditor's behavior, not on the source.

---

### P1.8 — Phase-1 polish + deploy verification
**Estimate.** 1–2h
**Goal.** Phase 1 is fully demoable on the live Vercel URL.
**Files.**
- `README.md` — full version with: tagline, live URL, screenshot, "what this is/isn't," sample gallery link, status (Phase 1 complete, Phase 2 wires live LLM)
- Visual polish pass: typography, spacing, dark mode if free
**Acceptance.**
- A clean browser session on the live Vercel URL: paste any sample URL → mocked ledger streams → click-verify works → empty state on music sample renders correctly.
- README has live URL prominently linked.
- Lighthouse Performance ≥90 on landing page.
- Phase 1 commit history is clean (one chunk per commit, conventional commit messages).

---

## Phase 2 — Wire live Claude

### P2.1 — Extraction lens (Sonnet 4.6)
**Estimate.** 2–3h
**Goal.** `app/api/audit/route.ts` calls Anthropic instead of returning mocked fixtures. Real claim extraction, streamed to client.
**Files.**
- `lib/lens/extract.ts` — `ExtractionLens` implementation
- `lib/lens/prompts/extract.txt` — versioned prompt
- `app/api/audit/route.ts` — replace mocked source with `ExtractionLens` → `timestamp-validator` → SSE
- `lib/anthropic/client.ts` — singleton Anthropic SDK client; reads `ANTHROPIC_API_KEY` from env
**Acceptance.**
- `ANTHROPIC_API_KEY` set in Vercel env (and locally in `.env.local`, gitignored).
- Real video → real claims with verbatim substrings → all surviving claims pass timestamp validation.
- Streaming: claims emit one-at-a-time visible in network tab as SSE events; UI updates incrementally.
- Aborting the request server-side cleanly (test by paste-then-cancel before completion).
**Edge cases.** Sonnet returns malformed JSON occasionally — wrap in tool-use schema validation, drop malformed claims silently.

---

### P2.2 — Classification lens (Haiku 4.5)
**Estimate.** 1–2h
**Goal.** Each `ValidatedClaim` is classified for adversarial flags via parallel Haiku calls.
**Files.**
- `lib/lens/classify.ts` — `ClassificationLens` implementation
- `lib/lens/prompts/classify.txt` — one prompt per flag type, or one prompt that returns all flags at once (decide here based on Haiku reliability)
- `app/api/audit/route.ts` — append classification stage; emit `classified` events
**Acceptance.**
- Hand-labeled samples — pick 5 claims across the curated set, write down expected flags by hand, verify classifier matches ≥4 of 5.
- Latency: classification adds ≤3s on a 10-claim video (parallelism working).
- Total cost per video ≤$0.05 average across curated set (verify in Anthropic console).

---

### P2.3 — Live run on sample set + prompt tuning
**Estimate.** 2h
**Goal.** Every curated sample produces a defensible ledger. Tune extraction and classification prompts until quality is demoable.
**Files.**
- `lib/lens/prompts/extract.txt`, `lib/lens/prompts/classify.txt` — iterate
- Possibly a `scripts/eval.ts` that runs the full pipeline against the curated set and dumps results to a JSON snapshot for diffing across prompt iterations
**Acceptance.**
- For each sample (excluding music video):
  - Wellness reel: ≥3 claims surface; ≥1 is `hedged` or `unsourced`.
  - Tech talk: claims are technical and accurate to the verbatim; no hallucinated claims survive validation.
  - 30-sec health short: at least one claim flagged `un-credentialed`.
  - Long-form interview clip: 6–15 claims (not so few it's empty, not so many it's noise).
- Music video: returns `no-audit-applicable`. Confirm this with at least 3 trial runs (LLMs are nondeterministic; want consistent empty state).
- Fuzzy-match threshold tuned: maximize recall subject to **zero false-grounded claims** in the curated set. Document the chosen threshold in `DESIGN.md` §8.

---

### P2.4 — Demo recording + final polish
**Estimate.** 2h
**Goal.** 60-second screen recording matching the demo arc in DESIGN.md §3, embedded in README. README points at the live URL.
**Files.**
- `README.md` — final version with embedded video (`<video>` or animated GIF), screenshot fallback
- Optional: `lib/cache/kv.ts` — Vercel KV cache by `videoId` if recordings feel slow on first paste
**Acceptance.**
- Screen recording follows the beats in DESIGN.md §3 exactly: misinformation open → live pipeline progress → click-verify proof → empty state → sample gallery.
- Recording is ≤60s.
- Live URL in README opens to the same experience the recording shows; a visitor clicking through can reproduce the flow on their own.
- All open questions in DESIGN.md §8 are resolved or explicitly deferred with a one-line rationale.

---

## Out of plan (do not start without rescoping)

These are listed only to make the boundary explicit. Anything below is v2 — adding any of them in Phase 1 or 2 trades demo crispness for sprawl.

- Authentication / accounts / saving past audits
- Side-by-side video comparison
- Real-world fact-checking via retrieval
- Model fine-tuning / RLHF / synthetic data generation
- Custom domain / branded landing page
- A/B testing the prompts in production
- Analytics / engagement metrics dashboards
- Mobile-app version
