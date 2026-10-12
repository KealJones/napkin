/**
 * What a word could mean, read off the graph: its senses.
 *
 * A word is not given a role by where it stands. Each sense says what it is (a value, a thing the
 * graph holds facts of, a kind of thing, a relation, a computation with holes, a question word, a
 * word that only helps say the others) and, where it has holes, what it expects of its neighbours.
 * Which sense is meant is decided later, by which reading of the whole message fills the most
 * holes and leaves no word unused (frame/frames.ts).
 *
 * Every test here is a relation in the graph: IsA, SynonymOf, HeardAs, Called, Spelled, Binds,
 * MarksFirst, Asks, and what the store holds as facts. No word is named.
 */
import { type Call, type Expr, c, isCall, isVariable, walk } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma } from "../runtime/host.js";
import { runs } from "../runtime/select.js";
import { typesOf } from "../runtime/types.js";
import type { ConceptStore } from "../store/store.js";

export type Sense =
  | { readonly type: "value"; readonly value: Expr }
  | { readonly type: "op"; readonly word: string; readonly target: string; readonly holes: readonly string[]; readonly binds: number; readonly right: boolean }
  | { readonly type: "entity"; readonly head: string }
  | { readonly type: "kind"; readonly head: string }
  | { readonly type: "relation"; readonly head: string }
  | { readonly type: "question"; readonly head: string; readonly asks: readonly string[]; readonly kinds: readonly string[] }
  | { readonly type: "pointer"; readonly head: string }
  /** A word that says whose: "my" is the user's, "tom's" Tom's. */
  | { readonly type: "owner"; readonly head: string }
  /** A word whose hole is a whole statement: "remember (that) ...". */
  | { readonly type: "takes"; readonly head: string; readonly what: string; readonly reports: boolean }
  | { readonly type: "glue"; readonly head: string; readonly marksFirst: boolean; readonly copula: boolean };

/** Relations that say what a thing is or how it is said, not a fact asked for by name. */
export const STRUCTURAL = new Set([
  "IsA", "SubclassOf", "SynonymOf", "HeardAs", "Named", "Called", "SameAs", "WrittenAs", "NotWrittenAs", "ReadBeside",
  "Said", "Asks", "Spelled", "Binds", "MarksFirst", "Relation", "Requires", "Symmetric", "Transitive", "InverseOf",
  "Retracts", "Refers", "PointsAt", "Takes", "Means", "AnsweredBy", "Reports",
]);
/** Kinds of word that only help say the others: they fill no hole and need none filled. */
const GLUE = ["Helper", "Determiner", "Preposition", "Conjunction"];

export const wordsOf = (name: string): string[] => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Two words of a piece: the same, the same base form, or sharing their first five letters ("directed", "director"). */
export const akin = (a: string, b: string): boolean => a === b || lemma(a) === lemma(b) || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

const relationsOf = (store: ConceptStore, id: string) => store.get(id)?.relations ?? [];
const claimed = (store: ConceptStore, id: string, head: string): Expr[] =>
  relationsOf(store, id).flatMap((r) => (isCall(r.claim) && r.claim.head === head ? r.claim.args.map((a) => a.value) : []));

/** What a Concept is called besides its name, as words: the heads inside its Called(...) relations. */
export function called(store: ConceptStore, id: string): string[] {
  return claimed(store, id, "Called").flatMap((e) => [...walk(e)].flatMap((n) => (isCall(n) ? wordsOf(n.head) : [])));
}

/** The Concept a word is a word for, followed through SynonymOf and HeardAs: Divided is Over is Divide. */
function chain(store: ConceptStore, head: string): string[] {
  const out = [head];
  for (let hop = 0; hop < 4; hop++) {
    const next = [...claimed(store, out[out.length - 1], "SynonymOf"), ...claimed(store, out[out.length - 1], "HeardAs")].find((x) => isCall(x) && !out.includes(x.head));
    if (next === undefined || !isCall(next)) break;
    out.push(next.head);
  }
  return out;
}

