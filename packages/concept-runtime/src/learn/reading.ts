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

export interface Passage {
  readonly text: string;
  /** The markdown headings above it, outermost first. What the passage is filed under. */
  readonly under: readonly string[];
}

/** Paragraphs, with fenced code kept whole so an example is never cut in half. */
export function paragraphs(text: string): string[] {
  return sections(text).map((p) => p.text);
}

/**
 * Paragraphs with the headings they sit under.
 *
 * Containing a word and being about it are different, and in a spec they are different in
 * a way the document structure already records. The table of a Concept's three parts
 * mentions "expression" once, sits under a heading about the Concept unit, and was the
 * top passage for `expression` — so the Teacher learned that an Expression has an identity,
 * relations and realizations, which is true of a Concept and false of an expression.
 */
export function sections(text: string): Passage[] {
  const out: Passage[] = [];
  let fence: string[] | undefined;
  let current: string[] = [];
  const trail: string[] = [];
  const flush = (): void => {
    const joined = current.join("\n").trim();
    if (joined) out.push({ text: joined, under: [...trail] });
    current = [];
  };
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      if (fence) {
        out.push({ text: [...fence, line].join("\n"), under: [...trail] });
        fence = undefined;
      } else {
        flush();
        fence = [line];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    const heading = /^(#+)\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const depth = heading[1]!.length;
      trail.length = Math.min(trail.length, depth - 1);
      trail[depth - 1] = heading[2]!.trim();
      for (let i = 0; i < trail.length; i += 1) trail[i] ??= "";
      continue;
    }
    if (line.trim() === "") flush();
    else current.push(line);
  }
  if (fence) out.push({ text: fence.join("\n"), under: [...trail] });
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
    for (const passage of sections(doc.text)) {
      const lower = passage.text.toLowerCase();
      const overlap = wanted.filter((w) => lower.includes(w)).length;
      const heading = passage.under.join(" ").toLowerCase();
      const filedUnder = heading.includes(phrase);
      if (!overlap && !filedUnder) continue;
      // Naming the whole term outweighs sharing pieces of it.
      const named = lower.includes(phrase) ? 10 : 0;
      // And being filed under it outweighs both: a document's own structure is a better
      // statement of what a passage is about than counting the words in it.
      const placed = filedUnder ? 25 : 0;
      // A passage filed under some OTHER term this corpus defines is about that term.
      const claimed = !filedUnder && heading && wanted.every((w) => !heading.includes(w)) ? -4 : 0;
      const density = overlap / Math.max(20, terms(passage.text).length / 8);
      scored.push({ score: placed + named + overlap + density + claimed, text: passage.text, name: doc.name });
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
