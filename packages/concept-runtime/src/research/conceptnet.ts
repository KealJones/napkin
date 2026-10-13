/**
 * What follows from what is told: ConceptNet's common sense about events, looked up when a
 * message tells of one and kept, like anything else learned.
 *
 * "I lost my job" is about losing a job, and ConceptNet holds what losing your job causes
 * (depression), what it makes you want (to find a new one), what happens in it. Those are the
 * graph's to answer with (packs/follows.ncon), not a corpus line someone once said to something
 * near it. Only the relations that say what an event leads to are taken; what a thing is, or
 * is near, is Wikidata's and the grounding layers' (src/seed/grounding).
 *
 * An event is named the way ConceptNet names one: its words as said, lower case, joined by
 * "_" (`/c/en/losing_your_job`). ConceptNet does not reduce words to their base forms, so a
 * telling is tried as a doing ("losing your job") and as its base ("lose your job"), the
 * speaker's "my" being anyone's "your", and then without what the doing was done to.
 *
 * ConceptNet 5.7 is CC BY-SA 4.0: every relation taken is sourced from one import stamp per
 * event, `ConceptNet Imported("losing your job", version=, license=)`, so the share-alike
 * part of a graph stays separable (src/seed/grounding/layer.ts). A graph grounded from the
 * dump already holds what it took, and is read before anything is fetched.
 */
import nlp from "compromise";
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";
import { words } from "../runtime/host.js";

type Fetch = (url: string) => Promise<unknown>;

/** What an event leads to: what it causes, what it makes one want, what happens in it, what it takes, what it is done for. */
export const FOLLOWS = ["Causes", "CausesDesire", "HasSubevent", "HasFirstSubevent", "HasLastSubevent", "HasPrerequisite", "MotivatedByGoal", "Entails"] as const;
const FOLLOWING: ReadonlySet<string> = new Set(FOLLOWS);

/** Enough to say something, few enough that what is said is the strongest of it. */
const PER_RELATION = 3;
/** Lookups for one message, at most: ConceptNet asks for no more than one a second. */
const LOOKUPS = 4;

const API = "https://api.conceptnet.io/query?";
const VERSION = "5.7";
const LICENSE = "CC BY-SA 4.0";

let last = 0;
const defaultFetch: Fetch = async (url) => {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`ConceptNet ${response.status}`);
  return response.json();
};

interface Edge {
  rel?: { label?: string };
  start?: { label?: string; language?: string; term?: string };
  end?: { label?: string; language?: string; term?: string };
  weight?: number;
}

/** The ConceptNet node for words: lower case, "_" between words. */
const node = (term: string): string => `/c/en/${term.toLowerCase().trim().replace(/\s+/g, "_")}`;

/** Whether this event was looked up before, found or not: it is not fetched again. */
export function lookedUp(store: ConceptStore, term: string): boolean {
  return store.asSubject("ConceptNet").some((t) => t.predicate === "Imported" && lookedTerm(t.expr) === term);
}

function lookedTerm(expr: Expr): string | undefined {
  if (!isCall(expr) || expr.head !== "Imported") return undefined;
  const v = expr.args[0]?.value;
  return typeof v === "string" ? v : undefined;
}

/** What the graph holds of what follows from an event, by its name. */
export function follows(store: ConceptStore, identity: string): Expr[] {
  return (store.get(identity)?.relations ?? [])
    .filter((r) => r.context === undefined && isCall(r.claim) && FOLLOWING.has(r.claim.head) && !store.retracted(identity, r.claim))
    .map((r) => r.claim);
}

/**
 * Look an event up in ConceptNet and keep what follows from it. What was kept; empty when
 * ConceptNet has nothing (that is kept too, as the stamp, so it is not asked again).
 */