const holesOf = (r: Realization): string[] | undefined => {
  if (!isCall(r.pattern)) return undefined;
  const out: string[] = [];
  for (const a of r.pattern.args) {
    if (a.name !== undefined || !isVariable(a.value)) return undefined;
    out.push(a.value.variable);
  }
  return out;
};
const typeOf = (r: Realization, variable: string): string | undefined => {
  const t = r.types !== undefined && isCall(r.types) ? r.types.args.find((a) => a.name === variable)?.value : undefined;
  return t !== undefined && isCall(t) && !t.args.length ? t.head : undefined;
};

/** A computation the word stands for: a realization that runs, with every hole typed by a plain kind. */
function operation(store: ConceptStore, word: string): Sense | undefined {
  const heads = chain(store, word);
  for (const target of heads) {
    for (const r of store.get(target)?.realizations ?? []) {
      if (r.retired || !runs(r) || !isCall(r.pattern) || r.pattern.head !== target) continue;
      const holes = holesOf(r);
      // Holes typed by a plain kind; a computation declared a Program may leave them untyped,
      // and then takes any value (Add checks its own).
      const program = r.properties.some((p) => isCall(p) && p.head === "Program");
      const kinds = holes?.map((h) => typeOf(r, h) ?? (program ? "Concept" : undefined));
      if (!holes || holes.length !== 2 || !kinds?.every((k): k is string => k !== undefined)) continue;
      // How tightly it binds what is beside it, where the graph says (Binds(120) on Times).
      const binds = heads.flatMap((h) => claimed(store, h, "Binds")).find((x) => typeof x === "number");
      const right = heads.some((h) => relationsOf(store, h).some((rel) => isCall(rel.claim) && rel.claim.head === "Binds" && rel.claim.args.some((a) => isCall(a.value) && a.value.head === "Right")));
      return { type: "op", word, target, holes: kinds, binds: typeof binds === "number" ? binds : 100, right };
    }
  }
  return undefined;
}

interface Index {
  readonly version: number;
  /** Word to the relations it names or that are called by it. */
  readonly relations: Map<string, Set<string>>;
  /** Word to the kinds it names or that are called by it. */
  readonly kinds: Map<string, Set<string>>;
  readonly predicates: Set<string>;
}
const indexes = new WeakMap<ConceptStore, Index>();

/** Which Concepts are relations (used to hold facts) and which are kinds (things are of them), by every word for each. */
function index(store: ConceptStore): Index {
  const known = indexes.get(store);
  if (known && known.version === store.version) return known;
  const predicates = new Set<string>();
  const kindsHeld = new Set<string>();
  for (const t of store.triples()) {
    // A relation held only in a context (GlobalName in Code(Python())) is not a word's sense in talk.
    if (!STRUCTURAL.has(t.predicate) && t.context === undefined) predicates.add(t.predicate);
    if ((t.predicate === "IsA" || t.predicate === "SubclassOf") && isCall(t.object ?? null)) kindsHeld.add((t.object as Call).head);
  }
  // A word that only helps say a name ("by" in "directed by") does not name it.
  const glue = (w: string) => typesOf(store, c(nameOf(w))).some((k) => GLUE.includes(k));
  const by = (ids: Iterable<string>) => {
    const m = new Map<string, Set<string>>();
    for (const id of ids) for (const w of new Set([...wordsOf(id), ...called(store, id)])) if (!glue(w)) m.set(w, (m.get(w) ?? new Set()).add(id));
    return m;
  };
  const built = { version: store.version, relations: by(predicates), kinds: by(kindsHeld), predicates };
  indexes.set(store, built);
  return built;
}

