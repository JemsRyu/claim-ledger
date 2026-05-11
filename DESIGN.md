# claim-ledger — Design

> Paste any informational YouTube URL → get back a structured ledger of every factual claim being made, with verbatim quotes, timestamps you can verify in one click, and adversarial flags.

This document is the design of record for the v1 build. Locked product decisions are in [memory](../.claude/projects/-Users-je-minryu-Desktop-claim-ledger/memory/project_youtube_brief.md); this doc derives the technical shape from those decisions.

---

## 1. Problem & audience

**Audience.** A first-time visitor pasting their first URL. Attention budget is short; they've seen plenty of "AI summarizer" tools and need a clear reason this is different.

**Problem.** "AI processing video content" is a crowded space dominated by summarizers. The novel angle is *adversarial reading at scale*: surfacing the **structure of claims being made** in informational video — not summarizing, not fact-checking. The product has to communicate, on the first interaction, that it:

1. Stakes out a non-trivial AI product space ("claim auditor," not "summarizer") and stays disciplined inside it
2. Engineers trust into an LLM pipeline (timestamps that are actually correct, claims that are actually present in the transcript)
3. Makes its multi-pass structure legible in the UI — not hidden behind a generic spinner
4. Works on a public URL with real inputs

**One-line pitch.** *"Paste any informational video. Get back a structured ledger of every factual claim being made, with verbatim quotes, timestamps you can verify in one click, and adversarial flags."*

**What this is not.**

- Not an AI summarizer. We surface claim structure; we don't compress meaning.
- Not a fact-checker. We don't verify claims against the outside world. Real-world verification is v2.
- Not a misinformation classifier. We surface adversarial signals (hedging, missing sourcing) and leave judgment to the reader.

---

## 2. Scope

### In scope (v1)

- Any informational YouTube video — shorts, long-form interviews, tech talks, wellness/health influencers, food, meds, etc.
- Claim extraction with **verbatim transcript quote** for each claim
- **Click-to-verify** timestamp linking each claim back to the moment in the video
- **Adversarial flags** per claim: `contradicted` / `hedged` / `vague-sourced` / `unsourced` / `un-credentialed`
- "Non-informational, no audit applicable" empty state when the video isn't claim-bearing (music, vlog, narrative)
- Curated sample gallery labeled by *content type* (e.g. "wellness reel", "tech talk", "30-sec health short") — not by creator
- Public Vercel URL with no auth

### Out of scope (v2 candidates — do not build)

- Real-world fact-checking / retrieval / source corpus
- Comparing two videos against each other
- Comments analysis or community sentiment
- Accounts, sharing, persistence beyond optional Vercel KV demo cache
- Custom domain
- Database (anything beyond Vercel KV cache by URL key)
- Multi-agent recursion or "autonomous loop" UI aesthetics — explicitly avoided as cargo-cult AGI
- Anti-bot scraping of any kind — see hard constraints below

### Hard constraints

- **No data acquisition behind anti-bot walls.** Transcripts come from `youtube-transcript`, which calls YouTube's *public* `timedtext` endpoint — the same endpoint YouTube's own web player uses. Metadata comes from the *public* oEmbed endpoint. If YouTube ever closes those endpoints, the feature is cut, not worked around.
- **No infrastructure beyond Vercel + serverless + KV.** No backend services, no Docker, no message queue.
- **Model never emits timestamps.** See §6.

---

## 3. User flow & demo arc

### User flow

1. User pastes a YouTube URL.
2. App fetches video metadata (oEmbed) and transcript (`youtube-transcript`) in parallel.
3. App runs the **lens pipeline**: extraction pass → classification pass.
4. Each claim emitted by extraction is validated against the transcript (substring fuzzy-match → derive timestamp). Unvalidated claims are dropped silently.
5. Validated claims stream into the ledger UI as they emit. Each row has verbatim quote, timestamp link, adversarial flags.
6. User clicks any timestamp → opens YouTube at that exact moment in a new tab.

### First-run walkthrough

