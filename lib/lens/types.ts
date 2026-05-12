export const ADVERSARIAL_FLAGS = [
  "contradicted",
  "hedged",
  "vague-sourced",
  "unsourced",
  "un-credentialed",
] as const;

export type AdversarialFlag = (typeof ADVERSARIAL_FLAGS)[number];

export type RawClaim = {
  id: string;
  claim: string;
  verbatim: string;
  // Academic-keyword query for Scholar verification (e.g., "human trophic
  // level diet evolution"). Optional so the synthesizer / mock-fallback
  // paths still produce valid claims; ClaimCard falls back to the
  // natural-language paraphrase when absent.
  searchQuery?: string;
  // Natural-language verification question for Google (e.g., "Are humans
  // actually apex predators?"). Google handles question-form well and
  // returns fact-checks, explainers, journalism. Optional, same fallback.
  verifyQuestion?: string;
};

export type ClaimSpan = {
  startSeconds: number;
  endSeconds: number;
};

export type ValidatedClaim = {
  id: string;
  claim: string;
  verbatim: string;
  span: ClaimSpan;
  matchedText: string;
  flags: AdversarialFlag[];
  searchQuery?: string;
  verifyQuestion?: string;
};

export type AuditResult =
  | { kind: "audit"; videoId: string; claims: ValidatedClaim[] }
  | { kind: "no-audit-applicable"; videoId: string; reason: string }
  | { kind: "no-transcript"; videoId: string; reason: string };

export type LensName = "extraction" | "classification";

export type AuditEvent =
  | { type: "transcript-ready"; segmentCount: number }
  | { type: "lens-start"; lens: LensName }
  | { type: "claim"; claim: RawClaim }
  | { type: "validated"; claim: ValidatedClaim }
  | {
      type: "classified";
      claimId: string;
      flags: AdversarialFlag[];
    }
  | { type: "no-audit-applicable"; reason: string }
  | { type: "no-transcript"; reason: string }
  | { type: "done" }
  | { type: "error"; message: string };
