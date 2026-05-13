import {
  PAPER_VERDICTS,
  type PaperVerdict,
  type ResearchResult,
  type ResearchedPaper,
} from "./types";

const HAIKU_MODEL = "claude-haiku-4-5";
const HAIKU_TIMEOUT_MS = 20_000;
const HAIKU_MAX_OUTPUT_TOKENS = 800;
const HAIKU_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_VERSION = "2023-06-01";

const SS_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const SS_FIELDS =
  "title,abstract,year,citationCount,externalIds,authors,openAccessPdf";
const SS_LIMIT = 5;
const SS_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You are a research lens for a YouTube claim auditor.

You will receive one factual claim made by a speaker, plus a short list of academic papers (title + abstract) retrieved from Semantic Scholar via a keyword search. Your job: judge whether each paper supports, contradicts, or is merely tangential to the claim.

Verdicts:
- "supports": The paper's findings, methods, or conclusions align with the claim.
- "contradicts": The paper's findings, methods, or conclusions directly disagree with the claim.
- "tangential": The paper is on the same topic but doesn't strongly support or contradict — adjacent literature, or the abstract doesn't address the specific assertion.

Be conservative. When the abstract is ambiguous, prefer "tangential" over "supports" or "contradicts". An abstract that mentions related concepts but doesn't directly address the claim is tangential, not supportive.

For each paper, also emit a SHORT one-line reasoning (≤140 characters) that names the specific finding or methodology you keyed on. No hedging language in your reasoning — just say what the paper found.

Output: a JSON object with a "verdicts" array, one entry per paper in the order given. Length MUST match the number of papers provided.`;

const VERDICTS_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: [...PAPER_VERDICTS] },
          reasoning: { type: "string", maxLength: 200 },
        },
        required: ["verdict", "reasoning"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

export type ResearchErrorKind =
  | "no-key"
  | "ss-rate-limited"
  | "ss-failed"
  | "haiku-failed"
  | "haiku-timeout"
  | "no-papers"
  | "bad-input"
  | "unknown";

export class ResearchError extends Error {
  constructor(
    public readonly kind: ResearchErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

type SemanticScholarPaper = {
  paperId?: string;
  title?: string;
  abstract?: string | null;
  year?: number | null;
  citationCount?: number | null;
  externalIds?: { DOI?: string | null } | null;
  authors?: { name?: string }[] | null;
  openAccessPdf?: { url?: string } | null;
};

async function searchSemanticScholar(
  query: string,
): Promise<SemanticScholarPaper[]> {
  const url = `${SS_URL}?query=${encodeURIComponent(query)}&limit=${SS_LIMIT}&fields=${SS_FIELDS}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ResearchError(
        "ss-failed",
        `Semantic Scholar request timed out after ${SS_TIMEOUT_MS}ms.`,
      );
    }
    throw new ResearchError(
      "ss-failed",
      error instanceof Error ? error.message : "Semantic Scholar fetch failed.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new ResearchError(
      "ss-rate-limited",
      "Semantic Scholar rate-limited the request. Try again in a moment.",
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ResearchError(
      "ss-failed",
      `Semantic Scholar returned ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as { data?: SemanticScholarPaper[] };
  return (data.data ?? []).filter(
    // Drop entries without title or abstract — they can't be judged usefully.
    (p) => p.title && p.abstract && p.abstract.length > 0,
  );
}

function formatAuthors(authors: { name?: string }[] | null | undefined): string {
  if (!authors || authors.length === 0) return "Unknown";
  const names = authors
    .map((a) => a.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length === 0) return "Unknown";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} et al.`;
}

function paperUrl(p: SemanticScholarPaper): string {
  const doi = p.externalIds?.DOI;
  if (doi) return `https://doi.org/${doi}`;
  const pdf = p.openAccessPdf?.url;
  if (pdf) return pdf;
  if (p.paperId) return `https://www.semanticscholar.org/paper/${p.paperId}`;
  return "https://www.semanticscholar.org/";
}

async function judgePapers(
  claim: string,
  verbatim: string,
  papers: SemanticScholarPaper[],
): Promise<{ verdict: PaperVerdict; reasoning: string }[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ResearchError(
      "no-key",
      "ANTHROPIC_API_KEY is not set in the environment.",
    );
  }

  const paperBlock = papers
    .map(
      (p, i) =>
        `[Paper ${i + 1}]\nTitle: ${p.title}\nYear: ${p.year ?? "unknown"}\nAbstract: ${(p.abstract ?? "").slice(0, 1200)}`,
    )
    .join("\n\n");

  const body = {
    model: HAIKU_MODEL,
    max_tokens: HAIKU_MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Claim to evaluate:\n  Paraphrase: ${claim}\n  Verbatim quote: "${verbatim}"\n\nPapers:\n\n${paperBlock}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: VERDICTS_SCHEMA,
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(HAIKU_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": HAIKU_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ResearchError(
        "haiku-timeout",
        `Haiku judgment timed out after ${HAIKU_TIMEOUT_MS}ms.`,
      );
    }
    throw new ResearchError(
      "haiku-failed",
      error instanceof Error ? error.message : "Haiku fetch failed.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ResearchError(
      "haiku-failed",
      `Anthropic ${response.status}: ${errorText.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new ResearchError("haiku-failed", "Haiku returned no text content.");
  }

  let parsed: {
    verdicts?: { verdict: PaperVerdict; reasoning: string }[];
  };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ResearchError(
      "haiku-failed",
      "Haiku returned non-JSON despite the schema constraint.",
    );
  }
  const verdicts = parsed.verdicts ?? [];
  if (verdicts.length !== papers.length) {
    throw new ResearchError(
      "haiku-failed",
      `Haiku verdict length mismatch (got ${verdicts.length}, expected ${papers.length}).`,
    );
  }
  return verdicts;
}

/**
 * Research a single claim against academic literature.
 *
 *  1. Search Semantic Scholar with the academic-keyword query the
 *     extraction model already emitted (searchQuery field). Top 5 papers
 *     with title + abstract.
 *  2. Send those abstracts to Haiku 4.5 in one batched call: for each
 *     paper, supports / contradicts / tangential, plus a one-line
 *     reasoning that names the specific finding.
 *  3. Merge the SS metadata (authors, year, citation count, URL) with
 *     Haiku's verdicts and return ResearchResult.
 *
 * Cost: one SS call (free) + one Haiku call (~$0.0015). Latency: ~5-10s.
 * Lazy-fired from the client — never runs at audit time.
 */
export async function researchClaim(input: {
  claim: string;
  verbatim: string;
  searchQuery: string;
}): Promise<ResearchResult> {
  const { claim, verbatim, searchQuery } = input;
  if (!searchQuery.trim() || !claim.trim()) {
    throw new ResearchError("bad-input", "Missing claim or searchQuery.");
  }

  const papers = await searchSemanticScholar(searchQuery);
  if (papers.length === 0) {
    return { papers: [] };
  }

  const verdicts = await judgePapers(claim, verbatim, papers);

  const researched: ResearchedPaper[] = papers.map((p, i) => ({
    title: p.title ?? "Untitled",
    authors: formatAuthors(p.authors ?? null),
    year: p.year ?? null,
    citationCount:
      typeof p.citationCount === "number" ? p.citationCount : null,
    url: paperUrl(p),
    verdict: verdicts[i].verdict,
    reasoning: verdicts[i].reasoning,
  }));

  return { papers: researched };
}
