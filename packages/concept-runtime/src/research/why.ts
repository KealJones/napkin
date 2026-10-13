/**
 * "Why is the sky blue?": an explanation put together, not a sentence handed back.
 *
 * A question word that asks for a reason (`Why Asks(Reason())`) is answered from causes. What is
 * asked about is the question's own words, less the question word and the words that only help
 * ("sky blue"). The graph is read first: a cause it already holds (`HasCause`) is said again
 * with no lookup.
 *
 * Otherwise, with learning on, it is looked for in what the world has written. Wikipedia is
 * searched, and every sentence of the pages found is read. The one that is about what was asked
 * (most of its words) and says why (a word the graph knows as a `CausalConnective`: "because",
 * "due to", "caused by") is taken apart: the cause is what follows the connective. The cause is
 * then explained in turn, by what its own page says it is. So the answer is a chain, said in
 * Napkin's words, with where each link came from:
 *
 *   "Because of Rayleigh scattering. Rayleigh scattering is the scattering of light by particles
 *    much smaller than its wavelength. (Wikipedia: Diffuse sky radiation; Rayleigh scattering)"
 *
 * What is found is kept (`SkyBlue HasCause(RayleighScattering(), said=..., from=...)`), so the
 * next time it is answered from the graph.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words } from "../runtime/host.js";
import { bases } from "../ears/parser/words.js";

type Fetch = (url: string) => Promise<unknown>;

const API = "https://en.wikipedia.org/w/api.php?origin=*&format=json&";

const defaultFetch: Fetch = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "Napkin/0.1 (https://github.com/KealJones/napkin; explanations)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  return response.json();
};

/** The words of a Concept's name: CausalConnective's members are named by what they say ("DueTo" is "due to"). */
const wordsOfName = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/** Whether a question word asks for a reason, by the graph: `Asks(Reason())`. */
export function asksReason(store: ConceptStore, word: string): boolean {
  const id = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return store.asSubject(id).some((t) => t.predicate === "Asks" && isCall(t.expr) && isCall(t.expr.args[0]?.value) && (t.expr.args[0].value as { head: string }).head === "Reason");
}

/** The words that say why, longest first: every Concept that IsA CausalConnective, said by its name. */
function connectives(store: ConceptStore): string[] {
  return store
    .asObject("CausalConnective")
    .filter((t) => t.predicate === "IsA")
    .map((t) => wordsOfName(t.subject))
    .sort((a, b) => b.length - a.length);
}

/** What a why-question asks about: its words that say something, as written and as lemmas. */
export function askedAbout(message: string): { phrase: string; lemmas: string[] } {
  const said = words(message).slice(1);
  const kept = said.filter((w) => {
    const t = new Set(w.tags);
    return !(t.has("Copula") || t.has("Auxiliary") || t.has("Determiner") || t.has("Pronoun") || t.has("Preposition") || t.has("Conjunction") || t.has("QuestionWord"));
  });
  return { phrase: kept.map((w) => w.text.toLowerCase()).join(" "), lemmas: kept.map((w) => lemma(w.text.toLowerCase())) };
}

const forms = (w: string): string[] => [...new Set([w, lemma(w), ...bases(w)])];

/** How much of what was asked a sentence is about: the share of the asked words it holds. */
function coverage(sentence: string, lemmas: readonly string[]): number {
  const have = new Set(sentence.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).flatMap(forms));
  return lemmas.length ? lemmas.filter((l) => forms(l).some((f) => have.has(f))).length / lemmas.length : 0;
}

/** A sentence that says why, taken apart: what follows the connective, to the end of its clause. */
export function causeIn(sentence: string, said: readonly string[]): { connective: string; cause: string } | undefined {
  const lower = sentence.toLowerCase();
  for (const k of said) {
    const at = lower.search(new RegExp(`\\b${k.replace(/ /g, "\\s+")}\\b`));
    if (at < 0) continue;
    const rest = sentence.slice(at + k.length).trim();
    // To the end of the clause: a semicolon, or the sentence's end.
    const cause = rest.split(/;|\.\s|\.$/)[0].replace(/^(of|the fact that)\s+/i, (m) => (m.toLowerCase().startsWith("of") ? "" : "")).trim();
    if (cause.split(/\s+/).length >= 2 || /^[A-Z]/.test(cause)) return { connective: k, cause };
  }
  return undefined;
}

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);

interface Page {
  readonly title: string;
  readonly text: string;
}

async function search(query: string, get: Fetch, limit = 3): Promise<string[]> {
  const body = (await get(API + new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: String(limit) }))) as {
    query?: { search?: { title: string }[] };
  };
  return (body.query?.search ?? []).map((s) => s.title);
}