/** Whether the graph holds facts of this thing, either way round. */
export const holdsFacts = (store: ConceptStore, id: string): boolean =>
  relationsOf(store, id).some((r) => isCall(r.claim) && !STRUCTURAL.has(r.claim.head) && r.claim.args.length > 0) ||
  store.asObject(id).some((t) => !STRUCTURAL.has(t.predicate));

/**
 * Every sense of one word. `number` turns a number word into its value (the graph's Number
 * realization does this); it is passed in because it evaluates.
 */
export async function sensesOf(store: ConceptStore, word: string, number: (word: string) => Promise<number | undefined>): Promise<Sense[]> {
  if (/^-?\d+(\.\d+)?$/.test(word)) return [{ type: "value", value: Number(word) }];
  const out: Sense[] = [];
  // A symbol is the Concept spelled that way: "*" is Times.
  if (!/[a-z0-9]/i.test(word)) {
    for (const m of store.mentioning(word)) {
      if (isCall(m.relation.claim) && m.relation.claim.head === "Spelled") {
        const op = operation(store, m.identity);
        if (op) out.push(op);
      }
    }
    return out;
  }
  const lower = word.toLowerCase();
  const name = nameOf(word);
  const base = nameOf(lemma(lower));
  // The word's own Concept, or its base form's when it has none ("movies" is Movie; "times" stays Times).
  // A thing named only as what a fact is of ("ann", in Tom's TallerThan(Ann())) is a thing too.
  const heads = store.has(name) || store.asObject(name).length ? [name] : store.has(base) ? [base] : [];
  for (const head of heads) {
    const kinds = typesOf(store, c(head));
    if (kinds.includes("Interrogative")) {
      const asked = chain(store, head).flatMap((h) => claimed(store, h, "Asks")).flatMap((k) => (isCall(k) ? [k.head] : []));
      out.push({ type: "question", head, asks: asked.flatMap(wordsOf), kinds: asked });
      continue;
    }
    if (kinds.includes("Pointing")) out.push({ type: "pointer", head });
    // A word that refers to someone: "my" says whose (an owner), "I" and "me" are who.
    const refers = [...claimed(store, head, "Refers"), ...claimed(store, head, "HeardAs")].find((x) => isCall(x));
    if (refers !== undefined && isCall(refers)) {
      if (kinds.includes("Possessive")) out.push({ type: "owner", head: refers.head });
      else if (kinds.includes("Pronoun") || kinds.includes("Deictic")) out.push({ type: "entity", head: refers.head });
    }
    const takes = claimed(store, head, "Takes").find((x) => isCall(x));
    if (takes !== undefined && isCall(takes)) out.push({ type: "takes", head, what: takes.head, reports: relationsOf(store, head).some((r) => isCall(r.claim) && r.claim.head === "Reports") });
    if (GLUE.some((g) => kinds.includes(g))) {
      out.push({ type: "glue", head, marksFirst: relationsOf(store, head).some((r) => isCall(r.claim) && r.claim.head === "MarksFirst"), copula: kinds.includes("Helper") });
    }
    const op = operation(store, head);
    if (op) out.push(op);
    if (holdsFacts(store, head)) out.push({ type: "entity", head });
  }
  const at = index(store);
  for (const w of new Set([lower, lemma(lower)])) {
    for (const r of at.relations.get(w) ?? []) if (!out.some((s) => s.type === "relation" && s.head === r)) out.push({ type: "relation", head: r });
    for (const k of at.kinds.get(w) ?? []) if (!out.some((s) => s.type === "kind" && s.head === k)) out.push({ type: "kind", head: k });
  }
  // A relation named by a word akin to this one ("directed" and Director).
  if (lower.length >= 5) {
    for (const p of at.predicates) if (wordsOf(p).some((pw) => akin(pw, lower)) && !out.some((s) => s.type === "relation" && s.head === p)) out.push({ type: "relation", head: p });
  }
  if (!out.some((s) => s.type === "value")) {
    const n = await number(lower);
    if (n !== undefined) out.push({ type: "value", value: n });
  }
  return out;
}
