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
 * users shouldn't be projecting taste judgments onto the tool based on
 * which creators they happen to recognize.
 */
export const CURATED_SAMPLES: CuratedSample[] = [
  {
    id: "jEPgI3RvjSU",
    url: "https://www.youtube.com/shorts/jEPgI3RvjSU",
    label: "Nutrition short · contested",
    description:
      "30-second Short with a stack of contested nutrition claims about meat and plants. The kind of fast, confident, source-free content the auditor is sharpest on.",
    expectedKind: "audit",
  },
  {
    id: "HEP88cRbFvI",
    url: "https://www.youtube.com/watch?v=HEP88cRbFvI",
    label: "News interview · health",
    description:
      "Cable-news interview about COVID and public-health policy — dense with hedged claims, vague-sourced statistics, and citation-worthy assertions about disease prevalence and treatment.",
    expectedKind: "audit",
  },
  {
    id: "lEXBxijQREo",
    url: "https://www.youtube.com/watch?v=lEXBxijQREo",
    label: "Health short · animated",
    description:
      "Short health/wellness explainer with dense factual claims about neurochemistry. Tests behavior in the format where claim auditing pays the highest dividends.",
    expectedKind: "audit",
  },
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
    id: "WSKi8HfcxEk",
    url: "https://www.youtube.com/watch?v=WSKi8HfcxEk",
    label: "Educational short",
    description:
      "Compressed informational claim density — the format claim-ledger is sharpest on.",
    expectedKind: "audit",
  },
];
