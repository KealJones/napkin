/**
 * What follows from an everyday event, as ATOMIC 2020 says it (Hwang et al., 2021; CC BY 4.0):
 * how the one it happens to feels (xReact), what they want next (xWant), what it does to them
 * (xEffect), what it takes first (xNeed), why one would do it (xIntent). Looked up when a message
 * tells of an event, through the Hugging Face dataset server's search over a public copy of the
 * tuples, and kept like anything else learned, each relation sourced from one import stamp per
 * event (`Atomic Imported("car break down", dataset=, license=)`), so what was taken is
 * separable and is not asked again.
 *
 * ATOMIC writes events with placeholders ("PersonX's car breaks down", "PersonX loses PersonX's
 * job"); a row is the event told when every word that says something in the telling is a word of
 * its event (by base form), and the event says little else. The search matches words anywhere in
 * a row, so most of what it returns is not the event: those rows are left.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";
import nlp from "compromise";
import { lemma } from "../runtime/host.js";

type Fetch = (url: string) => Promise<unknown>;

const SERVER = "https://datasets-server.huggingface.co/search?";
const DATASET = "Estwld/atomic2020-origin";
const LICENSE = "CC BY 4.0";

/** ATOMIC's relations that say what an event leads to, as the graph names them. */
export const ATOMIC = { xReact: "XReact", xWant: "XWant", xEffect: "XEffect", xNeed: "XNeed", xIntent: "XIntent", oReact: "OReact", oWant: "OWant" } as const;
const HEADS: ReadonlySet<string> = new Set(Object.values(ATOMIC));

/** Enough to say something; the most said first. */
const PER_RELATION = 3;

const defaultFetch: Fetch = async (url) => {
  // The first search of the dataset builds its index and can take a minute; a lookup that times
  // out is tried again another time, not kept as nothing found.
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`ATOMIC ${response.status}`);
  return response.json();
};

interface Row {
  readonly event?: string;
  readonly relation?: string;
  readonly tail?: string | readonly string[];
}

