/**
 * Research sources, as Concepts (concept-spec Part 12, step 4).
 *
 * These exist so the Teacher is genuinely a last resort rather than the only path. Search
 * results become Concepts like everything else, so what is found can be inspected,
 * related, and reasoned over instead of being an opaque blob handed to a model.
 */
import { type Expr, c, call } from "../concept/expression.js";

export interface Finding {
  readonly title: string;
  readonly snippet: string;
  readonly url: string;
  readonly source: "Wikidata" | "Web" | "Reading";
}

const clip = (s: string, n = 280): string => (s.length > n ? `${s.slice(0, n)}…` : s);

const decode = (s: string): string =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Structured labels and descriptions, which are the most Concept-shaped source there is. */
export async function wikidata(query: string, limit = 5, timeoutMs = 10_000): Promise<Finding[]> {
  const url =
    "https://www.wikidata.org/w/api.php?" +
    new URLSearchParams({
      action: "wbsearchentities",
      search: query,
      language: "en",
      uselang: "en",
      format: "json",
      formatversion: "2",
      limit: String(limit),
      origin: "*",
    });
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    search?: { label?: string; description?: string; concepturi?: string }[];
  };
  return (body.search ?? [])
    .filter((r) => r.description)
    .map((r) => ({
      title: r.label ?? query,
      snippet: clip(r.description ?? ""),
      url: r.concepturi ?? "",
      source: "Wikidata" as const,
    }));
}

export async function web(query: string, limit = 5, timeoutMs = 10_000): Promise<Finding[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; napkin/0.1)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return [];
  const html = await response.text();
  const out: Finding[] = [];
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    out.push({ title: decode(m[2]), snippet: clip(decode(m[3])), url: m[1], source: "Web" });
  }
  return out;
}

/** Findings become Concepts, with their source attached so a claim can be traced to it. */
export const asConcepts = (findings: readonly Finding[]): Expr =>
  c(
    "SearchResults",
    ...findings.map((f) =>
      call("SearchResult", [
        { name: "title", value: f.title },
        { name: "snippet", value: f.snippet },
        { name: "url", value: f.url },
        { name: "source", value: c(f.source) },
      ]),
    ),
  );

export async function research(query: string, limit = 4): Promise<Finding[]> {
  const settled = await Promise.allSettled([wikidata(query, limit), web(query, limit)]);
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Source-attributed text for the Teacher, bounded so it cannot swamp the prompt. */
export function evidenceText(findings: readonly Finding[], max = 6): string {
  if (!findings.length) return "";
  return findings
    .slice(0, max)
    .map((f) => `[${f.source}] ${f.title}: ${f.snippet}`)
    .join("\n");
}
