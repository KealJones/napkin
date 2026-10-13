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
}

const lexicons = new WeakMap<ConceptStore, Lexicon>();

export function lexicon(store: ConceptStore): Lexicon {
  const had = lexicons.get(store);
  if (had) return had;
  const cache = new Map<string, readonly { predicate: string; value: unknown }[]>();
  // A word's facts, as said and as its base ("increased" increase, "quarters" quarter).
  const facts = (word: string) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    let got = cache.get(w);
    if (got) return got;
    const forms = new Set([w, lemma(w), ...(w.length > 4 && /[^s]s$/.test(w) ? [w.slice(0, -1)] : [])].filter((x) => x.length > 0));
    got = [...forms].flatMap((f) =>
      store.asSubject(nameOf(f)).map((t) => {
        const a = isCall(t.expr) ? t.expr.args[0]?.value : undefined;
        return { predicate: t.predicate, value: a !== undefined && isCall(a) ? a.head : a };
      }),
    );
    cache.set(w, got);
    return got;
  };
  const first = (word: string, predicate: string) => facts(word).find((f) => f.predicate === predicate)?.value;
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
  };
  lexicons.set(store, lex);
  return lex;
}
