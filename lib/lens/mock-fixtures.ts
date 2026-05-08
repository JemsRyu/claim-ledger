import type {
  AdversarialFlag,
  ValidatedClaim,
} from "./types";

type Fixture =
  | { kind: "audit"; claims: ValidatedClaim[] }
  | { kind: "no-audit-applicable"; reason: string };

const wellnessReelFixture: Fixture = {
  kind: "audit",
  claims: [
    {
      id: "c-0",
      claim: "Drinking celery juice on an empty stomach detoxifies the liver.",
      verbatim:
        "Drinking celery juice every morning on an empty stomach is going to detox your liver",
      span: { startSeconds: 4, endSeconds: 9 },
      matchedText:
        "Drinking celery juice every morning on an empty stomach is going to detox your liver",
      flags: ["unsourced", "un-credentialed"],
    },
    {
      id: "c-1",
      claim: "Sixteen ounces is the daily minimum for benefits.",
      verbatim: "you need at least sixteen ounces a day to see results",
      span: { startSeconds: 11, endSeconds: 14 },
      matchedText: "you need at least sixteen ounces a day to see results",
      flags: ["unsourced", "vague-sourced"],
    },
    {
      id: "c-2",
      claim:
        "Studies could support the practice, though the speaker hedges.",
      verbatim: "I think studies have shown this might help with inflammation",
      span: { startSeconds: 18, endSeconds: 23 },
      matchedText:
        "I think studies have shown this might help with inflammation",
      flags: ["hedged", "vague-sourced"],
    },
  ],
};

const techTalkFixture: Fixture = {
  kind: "audit",
  claims: [
    {
      id: "c-0",
      claim: "Transformer attention is O(n²) in sequence length.",
      verbatim: "the attention mechanism scales quadratically with sequence length",
      span: { startSeconds: 32, endSeconds: 36 },
      matchedText:
        "the attention mechanism scales quadratically with sequence length",
      flags: [],
    },
    {
      id: "c-1",
      claim: "FlashAttention reduces memory bandwidth bottlenecks.",
      verbatim:
        "FlashAttention basically eliminates the memory bandwidth bottleneck on modern GPUs",
      span: { startSeconds: 47, endSeconds: 53 },
      matchedText:
        "FlashAttention basically eliminates the memory bandwidth bottleneck on modern GPUs",
      flags: ["hedged"],
    },
  ],
};

const musicVideoFixture: Fixture = {
  kind: "no-audit-applicable",
  reason:
    "This video appears non-informational (music, narrative, or entertainment content). The auditor surfaces factual claims; nothing to audit here.",
};

const defaultFixture: Fixture = {
  kind: "audit",
  claims: [
    {
      id: "c-0",
      claim:
        "(demo placeholder) The speaker makes a measurable factual claim early in the video.",
      verbatim: "demo placeholder verbatim quote one",
      span: { startSeconds: 5, endSeconds: 9 },
      matchedText: "demo placeholder verbatim quote one",
      flags: ["unsourced"] satisfies AdversarialFlag[],
    },
    {
      id: "c-1",
      claim:
        "(demo placeholder) A second claim, hedged, appears later in the video.",
      verbatim: "demo placeholder verbatim quote two",
      span: { startSeconds: 18, endSeconds: 22 },
      matchedText: "demo placeholder verbatim quote two",
      flags: ["hedged", "vague-sourced"] satisfies AdversarialFlag[],
    },
  ],
};

const FIXTURE_KEYS: Record<string, Fixture> = {
  MOCK_WELLNESS: wellnessReelFixture,
  MOCK_TECHTALK: techTalkFixture,
  MOCK_MUSIC: musicVideoFixture,
};

export function getMockFixture(videoId: string): Fixture {
  return FIXTURE_KEYS[videoId] ?? defaultFixture;
}