export async function groundInConceptNet(
  store: ConceptStore,
  term: string,
  options: { fetch?: Fetch; cause?: number } = {},
): Promise<Expr[]> {
  const identity = nameOf(term);
  if (!identity) return [];
  const held = follows(store, identity);
  if (held.length || lookedUp(store, term)) return held;
  const get = options.fetch ?? defaultFetch;
  const body = (await get(API + new URLSearchParams({ start: node(term), limit: "300" }))) as { edges?: Edge[] };
  const imported = store.addRelation(
    "ConceptNet",
    call("Imported", [{ value: term }, { name: "version", value: VERSION }, { name: "license", value: LICENSE }]),
    undefined,
    options.cause,
  );
  const byRelation = new Map<string, { label: string; weight: number }[]>();
  for (const e of body.edges ?? []) {
    const relation = e.rel?.label;
    const label = e.end?.label?.trim();
    if (!relation || !FOLLOWING.has(relation) || !label || e.end?.language !== "en" || e.start?.language !== "en") continue;
    if ((e.weight ?? 0) < 1) continue;
    const list = byRelation.get(relation) ?? [];
    if (!list.some((x) => x.label.toLowerCase() === label.toLowerCase())) list.push({ label, weight: e.weight ?? 1 });
    byRelation.set(relation, list);
  }
  const kept: Expr[] = [];
  for (const [relation, list] of byRelation) {
    for (const { label } of list.sort((a, b) => b.weight - a.weight).slice(0, PER_RELATION)) {
      const target = nameOf(label);
      if (!target || !/^[A-Z]/.test(target) || target === identity) continue;
      const claim = c(relation, c(target));
      // Its words are its name's: FindANewJob is said "find a new job".
      store.addRelation(identity, claim, undefined, imported.seq);
      kept.push(claim);
    }
  }
  return kept;
}

/**
 * The ways a message tells of an event, as ConceptNet would name it, most particular first:
 * "I lost my job" is "losing your job", "lose your job", then "losing", "lose". What is said
 * is read by the tagger: the doing (with its particle, "break down"), and what it was done to.
 */
export function eventsOf(message: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  const doc = nlp(message);
  const verbs = doc.verbs();
  const said = words(message);
  const forms = verbs.conjugate() as { Infinitive?: string; Gerund?: string }[];
  const phrases = verbs.out("array") as string[];
  for (const [i, f] of forms.entries()) {
    const base = f.Infinitive;
    if (!base) continue;
    // A copula says what something is: "i am sad" is being sad.
    const being = base === "be";
    const gerund = f.Gerund ?? base;
    // What the doing was done to: the words after it, up to the end of what it governs.
    const after = objectAfter(said, phrases[i] ?? "");
    if (after) {
      add(`${gerund} ${after}`);
      add(`${base} ${after}`);
      if (being) add(after);
      const bare = after.split(" ").filter((w) => w !== "your" && w !== "a" && w !== "the").join(" ");
      if (bare && bare !== after) {
        add(`${gerund} ${bare}`);
        add(`${base} ${bare}`);
      }
    }
    if (!being) {
      add(gerund);
      add(base);
    }
  }
  return out;
}

/** The words after a doing that say what it was done to: "my job" after "lost" ("your job", as anyone says it). */
function objectAfter(said: ReturnType<typeof words>, phrase: string): string {
  const last = phrase.toLowerCase().split(/\s+/).filter(Boolean).pop();
  if (!last) return "";
  const at = said.findIndex((w) => w.text.toLowerCase() === last || w.typed.toLowerCase() === last);
  if (at < 0) return "";
  const out: string[] = [];
  for (const w of said.slice(at + 1)) {
    if (w.sentence !== said[at].sentence) break;
    const tags = new Set(w.tags);
    if (tags.has("Possessive")) {
      out.push("your");
      continue;
    }
    if (tags.has("Determiner")) {
      out.push(w.text.toLowerCase());
      continue;
    }
    if (tags.has("Adjective") || (tags.has("Noun") && !tags.has("Pronoun") && !tags.has("Date"))) {
      out.push(w.text.toLowerCase());
      continue;
    }
    break;
  }
  // Only a determiner or "your" is not a thing.
  return out.some((w) => w !== "your" && w !== "a" && w !== "the" && w !== "an") ? out.join(" ") : "";
}

export interface Followed {
  /** The event's name in the graph, and its words. */
  readonly identity: string;
  readonly term: string;
  readonly relations: Expr[];
  /** Events fetched for this message. */
  readonly looked: string[];
}

/**
 * The first way the message tells of an event that the graph, or ConceptNet when it may be
 * asked, knows what follows from. Undefined when none is known.
 */
export async function whatFollows(
  store: ConceptStore,
  message: string,
  options: { lookup?: boolean; fetch?: Fetch; cause?: number } = {},
): Promise<Followed | undefined> {
  const looked: string[] = [];
  for (const term of eventsOf(message)) {
    const identity = nameOf(term);
    if (!identity) continue;
    let relations = follows(store, identity);
    if (!relations.length && options.lookup && !lookedUp(store, term) && looked.length < LOOKUPS) {
      looked.push(term);
      relations = await groundInConceptNet(store, term, options).catch(() => []);
    }
    if (relations.length) return { identity, term, relations, looked };
  }
  return undefined;
}
