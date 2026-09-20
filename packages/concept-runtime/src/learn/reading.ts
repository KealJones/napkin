/**
 * Evidence from documents you already have, instead of from the web.
 *
 * Research grounds the Teacher in sources, which is right for `money` and wrong for
 * `realization`. Nearly every term this project is made of is a common word wearing a
 * local meaning: the web returns philosophy of mind for "realization", library science for
 * "facet", and statistics for "residual". Grounding in those teaches the wrong sense of
 * exactly the words that matter most.
 *
 * The specs define those terms correctly and are the only source that does. This finds the
 * passages that talk about a given identity and hands them over as ordinary evidence, so
 * nothing downstream needs to know where evidence came from.
 *
 * Deliberately crude retrieval: paragraph splitting and term overlap, no embeddings, no
 * index. The corpus is a handful of design documents, and a wrong passage costs one
 * mediocre lesson rather than a wrong answer.
 */
import type { Finding } from "../research/sources.js";

export interface Document {
  readonly name: string;
  readonly text: string;
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "that", "this", "for",
  "on", "as", "at", "by", "be", "are", "was", "with", "not", "but", "from", "its",
]);

const terms = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Paragraphs, with fenced code kept whole so an example is never cut in half. */
export function paragraphs(text: string): string[] {
  const out: string[] = [];
  let fence: string[] | undefined;
  let current: string[] = [];
  const flush = (): void => {
    const joined = current.join("\n").trim();
    if (joined) out.push(joined);
    current = [];
  };
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      if (fence) {
        out.push([...fence, line].join("\n"));
        fence = undefined;
      } else {
        flush();
        fence = [line];
      }
      continue;
    }
    if (fence) fence.push(line);
    else if (line.trim() === "") flush();
    else current.push(line);
  }
  if (fence) out.push(fence.join("\n"));
  flush();
  return out;
}

/**
 * Passages about `query`, best first.
 *
 * A paragraph that names the term in full scores far above one that merely shares a word
 * with it, because "context facet" and "the facets of a context" are the same subject while
 * "in this context" is not.
 */
export function passages(
  documents: readonly Document[],
  query: string,
  limit = 5,
  clip = 700,
): Finding[] {
  const wanted = terms(query);
  if (!wanted.length) return [];
  const phrase = query.toLowerCase().trim();

  const scored: { score: number; text: string; name: string }[] = [];
  for (const doc of documents) {
    for (const passage of paragraphs(doc.text)) {
      const lower = passage.toLowerCase();
      const overlap = wanted.filter((w) => lower.includes(w)).length;
      if (!overlap) continue;
      // Naming the whole term outweighs sharing pieces of it.
      const named = lower.includes(phrase) ? 10 : 0;
      // Prefer prose that is about the term to prose that mentions it in passing.
      const density = overlap / Math.max(20, terms(passage).length / 8);
      scored.push({ score: named + overlap + density, text: passage, name: doc.name });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      title: s.name,
      snippet: s.text.length > clip ? `${s.text.slice(0, clip)}…` : s.text,
      url: s.name,
      source: "Reading" as const,
    }));
}
