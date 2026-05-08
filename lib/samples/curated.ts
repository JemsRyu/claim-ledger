export type CuratedSample = {
  id: string;
  url: string;
  label: string;
  description: string;
  expectedKind: "audit" | "no-audit-applicable";
};

/**
 * Hand-picked stable, high-traffic videos with verified-good transcripts
 * (smoke-tested against the public timedtext endpoint at sample-curation
 * time). Labels intentionally describe content TYPE rather than creator —
 * the demo target is recruiters, who shouldn't be projecting taste
 * judgments on the creators they recognize.
 *
 * The music-video sample is the empty-state proof: the auditor recognizes
 * the absence of factual claims and refuses to speak. That's a quality
 * signal, not a failure.
 */
export const CURATED_SAMPLES: CuratedSample[] = [
  {
    id: "iCvmsMzlF7o",
    url: "https://www.youtube.com/watch?v=iCvmsMzlF7o",
    label: "TED talk · psychology",
    description:
      "Long-form talk with substantive claims about emotion, vulnerability, research methodology.",
    expectedKind: "audit",
  },
  {
    id: "aircAruvnKk",
    url: "https://www.youtube.com/watch?v=aircAruvnKk",
    label: "Tech explainer · long-form",
    description:
      "Technical claims about how a system works. Math, mechanism, comparisons.",
    expectedKind: "audit",
  },
  {
    id: "UF8uR6Z6KLc",
    url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc",
    label: "Public speech · long-form",
    description:
      "First-person assertions about life events and personal credentials.",
    expectedKind: "audit",
  },
  {
    id: "WSKi8HfcxEk",
    url: "https://www.youtube.com/watch?v=WSKi8HfcxEk",
    label: "Educational short",
    description:
      "Compressed informational claim density — the format claim-ledger is sharpest on.",
    expectedKind: "audit",
  },
  {
    id: "gAjR4_CbPpQ",
    url: "https://www.youtube.com/watch?v=gAjR4_CbPpQ",
    label: "Short-form clip",
    description:
      "Very short. Tests behavior on tiny transcripts where claim density is high per second.",
    expectedKind: "audit",
  },
  {
    id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    label: "Music · non-informational",
    description:
      "Empty-state demo. The auditor should refuse to speak — no factual claims to surface.",
    expectedKind: "no-audit-applicable",
  },
];