async function page(title: string, get: Fetch, intro = false): Promise<Page | undefined> {
  const params: Record<string, string> = { action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title };
  if (intro) params.exintro = "1";
  const body = (await get(API + new URLSearchParams(params))) as { query?: { pages?: Record<string, { title?: string; extract?: string }> } };
  const p = Object.values(body.query?.pages ?? {})[0];
  return p?.extract ? { title: p.title ?? title, text: p.extract } : undefined;
}

export interface Explained {
  readonly about: string;
  /** The words that said why ("because", "due to"). */
  readonly connective: string;
  /** The sentence the cause was read from, as written. */
  readonly said: string;
  readonly cause: string;
  /** What the cause is, from its own page's first sentence, if it has one. */
  readonly causeIs?: string;
  readonly from: string[];
}

/** What the graph already holds of why: a kept HasCause of what was asked. */
export function heldWhy(store: ConceptStore, about: string): Explained | undefined {
  const id = nameOf(about);
  for (const t of store.asSubject(id)) {
    if (t.predicate !== "HasCause" || !isCall(t.expr)) continue;
    const arg = (n: string) => t.expr && isCall(t.expr) ? t.expr.args.find((a) => a.name === n)?.value : undefined;
    const said = arg("said");
    const cause = arg("cause");
    const from = arg("from");
    const causeIs = arg("is");
    if (typeof said === "string" && typeof cause === "string") {
      const connective = arg("connective");
      return { about, connective: typeof connective === "string" ? connective : "because", said, cause, ...(typeof causeIs === "string" ? { causeIs } : {}), from: typeof from === "string" ? from.split("; ") : [] };
    }
  }
  return undefined;
}

/**
 * Why something is so, put together from what the world has written, and kept. Undefined when no
 * sentence found says why of it.
 */
export async function explainWhy(
  store: ConceptStore,
  message: string,
  options: { fetch?: Fetch; cause?: number; lookup?: boolean } = {},
): Promise<Explained | undefined> {
  const { phrase, lemmas } = askedAbout(message);
  if (!phrase) return undefined;
  const held = heldWhy(store, phrase);
  if (held || !options.lookup) return held;
  const get = options.fetch ?? defaultFetch;
  const said = connectives(store);
  if (!said.length) return undefined;
  let best: { score: number; sentence: string; title: string; found: { connective: string; cause: string } } | undefined;
  for (const title of await search(`why ${phrase}`, get)) {
    const p = await page(title, get).catch(() => undefined);
    if (!p) continue;
    for (const [i, sentence] of sentencesOf(p.text).entries()) {
      const cov = coverage(sentence, lemmas);
      if (cov < 0.5) continue;
      const found = causeIn(sentence, said);
      if (!found) continue;
      // About more of what was asked first, then earlier on its page (the lead says it plainest).
      const score = cov * 10 - i * 0.01;
      if (!best || score > best.score) best = { score, sentence, title: p.title, found };
    }
  }
  if (!best) return undefined;
  // The cause, explained in turn: what its own page says it is, in its first sentence.
  const from = [best.title];
  let causeIs: string | undefined;
  // The cause named, without what is said of it after (", which ...").
  const named = best.found.cause.split(/,|\s(?:which|that|who|where)\s/)[0].trim();
  const causeTitle = (await search(named, get, 1).catch(() => []))[0];
  if (causeTitle && causeTitle !== best.title) {
    const lead = await page(causeTitle, get, true).catch(() => undefined);
    const first = lead ? sentencesOf(lead.text)[0] : undefined;
    if (first && coverage(first, named.toLowerCase().split(/\s+/).map((w) => lemma(w))) >= 0.5) {
      causeIs = first;
      from.push(causeTitle);
    }
  }
  const explained: Explained = { about: phrase, connective: best.found.connective, said: best.sentence, cause: best.found.cause, ...(causeIs ? { causeIs } : {}), from };
  const imported = store.addRelation("Wikipedia", call("Imported", [{ value: from.join("; ") }, { name: "license", value: "CC BY-SA 4.0" }]), undefined, options.cause);
  store.addRelation(
    nameOf(phrase),
    call("HasCause", [
      { value: c(nameOf(named) || "Cause") },
      { name: "cause", value: best.found.cause },
      { name: "connective", value: best.found.connective },
      { name: "said", value: best.sentence },
      ...(causeIs ? [{ name: "is", value: causeIs }] : []),
      { name: "from", value: from.join("; ") },
    ]),
    undefined,
    imported.seq,
  );
  return explained;
}

/** The explanation as a Concept for the graph to word (`Explanation`, packs/follows.ncon). */
export function explanation(e: Explained): Expr {
  return call("Explanation", [
    { value: e.about },
    { name: "cause", value: e.cause },
    { name: "connective", value: c(nameOf(e.connective)) },
    { name: "said", value: e.said },
    ...(e.causeIs ? [{ name: "is", value: e.causeIs }] : []),
    { name: "from", value: call("List", e.from.map((f) => ({ value: f }))) },
  ]);
}
