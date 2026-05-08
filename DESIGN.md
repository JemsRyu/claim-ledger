# claim-ledger — Design

> Paste any informational YouTube URL → get back a structured ledger of every factual claim being made, with verbatim quotes, timestamps you can verify in one click, and adversarial flags.

This document is the design of record for the v1 build. Locked product decisions are in [memory](../.claude/projects/-Users-je-minryu-Desktop-claim-ledger/memory/project_youtube_brief.md); this doc derives the technical shape from those decisions.

---

## 1. Problem & audience

**Audience.** AI-company recruiters reviewing a portfolio link. Attention budget ≤1 minute. They've seen 50 "AI summarizer" demos this week.

**Problem the demo proves I can solve.** "AI processing video content" is a saturated demo space. The novel angle is *adversarial reading at scale*: surfacing the **structure of claims being made** in informational video — not summarizing, not fact-checking. The demo has to communicate, in 60 seconds, that I can:

1. Define a non-trivial AI product space ("claim auditor," not "summarizer") and stay disciplined inside it
2. Engineer trust into an LLM pipeline (timestamps that are actually correct, claims that are actually present in the transcript)
3. Make agentic structure legible to a viewer (multi-pass pipeline visible in UI, not hidden behind a generic spinner)
4. Ship to a public URL on real inputs

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

### 60-second demo arc (recruiter-facing)

| Beat | Time | What recruiter sees |
|---|---|---|
| **0–10s** | Open with a high-stakes example | Wellness influencer reel with health claims. URL paste, video preview appears. |
| **10–25s** | Pipeline runs visibly | Lens-progress UI: "extracting claims…" → "classifying…". Claims start populating the ledger one at a time, *not* a single popping spinner. |
| **25–45s** | Click-to-verify proof | Recruiter clicks a flagged claim's timestamp. YouTube opens at exactly that moment. Speaker is heard saying the verbatim quote. |
| **45–55s** | Empty-state quality signal | Switch to a music video sample. App returns "Non-informational — no audit applicable." Demonstrates the tool *knows* when it shouldn't speak. |
| **55–60s** | Sample gallery | Pan over labeled-by-content-type gallery. Implicit message: this works on the kinds of video where claims actually live. |

The demo is not narrated; it's screen-recorded with subtitles. Recruiter watches without sound.

---

## 4. System architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Vercel-native deploy, Server Components keep API keys off client, streaming UI is first-class |
| Styling | Tailwind v4 + shadcn/ui | Recruiter-grade polish without bespoke design |
| LLM | Anthropic SDK — Sonnet 4.6 (extraction) + Haiku 4.5 (classifier) | Two-model split: Sonnet for context-heavy extraction, Haiku for cheap per-claim classification |
| Transcripts | `youtube-transcript` (npm) | Calls YouTube's public `timedtext` endpoint; same endpoint the YouTube web player uses |
| Metadata | YouTube oEmbed | Public, no API key, no quota — kills the YouTube Data API v3 dependency |
| Hosting | Vercel (free or hobby tier) | One-command deploy; serverless functions handle the API routes |
| Cache | Vercel KV (optional) | Memoize results by `videoId` for demo speed; not load-bearing |
| State | None client-side beyond local component state; no DB | Stateless by design |

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
- **Prompt shape.** "Identify every factual claim made by the speaker. For each claim, return: (a) a natural-language paraphrase, and (b) the exact verbatim phrase the speaker used. Do not invent claims. Do not return timestamps." Returns structured JSON via Anthropic's `tool_use`.
- **Streaming.** Stream tokens; parse claims as JSON arrives. Claims emit to the timestamp validator one-by-one.

Why Sonnet, not Haiku, for this pass: extraction needs broad context awareness — knowing what's a claim vs. a question vs. a personal anecdote requires reading the surrounding speech. Haiku is too lossy on this judgment.

### Pass 2 — Classification (Haiku 4.5)

