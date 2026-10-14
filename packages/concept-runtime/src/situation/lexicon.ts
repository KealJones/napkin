/**
 * What the words of a situation do, read from the graph rather than written here: "older" compares
 * upward (`Older Compares(Up())`), "discount" changes downward (`Discount Changes(Down())`),
 * "twelve" counts as 12, "twice" multiplies by 2, "third" divides by 3, a minute measures time,
 * "every morning" counts per day, "original" marks what was before, "people" is the plural of
 * person (packs/quantities.ncon). A word the graph holds nothing of does nothing, and once its
 * facts are learned it works in every situation, like any other Concept.
 */
import { isCall } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";

export interface Lexicon {
  /** +1 for a word that says more than ("older", "more"), -1 for less than ("younger", "fewer"). */
  compares(word: string): number;
  /** +1 for a word that says a share is added ("tax", "markup"), -1 taken off ("discount", "off"). */
  changes(word: string): number;
  /** The number a word counts as: "twelve" 12. */
  count(word: string): number | undefined;
  /** What a word multiplies by: "twice" 2, "half" 0.5. */
  times(word: string): number | undefined;
  /** What a share's word divides by: "third" 3, "quarters" 4. */
  parts(word: string): number | undefined;
  /** What a unit measures: "minute" Time, "mile" Length, "dollar" Money. */
  measures(unit: string): string | undefined;
  /** What a word counts per: "morning" and "daily" are per day. */
  per(word: string): string | undefined;
  /** Whether a word marks something: "original" Before, "rest" Remaining, "price" Money. */
  marks(word: string, what: string): boolean;
  /** How the word is said of more than one, when not by its ending: "person" people. */
  plural(word: string): string | undefined;
  /** The word a written form stands for: "feet" foot, "bucks" dollar. */
  synonym(word: string): string | undefined;
  /** What a doing does to what it is done with: -1 takes away (`Removes()`), +1 adds (`Adds()`). */
  effect(verb: string): number;
  /** What a doing does to money it is done with, when known apart from things ("sells" adds money). */
  effectOnMoney(verb: string): number | undefined;
  /**
   * Supposes a fact of a word for this reading, over what the graph holds (undefined: supposes it
   * has none). How a word is learned from worked examples: each way it could act is supposed, and
   * the one the answer bears out is kept.
   */
  suppose(word: string, predicate: string, value: unknown): void;
  /** Takes back every supposition. */
  unsuppose(): void;
  /** Reads the graph without these relations, as if they were never known (to learn them again). */
  forget(predicates: readonly string[]): void;
}

/** A word's forms to look it up by: as said, its base, a plural's singular. */
export const formsOf = (word: string): string[] => {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  return [...new Set([w, lemma(w), ...(w.length > 4 && /[^s]s$/.test(w) ? [w.slice(0, -1)] : [])].filter((x) => x.length > 0))];
};
/** A doing's forms: its base, or the past ending taken off ("used" use, "stopped" stop, "carried" carry). */
export const doingForms = (verb: string): string[] => {
  const w = verb.toLowerCase().replace(/[^a-z]/g, "");
  return [...new Set([w, lemma(w), w.replace(/d$/, ""), w.replace(/ed$/, ""), w.replace(/([b-df-hj-np-tv-z])\1ed$/, "$1"), w.replace(/ied$/, "y")].filter((x) => x.length > 1))];
};

const lexicons = new WeakMap<ConceptStore, Lexicon>();

export function lexicon(store: ConceptStore): Lexicon {
  const had = lexicons.get(store);
  if (had) return had;
  const cache = new Map<string, readonly { predicate: string; value: unknown }[]>();
  const supposed = new Map<string, Map<string, unknown>>();
  let forgotten = new Set<string>();
  // A word's facts, as said and as its base ("increased" increase, "quarters" quarter).
  const facts = (word: string) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    let got = cache.get(w);
    if (got) return got;
    got = formsOf(w).flatMap((f) =>
      store.asSubject(nameOf(f)).map((t) => {
        const a = isCall(t.expr) ? t.expr.args[0]?.value : undefined;
        return { predicate: t.predicate, value: a !== undefined && isCall(a) ? a.head : a };
      }),
    );
    cache.set(w, got);
    return got;
  };
  const first = (word: string, predicate: string, forms = formsOf(word)) => {
    for (const f of forms) {
      const s = supposed.get(f);
      if (s?.has(predicate)) return s.get(predicate);
    }
    if (forgotten.has(predicate)) return undefined;
    return forms.flatMap((f) => facts(f)).find((x) => x.predicate === predicate)?.value;
  };
  const way = (v: unknown) => (v === "Up" ? 1 : v === "Down" ? -1 : 0);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const lex: Lexicon = {
    compares: (w) => way(first(w, "Compares")),
    changes: (w) => way(first(w, "Changes")),
    count: (w) => num(first(w, "CountsAs")),
    times: (w) => num(first(w, "Multiplies")),
    parts: (w) => num(first(w, "DividesBy")),
    measures: (u) => {
      const v = first(u, "Measures");
      return typeof v === "string" ? v : undefined;
    },
    per: (w) => {
      const v = first(w, "CountsPer");
      return typeof v === "string" ? v.toLowerCase() : undefined;
    },
    marks: (w, what) => facts(w).some((f) => f.predicate === "Marks" && f.value === what),
    plural: (w) => {
      const v = first(w, "PluralForm");
      return typeof v === "string" ? v : undefined;
    },
    synonym: (w) => {
      const v = store.asSubject(nameOf(w.toLowerCase().replace(/[^a-z]/g, ""))).find((t) => t.predicate === "SynonymOf");
      const to = v && isCall(v.expr) ? v.expr.args[0]?.value : undefined;
      return to !== undefined && isCall(to) ? to.head.toLowerCase() : undefined;
    },
    effect: (verb) => {
      const forms = doingForms(verb);
      if (forms.some((f) => supposed.get(f)?.has("Effect"))) return way(first(verb, "Effect", forms));
      if (forgotten.has("Removes")) return 0;
      for (const f of forms) {
        const facts = store.asSubject(nameOf(f)).map((t) => t.predicate);
        if (facts.includes("Removes")) return -1;
        if (facts.includes("Adds")) return 1;
      }
      return 0;
    },
    effectOnMoney: (verb) => {
      const forms = doingForms(verb);
      const v = forms.map((f) => supposed.get(f)?.get("EffectOnMoney")).find((x) => x !== undefined);
      return v === undefined ? undefined : way(v);
    },
    suppose: (word, predicate, value) => {
      for (const w of predicate.startsWith("Effect") ? doingForms(word) : formsOf(word)) {
        const s = supposed.get(w) ?? new Map<string, unknown>();
        s.set(predicate, value);
        supposed.set(w, s);
      }
    },
    unsuppose: () => supposed.clear(),
    forget: (predicates) => {
      forgotten = new Set(predicates);
    },
  };
  lexicons.set(store, lex);
  return lex;
}