| Beat | What the user sees |
|---|---|
| **Open** | Sample gallery labeled by content type, plus a URL input. They paste a URL or click a sample. |
| **Pipeline runs visibly** | Lens-progress UI: "extracting claims…" → "classifying…". Claims start populating the ledger one at a time, *not* a single popping spinner. |
| **Click-to-verify** | User clicks a flagged claim's timestamp. YouTube opens at exactly that moment. Speaker is heard saying the verbatim quote. |
| **Empty-state quality signal** | On a non-informational sample (music video), the app returns "Non-informational — no audit applicable." The tool demonstrates that it *knows* when it shouldn't speak. |

The walkthrough is designed to communicate the product's two key differentiators in the first interaction: structured claim output (not summarization) and verifiable timestamps (not hallucinated).

---

## 4. System architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | Vercel-native deploy, Server Components keep API keys off client, streaming UI is first-class |
| Styling | Tailwind v4 (no component library) | Plain CSS-first Tailwind; no shadcn/ui — every component is hand-rolled to match the project's restrained visual identity |
| LLM | Anthropic Messages API via raw `fetch` — Sonnet 4.6 (extraction) + Haiku 4.5 (classifier) | Two-model split: Sonnet for context-heavy extraction, Haiku for cheap per-claim classification. Raw `fetch` rather than the SDK — the SDK transitively imports `node:fs`/`node:path` for its OAuth credential chain, which Vercel's edge function validator rejects. |
| Transcripts | three-tier fallback (see Transcript fetch chain below) | YouTube blocks Vercel egress; we delegate the fetch to a paid third party rather than rotate residential proxies. Curated samples ship as build-time fixtures so they never burn the third-party quota. |
| Metadata | YouTube oEmbed | Public, no API key, no quota — kills the YouTube Data API v3 dependency |
| Hosting | Vercel (free or hobby tier) | One-command deploy; serverless functions handle the API routes |
| Cache | 5-minute in-memory Map (~64 entries, LRU) | Reduces .io quota burn for repeat audits in a warm-start window |
| State | None client-side beyond local component state; no DB | Stateless by design |

### Transcript fetch chain

