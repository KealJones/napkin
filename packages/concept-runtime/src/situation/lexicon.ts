/**
 * What the words of a situation do, read from the graph rather than written here: "older" compares
 * upward (`Older Compares(Up())`), "discount" changes downward (`Discount Changes(Down())`),
 * "twelve" counts as 12, "twice" multiplies by 2, "third" divides by 3, a minute measures time,
 * "every morning" counts per day, "original" marks what was before, "people" is the plural of
 * person (packs/quantities.ncon). A word the graph holds nothing of does nothing, and once its
 * facts are learned it works in every situation, like any other Concept.
 */
import { isCall, type Expr } from "../concept/expression.js";
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
  // A number said as a word: SynonymOf(Number(n)) on its Concept.
  const valueOf = (word: string): number | undefined => {
    for (const f of formsOf(word)) {
      for (const t of store.asSubject(nameOf(f))) {
        if (t.predicate !== "SynonymOf" || !isCall(t.expr)) continue;
        const v = t.expr.args[0]?.value;
        if (v !== undefined && isCall(v) && v.head === "Number" && typeof v.args[0]?.value === "number") return v.args[0].value;
      }
    }
    return undefined;
  };
  // What a word does to what it is said of, from its definition: Half($x) is Divide($x, 2), so it
  // takes 0.5 of it; Twice is MultiplyValues(x, 2). A synonym's definition counts (Halves, Half).
  const factors = new Map<string, number | undefined>();
  const factorOf = (word: string): number | undefined => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (factors.has(w)) return factors.get(w);
    let found: number | undefined;
    // The factor is what multiplies or divides the word's own argument, or a value bound straight
    // from it (Twice binds x2 to AsNumber(x)); arithmetic deeper in, on other values, is not it.
    const variable = (e: unknown): string | undefined => (e && typeof e === "object" && "variable" in (e as object) ? String((e as { variable: unknown }).variable) : undefined);
    const look = (e: Expr | undefined, own: Set<string>, depth: number): number | undefined => {
      if (e === undefined || !isCall(e) || depth > 6) return undefined;
      if (e.head === "Bind" && e.args.length >= 3) {
        const name = variable(e.args[0]?.value);
        const from = e.args[1]?.value;
        const fromOwn = from !== undefined && isCall(from) && from.args.length === 1 && own.has(variable(from.args[0]?.value) ?? "");
        return look(e.args[2]?.value as Expr, name && fromOwn ? new Set([...own, name]) : own, depth + 1);
      }
      if (e.args.length === 2) {
        const [a, b] = e.args.map((x) => x.value);
        const literal = typeof b === "number" && own.has(variable(a) ?? "") ? b : undefined;
        if (literal !== undefined && /^Multiply/.test(e.head)) return literal;
        if (literal !== undefined && /^Divide/.test(e.head) && literal !== 0) return 1 / literal;
      }
      for (const a of e.args) {
        const got = look(a.value as Expr, own, depth + 1);
        if (got !== undefined) return got;
      }
      return undefined;
    };
    for (const f of formsOf(w)) {
      const id = nameOf(f);
      const targets = [id, ...store.asSubject(id).filter((t) => t.predicate === "SynonymOf" && isCall(t.expr)).map((t) => (isCall(t.expr) ? t.expr.args[0]?.value : undefined)).filter((v): v is Expr => v !== undefined && isCall(v) && !v.args.length).map((v) => (isCall(v) ? v.head : ""))];
      for (const t of targets) {
        for (const r of store.get(t)?.realizations ?? []) {
          if (r.retired || !isCall(r.pattern) || r.pattern.args.length !== 1) continue;
          const arg = variable(r.pattern.args[0]?.value);
          if (!arg) continue;
          found = look(r.body, new Set([arg]), 0);
          if (found !== undefined) break;
        }
        if (found !== undefined) break;
      }
      if (found !== undefined) break;
    }
    factors.set(w, found);
    return found;
  };
  // A word's forms: as said, its base, a plural's singular, a past's base ("increased" increase).
  const allForms = (word: string) => [...new Set([...formsOf(word), ...doingForms(word)])];
  const first = (word: string, predicate: string, forms = allForms(word)) => {
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
    count: (w) => {
      // "eight" SynonymOf(Number(8)), or supposed so while learning.
      for (const f of formsOf(w)) {
        const s = supposed.get(f);
        if (s?.has("Number")) return num(s.get("Number"));
      }
      if (forgotten.has("Number")) return undefined;
      return valueOf(w);
    },
    times: (w) => factorOf(w),
    parts: (w) => {
      const f = factorOf(w);
      return f !== undefined && f > 0 && f < 1 ? Math.round(1 / f) : undefined;
    },
    measures: (u) => {
      // What it measures: Measures(Time()); a unit known by what it is a unit of (IsA(UnitOfTime()),
      // as Wikidata says it, IsA(Currency())) the same.
      const m = first(u, "Measures");
      if (typeof m === "string") return m;
      const kind = facts(u).find((x) => x.predicate === "IsA" && typeof x.value === "string" && (/^UnitOf/.test(x.value) || x.value === "Currency"))?.value as string | undefined;
      return kind === "Currency" ? "Money" : kind?.replace(/^UnitOf/, "");
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
      // Removes() / Adds(): what it does to what it is done with (Adds(Money()) is to money, apart).
      for (const f of forms) {
        const facts = store.asSubject(nameOf(f)).filter((t) => isCall(t.expr) && !t.expr.args.length).map((t) => t.predicate);
        if (facts.includes("Removes")) return -1;
        if (facts.includes("Adds")) return 1;
      }
      return 0;
    },
    effectOnMoney: (verb) => {
      const forms = doingForms(verb);
      const v = forms.map((f) => supposed.get(f)?.get("EffectOnMoney")).find((x) => x !== undefined);
      if (v !== undefined) return way(v);
      if (forgotten.has("Removes")) return undefined;
      // Adds(Money()): selling brings money in, whatever it does to what is sold.
      for (const f of forms) {
        for (const t of store.asSubject(nameOf(f))) {
          const a = isCall(t.expr) ? t.expr.args[0]?.value : undefined;
          if (a === undefined || !isCall(a) || a.head !== "Money") continue;
          if (t.predicate === "Removes") return -1;
          if (t.predicate === "Adds") return 1;
        }
      }
      return undefined;
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
