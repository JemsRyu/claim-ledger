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

// OpenAlex — fully open, no key, 100K req/day per IP, ~250M works
// indexed. We pick it over Semantic Scholar's unauthenticated tier
// because SS aggressively 429s shared IPs (Vercel egress included)
// even on first contact. If we want SS specifically (it has slightly
// better CS / fringe-domain coverage), set SEMANTIC_SCHOLAR_API_KEY
// — but the OpenAlex path stays the default.
const OPENALEX_URL = "https://api.openalex.org/works";
const OPENALEX_LIMIT = 5;
const OPENALEX_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You are a research lens for a YouTube claim auditor.

You will receive one factual claim made by a speaker, plus a short list of academic papers (title + abstract) retrieved via an academic-keyword search. Your job: judge whether each paper supports, contradicts, or is merely tangential to the claim.

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
  | "search-rate-limited"
  | "search-failed"
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

type OpenAlexWork = {
  id?: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  doi?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string } | null }[] | null;
};

/**
 * OpenAlex returns abstracts as an inverted index — {word: [positions]} —
 * to save bytes. Reconstruct into prose by walking positions in order.
 * Returns "" if the index is null or empty.
 */
function reconstructAbstract(
  inverted: Record<string, number[]> | null | undefined,
): string {
  if (!inverted) return "";
  const positionToWord = new Map<number, string>();
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) positionToWord.set(pos, word);
  }
  if (positionToWord.size === 0) return "";
  const maxPos = Math.max(...positionToWord.keys());
  const words: string[] = [];
  for (let i = 0; i <= maxPos; i++) {
    const w = positionToWord.get(i);
    if (w !== undefined) words.push(w);
  }
  return words.join(" ");
}

type SearchedPaper = {
  title: string;
  abstract: string;
  year: number | null;
  citationCount: number | null;
  url: string;
  authors: { name?: string }[];
};

async function searchOpenAlex(query: string): Promise<SearchedPaper[]> {
  // Polite-pool opt-in via mailto= adds a small priority boost in
  // OpenAlex's queue. Optional — we work fine without it.
  const contact = process.env.OPENALEX_CONTACT;
  const params = new URLSearchParams({
    search: query,
    "per-page": String(OPENALEX_LIMIT),
    select:
      "id,title,display_name,publication_year,cited_by_count,doi,abstract_inverted_index,authorships",
  });
  if (contact) params.set("mailto", contact);
  const url = `${OPENALEX_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENALEX_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ResearchError(
        "search-failed",
        `OpenAlex request timed out after ${OPENALEX_TIMEOUT_MS}ms.`,
      );
    }
    throw new ResearchError(
      "search-failed",
      error instanceof Error ? error.message : "OpenAlex fetch failed.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new ResearchError(
      "search-rate-limited",
      "OpenAlex rate-limited the request. Try again in a moment.",
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ResearchError(
      "search-failed",
      `OpenAlex returned ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as { results?: OpenAlexWork[] };
  const works = data.results ?? [];
  return works
    .map((w): SearchedPaper => {
      const title = (w.title ?? w.display_name ?? "").trim();
      const abstract = reconstructAbstract(w.abstract_inverted_index);
      const authors = (w.authorships ?? [])
        .map((a) => ({ name: a.author?.display_name }))
        .filter((a): a is { name: string } => !!a.name);
      const url = w.doi
        ? // OpenAlex returns DOIs as full https://doi.org/... URLs;
          // some entries return bare DOIs. Handle both.
          w.doi.startsWith("http")
          ? w.doi
          : `https://doi.org/${w.doi}`
        : w.id ?? "https://openalex.org/";
      return {
        title,
        abstract,
        year: typeof w.publication_year === "number" ? w.publication_year : null,
        citationCount:
          typeof w.cited_by_count === "number" ? w.cited_by_count : null,
        url,
        authors,
      };
    })
    .filter((p) => p.title.length > 0 && p.abstract.length > 0);
}

function formatAuthors(authors: { name?: string }[]): string {
  const names = authors
    .map((a) => a.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length === 0) return "Unknown";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} et al.`;
}

async function judgePapers(
  claim: string,
  verbatim: string,
  papers: SearchedPaper[],
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
        `[Paper ${i + 1}]\nTitle: ${p.title}\nYear: ${p.year ?? "unknown"}\nAbstract: ${p.abstract.slice(0, 1200)}`,
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
 *  1. Search OpenAlex with the academic-keyword query the extraction
 *     model already emitted (searchQuery field). Top 5 papers with
 *     title + abstract (reconstructed from OpenAlex's inverted index).
 *  2. Send those abstracts to Haiku 4.5 in one batched call: for each
 *     paper, supports / contradicts / tangential, plus a one-line
 *     reasoning that names the specific finding.
 *  3. Merge the search metadata (authors, year, citation count, URL)
 *     with Haiku's verdicts and return ResearchResult.
 *
 * Cost: one OpenAlex call (free) + one Haiku call (~$0.0015). Latency:
 * ~5-10s. Lazy-fired from the client — never runs at audit time.
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

  const papers = await searchOpenAlex(searchQuery);
  if (papers.length === 0) {
    return { papers: [] };
  }

  const verdicts = await judgePapers(claim, verbatim, papers);

  const researched: ResearchedPaper[] = papers.map((p, i) => ({
    title: p.title,
    authors: formatAuthors(p.authors),
    year: p.year,
    citationCount: p.citationCount,
    url: p.url,
    verdict: verdicts[i].verdict,
    reasoning: verdicts[i].reasoning,
  }));

  return { papers: researched };
}