- **Input.** Each `ValidatedClaim` (post-timestamp-derivation) + a window of surrounding transcript text.
- **Output.** `AdversarialFlag[]` for that claim.
- **Prompt shape.** Per-flag short prompts, run in parallel. Each is a yes/no with a one-line justification: *"Does the speaker hedge this claim with words like 'might', 'could', 'I think'? Reply ONLY with `yes <one-line evidence>` or `no`."* No JSON gymnastics; one-token routing.
- **Parallelism.** All claims × all flags fan out as parallel Haiku calls. Cheap; latency ≈ slowest single call, not sum.

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

This section is load-bearing. The whole demo's credibility rides on click-to-verify being *actually correct*. A single wrong timestamp on a recruiter demo is fatal: they click, the video plays the wrong moment, and the tool looks broken on the most important interaction it has.

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
| Anthropic API outage | `kind: "error"` event; UI shows graceful error with retry |
| Vercel function timeout (10s on hobby tier) | See §8 — open question |
| User pastes a non-YouTube URL | URL parser rejects upstream of any network call |

### What we explicitly do not claim

- We do not claim the claims are *true* — only that they are *made* by the speaker.
- We do not claim our adversarial flags are exhaustive — they're heuristic signals, not a misinformation verdict.
- We do not claim every factual claim is captured — extraction may miss claims, especially in noisy auto-transcripts.
- We do not claim adversarial flags will be perfect — Haiku will make calls a human reviewer might disagree with on edge cases.

The demo copy reflects this. The marketing copy reflects this. The README reflects this. There is no claim of objectivity, no claim of completeness, no claim of factuality.

---

## 8. Open questions (resolve before code, or in P1.1)

1. **Vercel tier.** Hobby (free) gives 10s function timeout. Sonnet on a 60-min interview transcript may exceed that. Decide: (a) hobby + chunk transcripts > 10s of inference, (b) pay $20/mo for Pro tier with 60s timeout, or (c) stream from the Edge runtime (longer limits, but Anthropic SDK Edge support varies). Recommendation: start hobby + chunking; pay only if a sample needs it.
2. **Caching.** Optional Vercel KV cache by `videoId`. Pro: demo speed on repeat plays. Con: cost + complexity. Recommendation: skip in P1; add in P2.4 if demo recording feels slow.
3. **Sample set size.** Memory says "labeled by content type" but no count. Recommendation: 6 samples (wellness reel, tech talk, long-form interview clip, 30-sec health short, food influencer reel, music video for empty state).
4. **Fuzzy threshold.** §6 specifies 0.90 as the floor. This needs empirical tuning on samples in P2.3 — too strict drops good claims, too loose admits hallucinations. Tune by hand-labeling the curated set's expected claim count and adjusting threshold to maximize recall *subject to zero false-grounded-claim demos*.
5. **Opinion-as-fact.** Should extraction include statements like "I believe X is harmful" or only assertions like "X is harmful"? Recommendation: extract both; flag opinion-stated-as-fact via the `un-credentialed` flag where applicable. Revisit if it makes the ledger noisy.
6. **Haiku for extraction.** Memory says Haiku 4.5 is "possibly" used for the classifier. We commit to Sonnet for extraction, Haiku for classifier flags. If Haiku turns out to be wrong on extraction edge cases in P2.3, fall back to Sonnet for classifier too.

---

## 9. What success looks like

The demo passes if:

1. A recruiter pastes a sample URL, sees the ledger build live, clicks any timestamp, and lands at the exact moment the speaker says the verbatim quote — every time, on every sample.
2. The misinformation example surfaces ≥3 clearly-flagged claims (`hedged`, `vague-sourced`, `unsourced`).
3. The non-informational sample returns the empty state — the tool knows when it shouldn't speak.
4. The 60-second demo recording embedded in the README plays the same flow against the live URL.
5. Total LLM cost per video ≤$0.05 average across the sample set.

Anything beyond that — better prompts, more flags, prettier UI — is polish, not the bar.