/** The words of an event that say something, by base form: "PersonX's car breaks down" is car, break, down. */
const LEAVE = ["Determiner", "Pronoun", "Possessive", "Copula", "Conjunction", "Auxiliary", "Adverb", "Date", "Preposition", "QuestionWord"];
type Term = { text: string; root?: string; tags: string[] };
const termsOf = (text: string): Term[] => {
  const doc = nlp(text.replace(/\bPerson[XYZ]('s)?\b/g, " ").replace(/___/g, " "));
  doc.compute("root");
  return (doc.json() as { terms: Term[] }[]).flatMap((s) => s.terms);
};
const kept = (t: Term) => !t.tags.some((x) => LEAVE.includes(x) && !(x === "Preposition" && t.tags.includes("Particle"))) && /[a-z]/i.test(t.text);
const base = (t: Term) => (t.root || lemma(t.text.toLowerCase().replace(/[^a-z']/g, "")) || t.text.toLowerCase()).toLowerCase();
const said = (text: string): string[] => termsOf(text).filter(kept).map(base).filter((w) => w.length > 1);

/** What the graph holds of what follows from an event, by ATOMIC. */
export function heldOf(store: ConceptStore, identity: string): Expr[] {
  return (store.get(identity)?.relations ?? []).filter((r) => r.context === undefined && isCall(r.claim) && HEADS.has(r.claim.head) && !store.retracted(identity, r.claim)).map((r) => r.claim);
}

/** Whether this event was looked up before, found or not. */
export function lookedUpInAtomic(store: ConceptStore, term: string): boolean {
  return store.asSubject("Atomic").some((t) => t.predicate === "Imported" && isCall(t.expr) && t.expr.args[0]?.value === term);
}

/**
 * The event a message tells of, as ATOMIC would be searched for it: the words of its first
 * clause with a doing in it that say something ("my car broke down" is "car break down").
 */
export function atomicTermOf(message: string): string | undefined {
  // Clauses: sentences, and what "and" / "but" join.
  const clauses: Term[][] = [[]];
  for (const t of termsOf(message)) {
    if (t.tags.includes("Conjunction") || /[.!?;]$/.test(t.text)) {
      if (!t.tags.includes("Conjunction") && kept(t)) clauses[clauses.length - 1]!.push(t);
      clauses.push([]);
    } else clauses[clauses.length - 1]!.push(t);
  }
  for (const clause of clauses) {
    if (!clause.some((t) => t.tags.includes("Verb") && !t.tags.includes("Copula") && !t.tags.includes("Auxiliary"))) continue;
    // A question asks; it tells of no event.
    if (clause.some((t) => t.tags.includes("QuestionWord"))) continue;
    const term = clause.filter(kept).map(base).filter((w) => w.length > 1);
    // One word is an event only when someone is said to do it ("i just got promoted"), not a word alone ("thanks").
    const someone = clause.some((t) => t.tags.includes("Noun") || t.tags.includes("Pronoun"));
    if ((term.length >= 2 || (term.length === 1 && someone)) && term.length <= 6) return term.join(" ");
  }
  return undefined;
}

/**
 * Look an event up in ATOMIC and keep what follows from it, on the event's Concept (named as
 * its words are: CarBreakDown). What was kept; empty when nothing matched.
 */
export async function groundInAtomic(store: ConceptStore, term: string, options: { fetch?: Fetch; cause?: number; wait?: number } = {}): Promise<{ identity: string; relations: Expr[] }> {
  const identity = nameOf(term);
  if (!identity) return { identity: "", relations: [] };
  const held = heldOf(store, identity);
  if (held.length || lookedUpInAtomic(store, term) || pending.has(term)) return { identity, relations: held };
  // Not waited on past `wait`: what comes later is kept for the next time the event is told.
  pending.add(term);
  const work = lookUp(store, identity, term, options).finally(() => pending.delete(term));
  if (options.wait === undefined) return work;
  return Promise.race([work, new Promise<{ identity: string; relations: Expr[] }>((done) => setTimeout(() => done({ identity, relations: [] }), options.wait))]);
}

/** Events being looked up now, so a second telling does not ask again while the first is out. */
const pending = new Set<string>();

async function lookUp(store: ConceptStore, identity: string, term: string, options: { fetch?: Fetch; cause?: number }): Promise<{ identity: string; relations: Expr[] }> {
  const get = options.fetch ?? defaultFetch;
  // Asked as ATOMIC writes its events ("PersonX ..."), so rows about the event come before rows
  // that only mention its words; two pages of them.
  const page = (offset: number) => get(SERVER + new URLSearchParams({ dataset: DATASET, config: "default", split: "train", query: `PersonX ${term}`, offset: String(offset), length: "100" })) as Promise<{ rows?: { row?: Row }[] }>;
  const pages = await Promise.all([page(0), page(100).catch(() => ({ rows: [] }))]);
  const wanted = new Set(term.split(" "));
  // The rows whose event is the one told: every word of the telling in it, and little else.
  const rows = pages.flatMap((body) => body.rows ?? []).map((r) => r.row ?? {}).filter((r) => {
    if (typeof r.event !== "string") return false;
    const event = new Set(said(r.event));
    return [...wanted].every((w) => event.has(w)) && event.size <= wanted.size + 2;
  });
  const imported = store.addRelation("Atomic", call("Imported", [{ value: term }, { name: "dataset", value: DATASET }, { name: "license", value: LICENSE }]), undefined, options.cause);
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const head = ATOMIC[r.relation as keyof typeof ATOMIC];
    if (!head) continue;
    for (const tail of Array.isArray(r.tail) ? r.tail : [r.tail]) {
      if (typeof tail !== "string") continue;
      const t = tail.toLowerCase().replace(/^(to|personx|x)\s+/, "").replace(/[.!]+$/, "").trim();
      if (!t || t === "none" || t.length < 3 || /person[xyz]/.test(t)) continue;
      const m = counts.get(head) ?? new Map<string, number>();
      m.set(t, (m.get(t) ?? 0) + 1);
      counts.set(head, m);
    }
  }
  const kept: Expr[] = [];
  for (const [head, m] of counts) {
    for (const [tail] of [...m].sort((a, b) => b[1] - a[1]).slice(0, PER_RELATION)) {
      const target = nameOf(tail);
      if (!target || !/^[A-Z]/.test(target) || target === identity) continue;
      const claim = c(head, c(target));
      store.addRelation(identity, claim, undefined, imported.seq);
      kept.push(claim);
    }
  }
  return { identity, relations: kept };
}