YouTube serves bot-detection HTML to most cloud-egress IPs (verified empirically: only 1-of-10 popular videos works from Vercel's Node and Edge runtimes, and the same fail pattern repeats across `youtube-transcript` JS, `youtube-transcript-api` Python, direct timedtext, and Innertube ANDROID with all client variants). The fetch must happen from an egress YouTube doesn't block. Three tiers:

1. **Build-time fixtures** (`lib/samples/transcripts/<videoId>.json`) — for the curated sample gallery only. Instant, free, can never fail. Regeneration recipe is inlined in `lib/samples/transcripts/index.ts`.
2. **`youtube-transcript.io`** — paid third-party service that fetches on its own infrastructure and returns transcripts via a documented API. Token via `YT_TRANSCRIPT_IO_TOKEN` env var. Free tier is 25 lifetime fetches; paid tiers are usage-based.
3. **`youtube-transcript` npm direct** — works locally + for the rare videos YouTube doesn't block (e.g. heavily-CDN'd content like Rick Astley's "Never Gonna Give You Up"). Last-ditch fallback.

**Why a paid third party rather than running our own fetcher.** The viable alternatives were (a) rotate residential proxies ourselves, (b) self-host on a residential IP via a tunnel, (c) accept a curated-only flow. (a) is anti-bot evasion infrastructure, which contradicts the product's stated ethics about working with the grain of public data. (b) requires keeping a personal device always-on, fragile for a hosted service. (c) abandons the "any URL" affordance. Delegating to a paid service is a different ethical position than running rotation ourselves: we are the customer, the service handles the fetching strategy. The tradeoff is documented openly in the README rather than hidden.

### Data flow

```
                 ┌─────────────────┐
   URL input ──> │ /api/audit      │ ──> [server, streaming response]
                 │  (POST)         │
                 └────────┬────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
     ┌────────────────┐      ┌────────────────┐
     │ oEmbed fetch   │      │ youtube-       │
     │ (metadata)     │      │ transcript     │
     └────────┬───────┘      └────────┬───────┘
              │                       │
              └───────────┬───────────┘
                          ▼
                  ┌───────────────┐
                  │ lens pipeline │
                  │  (§5)         │
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │ timestamp     │
                  │  validator    │ <── drops unmatched claims
                  │  (§6)         │
                  └───────┬───────┘
                          ▼
                  validated claim
                  streamed to client
```

### Domain model

The pipeline produces immutable values; lens functions are pure (transcript-in, claims-out). No mutable shared state.

```ts
// Source-of-truth shapes — all immutable, all server-derived.

type TranscriptSegment = {
  text: string;
  startSeconds: number;
  durationSeconds: number;
};

type RawClaim = {
  // From the extraction model. NO timestamp — server derives it.
  claim: string;       // the model's natural-language statement of the claim
  verbatim: string;    // the substring the speaker actually said
};

type AdversarialFlag =
  | "contradicted"
  | "hedged"
  | "vague-sourced"
  | "unsourced"
  | "un-credentialed";

type ValidatedClaim = {
  id: string;
  claim: string;
  verbatim: string;
  // Server-derived span. Only present on claims that survived validation.
  span: { startSeconds: number; endSeconds: number };
  // The actual transcript text for the matched span — may differ slightly
  // from `verbatim` if the model paraphrased. UI shows this, not `verbatim`.
  matchedText: string;
  flags: AdversarialFlag[];
};

type AuditResult =
  | { kind: "audit"; videoId: string; claims: ValidatedClaim[] }
  | { kind: "no-audit-applicable"; videoId: string; reason: string }
  | { kind: "no-transcript"; videoId: string; reason: string };
```

The `Lens` interface is small and composable:

```ts
interface Lens<In, Out> {
  name: string;
  run(input: In, signal: AbortSignal): AsyncIterable<Out>;
}
```

Two concrete lenses for v1: `ExtractionLens` and `ClassificationLens`. Future lenses (e.g., a citation-density lens) plug in without touching the pipeline driver.

---

## 5. The lens pipeline

Two passes, deliberately. One-pass extraction-plus-classification was considered and rejected: it bloats the prompt, degrades extraction quality, and forces the UI to wait for the entire result before showing anything. Two passes give clean separation of concerns and a streaming UX.

### Pass 1 — Extraction (Sonnet 4.6)

- **Input.** Full timestamped transcript (concatenated segment text, with segment indices preserved out-of-band so we can correlate matches back to seconds).
- **Output.** Stream of `RawClaim` items.
- **Prompt shape.** "Identify every factual claim made by the speaker. For each claim, return: (a) a natural-language paraphrase, and (b) the exact verbatim phrase the speaker used. Do not invent claims. Do not return timestamps." Structure is enforced via `output_config.format` with an inline JSON schema (`maxLength` on `verbatim` doubles as a length cap).
- **Streaming.** Stream tokens; parse claims as JSON arrives. Claims emit to the timestamp validator one-by-one.

Why Sonnet, not Haiku, for this pass: extraction needs broad context awareness — knowing what's a claim vs. a question vs. a personal anecdote requires reading the surrounding speech. Haiku is too lossy on this judgment.

### Pass 2 — Classification (Haiku 4.5)

- **Input.** Each `ValidatedClaim` (post-timestamp-derivation) + a window of surrounding transcript text.
- **Output.** `AdversarialFlag[]` for that claim.
- **Prompt shape.** Single all-flags prompt per claim (not per-flag). The system prompt enumerates all five flag types with definitions and a few-shot calibration block; the model returns a JSON array via `output_config.format`. Per-flag fan-out was considered and rejected — Haiku reads the full transcript once for context, and a five-flag check fits comfortably in one call.
- **Parallelism.** All claims run as parallel Haiku calls (`Promise.all`). Cheap; latency ≈ slowest single call, not sum. Each call has its own prompt cache (transcript prefix cached, claim-specific text after the cache breakpoint), so per-claim overhead drops sharply for videos with many claims.

Why Haiku for this pass: per-claim classification is well-bounded, has narrow context, and runs hundreds of times per video. Cost-shaped.

### Streaming protocol

`/api/audit` returns a Server-Sent Events stream:

```
event: metadata        — title, channel, thumbnail (oEmbed)
event: transcript-ready — number of segments
event: lens-start      — { lens: "extraction" }
event: claim           — RawClaim (one per claim, as they emit)
event: validated       — ValidatedClaim (after timestamp pass)
event: lens-start      — { lens: "classification" }
event: classified      — { claimId, flags } (per claim, as they emit)
event: done
event: error           — { kind, message }
```

The UI subscribes via `EventSource` and updates the ledger reactively. Lens-start events drive the legible-progress UI (§3).

---

## 6. Timestamp mitigation — the trust spine

This section is load-bearing. The whole product's credibility rides on click-to-verify being *actually correct*. A single wrong timestamp is fatal: the user clicks, the video plays the wrong moment, and the tool looks broken on the most important interaction it has.

**Rule: the model never emits timestamps.** Period. The model emits `verbatim` strings; the server derives timestamps deterministically.

### Algorithm

1. **Normalize the transcript** before matching: lowercase, collapse whitespace, strip `[Music]` / `[Applause]` / `[inaudible]` markers, remove punctuation.
2. **Concatenate segments** into one normalized string. Maintain a parallel `offsetMap: number[]` where `offsetMap[charIndex] = segmentIndex`.
3. **Normalize the model's `verbatim`** the same way.
4. **Fuzzy-match** the normalized verbatim against the normalized transcript. Algorithm: token-based sequence alignment with a similarity threshold of **≥0.90** (configurable; tune empirically — see §8).
5. **Resolve match → timestamp.**
   - Best match `≥0.90` and unique (no other match within 0.05 of the best score) → derive `startSeconds` from `transcript[offsetMap[matchStartChar]].startSeconds`.
   - Best match `<0.90` → **drop the claim silently**.
   - Multiple high-scoring matches in different parts of the transcript → **drop the claim silently** (ambiguous, can't trust).
6. **Cross-segment spans.** If the matched span crosses segment boundaries, take `startSeconds` from the first matching segment; `endSeconds` from the last matching segment.
7. **Display rule.** The UI shows `matchedText` (the actual transcript text in the matched span), *not* the model's `verbatim`. If the model paraphrased slightly, the user sees what was actually said.

### Why drop silently rather than show

We under-promise relentlessly. A claim shown without a timestamp leaks the failure mode visually ("why is this one different?"). A dropped claim is just absent — the only signal is the total claim count, which is fine. We'd rather show 8 well-grounded claims than 12 mixed-quality ones.

### Why this is robust to the obvious failure modes

| Failure mode | Mitigation |
|---|---|
| Model hallucinates a claim that wasn't said | `verbatim` won't fuzzy-match → claim dropped |
| Model paraphrases verbatim slightly | Fuzzy threshold absorbs minor edits; if too lossy, dropped |
| Speaker repeats the same phrase in two places | Ambiguous match → dropped (we'd rather miss than mislocate) |
| Auto-generated transcript is noisy | Normalization strips noise; Sonnet handles minor extraction errors |
| Transcript missing entirely | Caught upstream — `kind: "no-transcript"` empty state |

### What this design *does not* do

- It doesn't try to recover the timestamp by querying the model again. The validation is one-way and final.
- It doesn't show a "low confidence" badge. Either the timestamp is verifiable or the claim is gone.

---

## 7. Failure modes & explicit under-promises

| Scenario | Handled by |
|---|---|
| Video has no transcript (private, age-gated, no captions) | `kind: "no-transcript"` empty state with explanation |
| Transcript is auto-generated and noisy | Normalization strips noise; lower-quality output is acceptable, not catastrophic |
| Video is non-informational (music, vlog, narrative) | Extraction pass returns 0 claims → `kind: "no-audit-applicable"` empty state |
| Lens model hallucinates a claim | Dropped by timestamp validator |
| `youtube-transcript.io` quota exhausted (free tier: 25 lifetime) or outage | Fallback to direct npm fetch (works for ~10% of videos on Vercel); on full failure, `no-transcript` event with explanation |
| Anthropic credit balance too low | Per-claim silent fallback: synthesizer for extraction, mock round-robin for classification. Demo continues working with visibly-mocked claim text. |
| Anthropic rate limit / API outage | Same per-claim fallback as credit-too-low |
| Vercel function timeout (10s on hobby tier) | See §8 — open question |
| User pastes a non-YouTube URL | URL parser rejects upstream of any network call |

### What we explicitly do not claim

- We do not claim the claims are *true* — only that they are *made* by the speaker.
- We do not claim our adversarial flags are exhaustive — they're heuristic signals, not a misinformation verdict.
- We do not claim every factual claim is captured — extraction may miss claims, especially in noisy auto-transcripts.
- We do not claim adversarial flags will be perfect — Haiku will make calls a human reviewer might disagree with on edge cases.

The demo copy reflects this. The marketing copy reflects this. The README reflects this. There is no claim of objectivity, no claim of completeness, no claim of factuality.

---

## 8. Open questions

1. ~~**Vercel tier.**~~ **Resolved (2026-05-10):** stayed on hobby. `/api/audit` runs on the Edge runtime, which gives a 300s streaming budget on hobby vs 10s for Node functions. Real Sonnet on the longest curated transcript (TED talk, 391 segments) extracts in ~25s well within budget. Pro tier ($20/mo) not needed for the v1 demo profile. Caveat: the Anthropic SDK pulled `node:fs`/`node:path` and was rejected by Vercel's edge bundler, so the lens calls were rewritten as raw `fetch` against the Messages API — see commit `36a7593`.
2. ~~**Caching.**~~ **Resolved (2026-05-09):** in-memory `Map` cache (5-min TTL, 64-entry LRU) ships in `lib/youtube/transcript-cache.ts`. KV not needed at current traffic patterns.
3. ~~**Sample set size.**~~ **Resolved (2026-05-08):** 6 curated samples ship in `lib/samples/curated.ts`. All have build-time fixture transcripts in `lib/samples/transcripts/`.
4. ~~**Fuzzy threshold.**~~ **Resolved (2026-05-10):** 0.90 holds. Across all 5 informational curated samples (TED, 3Blue1Brown, Steve Jobs Stanford, Kurzgesagt, TED-Ed Sugar), the validator passes 100% of model-extracted claims with zero false-grounded matches in the eval harness (`scripts/eval.ts`). Lowering the threshold would only buy recall on claims where the model paraphrases beyond what the auditor should trust; raising it would start dropping clean matches. Documented in §6.
5. ~~**Opinion-as-fact.**~~ **Resolved (2026-05-09):** extraction system prompt in `lib/lens/extract.ts` extracts both. Opinion-stated-as-fact gets flagged via the classifier; pure opinion-stated-as-opinion is excluded.
6. ~~**Haiku for extraction.**~~ **Resolved (2026-05-09):** Sonnet 4.6 for extraction (`lib/lens/extract.ts`), Haiku 4.5 for classification (`lib/lens/classify.ts`). Final.

**Open:**

7. **`youtube-transcript.io` plan.** Free tier is 25 lifetime fetches. Curated samples are fixtured so they don't burn quota; only arbitrary URLs do. If sustained traffic exceeds 25 unique non-fixtured videos, decide: pay (~$5-20/mo), or accept that arbitrary URLs become best-effort once the free tier exhausts. **Recommendation: monitor; switch to paid only when needed.**

**Notes from P2.3 prompt-tuning:**

- Verbatim length is enforced via three layers (system prompt + JSON schema `maxLength: 150` + server-side `.slice(0, 150)`). Without this, models drift toward paragraph-length verbatims (200-400+ chars), which collapses validator throughput because the fuzzy matcher's inner Levenshtein is O(L²).
- The validator's fuzzy matcher was rewritten with seed-anchored search (pigeonhole: an `editBudget+1`-tile of the needle's seeds must appear exactly in a true match) — `O(N * editBudget * K * L)` versus the original `O(N * 0.3L * L²)`. On long transcripts this is the difference between seconds and minutes.
- Classifier is prone to under-flagging dense-fact content (e.g., Kurzgesagt-style "GM had 800K employees in 1979" claims), reading them as "well-known common knowledge". The remedy was a five-example few-shot block in the system prompt that anchors numerical/dated claims firmly as `unsourced` when no source is cited.

---

## 9. What success looks like

The product ships if:

1. A user pastes a sample URL, sees the ledger build live, clicks any timestamp, and lands at the exact moment the speaker says the verbatim quote — every time, on every sample.
2. The wellness/health-adjacent sample surfaces ≥3 clearly-flagged claims (`hedged`, `vague-sourced`, `unsourced`).
3. The non-informational sample returns the empty state — the tool knows when it shouldn't speak.
4. Total LLM cost per video ≤$0.05 average across the sample set.

Anything beyond that — better prompts, more flags, prettier UI — is polish, not the bar.
