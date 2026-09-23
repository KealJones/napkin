/**
 * What a run of words names: the graph first, then Wikidata, never a model.
 *
 * "cover letter" is one kind of thing and is written `CoverLetter`; "barista job" is a job
 * described by barista and is written `Job(Barista())`. Nothing in the grammar tells the two
 * apart. The graph does when it already knows the Concept. Otherwise Wikidata does: a phrase
 * that is the exact label or alias of an item names one kind of thing
 * (`design/reading-spec.md`, P4).
 *
 * What Wikidata confirms is learned into the graph, as an ordinary Concept carrying its
 * Wikidata identity as a relation, `CoverLetter  SameAs(Wikidata("Q1350434"))`. The next
 * parse finds it in the graph and asks nobody. A "no" is not knowledge about anything, so it
 * is never minted; it is remembered only for this process. There is no side store.
 *
 * Lookups happen before parsing, so the parser stays synchronous: it reads the graph and
 * this process's answers, and a phrase nobody has answered composes, which never invents a
 * compound.
 */
import nlp from "compromise";
import { concept } from "../../concept/unit.js";
import type { ConceptStore } from "../../store/store.js";

let graph: ConceptStore | undefined;
/** The graph the parser reads names from and learns them into. */
export const useGraph = (store: ConceptStore | undefined): void => {
  graph = store;
};

/** Phrases Wikidata said no to, this process only. */
const notNames = new Set<string>();
/** Phrases the parser needed and nobody could answer yet, for the caller to look up. */
const wanted = new Set<string>();

/** The singular a phrase is known by: "web servers" is "web server". */
const key = (phrase: string): string => {
  const words = phrase.toLowerCase().split(/\s+/);
  const last = nlp(words[words.length - 1]).nouns().toSingular().text() || words[words.length - 1];
  return [...words.slice(0, -1), last].join(" ");
};

const identity = (phrase: string): string =>
  key(phrase)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

/** Whether the phrase names one kind of thing, if anyone knows. Undefined means not yet. */
export function namesOneThing(phrase: string): boolean | undefined {
  if (graph?.has(identity(phrase))) return true;
  if (notNames.has(key(phrase))) return false;
  wanted.add(key(phrase));
  return undefined;
}

/** The phrases asked about since the last call and not answered. */
export function takeWanted(): string[] {
  const out = [...wanted];
  wanted.clear();
  return out;
}

interface Hit {
  id: string;
  label?: string;
  description?: string;
  match?: { type?: string; text?: string };
}

/** The Wikidata item the phrase is the exact label or alias of, if there is one. */
async function lookUp(phrase: string, timeoutMs: number): Promise<Hit | null> {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=" +
    encodeURIComponent(phrase);
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "napkin-ears/0.1" } });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const body = (await response.json()) as { search?: Hit[] };
  const want = phrase.toLowerCase();
  return (
    (body.search ?? []).find(
      (hit) => hit.label?.toLowerCase() === want || (hit.match?.type === "alias" && hit.match.text?.toLowerCase() === want),
    ) ?? null
  );
}

/**
 * Look up each phrase once. A confirmed name becomes a Concept in the graph; a "no" is
 * remembered for this process; a failed lookup is not remembered at all, so an offline run
 * leaves the question open rather than answering it wrongly. Returns whether anything was
 * answered, so the caller knows to read the message again.
 */
export async function learnNames(phrases: readonly string[], timeoutMs = 4000): Promise<boolean> {
  const todo = [...new Set(phrases.map(key))].filter((p) => !notNames.has(p) && !graph?.has(identity(p)));
  if (!todo.length) return false;
  const answers = await Promise.allSettled(todo.map((p) => lookUp(p, timeoutMs)));
  let answered = false;
  answers.forEach((a, i) => {
    if (a.status !== "fulfilled") return;
    answered = true;
    const hit = a.value;
    if (!hit) {
      notNames.add(todo[i]);
      return;
    }
    graph?.seed(
      concept(identity(todo[i]), {
        relations: [`SameAs(Wikidata(${JSON.stringify(hit.id)}))`, `Named(${JSON.stringify(todo[i])})`],
      }),
    );
  });
  return answered;
}
