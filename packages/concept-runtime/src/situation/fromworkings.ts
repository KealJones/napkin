/**
 * What words mean, learned from worked examples (a question beside its working), kept as ordinary
 * facts on each word's Concept, so everything that reads the graph has them, not only situations:
 *
 * - what a doing does to what it is done with: `Removes()` / `Adds()`, and to money apart
 *   (`Adds(Money())`: selling takes away what is sold and brings money in);
 * - what a comparing or changing word says: `Compares(Up())`, `Changes(Down())`;
 * - a word that stands for a number it never writes: `SynonymOf(Number(8))`.
 *
 * The evidence is general (learn/associate.ts): which way each word's amounts went in the working,
 * weighed against how often anything goes that way; which numbers a working used that its question
 * never wrote, against how often each number is used at all. Nothing names a word.
 */
import { c, call, isCall, type Call } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";
import { Associations, Directions } from "../learn/associate.js";
import { lexicon, type Lexicon } from "./lexicon.js";
import { votes } from "./worked.js";

export interface WorkedExample {
  readonly question: string;
  /** The working, its steps as <<expression=result>> (as GSM8K writes them). */
  readonly working: string;
}

export interface Learned {
  readonly word: string;
  readonly claim: Call;
  /** Examples for it and against it. */
  readonly for: number;
  readonly against: number;
}

export interface LearnOptions {
  /** How far from the base rate a doing's evidence must be, in standard errors. */
  readonly z?: number;
  /** How many times one way must outnumber the other for a comparing or changing word. */
  readonly ratio?: number;
  /** Least examples for anything. */
  readonly least?: number;
  /** Least lift for a number a word carries. */
  readonly lift?: number;
}

// "%" is said as "percent": it carries the 100 a working divides by as much as the word does.
const wordsOf = (text: string): string[] => (text.toLowerCase().replace(/%/g, " percent ").match(/[a-z]+/g) ?? []).map((w) => lemma(w) || w);
const numbersIn = (text: string): number[] => (text.replace(/,(\d{3})/g, "$1").match(/\d*\.?\d+/g) ?? []).map(Number);

/** The steps of a working: each expression and what it came to. */
const stepsOf = (working: string) => [...working.matchAll(/<<([^=>]+)=([^>]+)>>/g)].map((m) => ({ expr: m[1]!.replace(/\s+/g, ""), result: Number(m[2]) }));

export function learnFromWorkings(store: ConceptStore, examples: readonly WorkedExample[], options: LearnOptions = {}): Learned[] {
  const lex = lexicon(store);
  const ways = new Directions();
  const carried = new Associations<string, number>();
  // How often a word comes right after a number: a unit ("5 minutes"), not a number of its own.
  const afterNumber = new Map<string, [number, number]>();
  // How each number is used where each word is said: as what divides (x / 3), or otherwise.
  const usedAs = new Map<string, Map<number, { divides: number; other: number }>>();
  // Whether the tagger takes the word for a number where it is said ("eight apples").
  const valued = new Map<string, [number, number]>();
  // How often each number divides at all, and how often each word is said: what a word's dividing is weighed against.
  const dividing = new Map<number, number>();
  const seen = new Map<string, number>();
  // Each example's words, to tell a word that carries a number from one only said beside the one that does.
  const questionWords: Set<string>[] = [];
  const carriedIn: Set<number>[] = [];
  for (const x of examples) {
    for (const g of votes(lex, x.question, x.working)) if (g.value !== "None") ways.add(lemma(g.word) || g.word, g.predicate, g.value);
    const steps = stepsOf(x.working);
    const results = new Set(steps.map((s) => s.result));
    const said = new Set(numbersIn(x.question));
    const unsaid = steps.flatMap((s) => numbersIn(s.expr)).filter((n) => !results.has(n) && !said.has(n) && n !== 0 && n !== 1);
    carried.observe(wordsOf(x.question), unsaid);
    const divisors = new Set(steps.flatMap((st) => [...st.expr.matchAll(/\/\(?(\d*\.?\d+)/g)].map((m) => Number(m[1]))));
    for (const n of new Set(unsaid)) if (divisors.has(n)) dividing.set(n, (dividing.get(n) ?? 0) + 1);
    for (const w of new Set(wordsOf(x.question))) seen.set(w, (seen.get(w) ?? 0) + 1);
    questionWords.push(new Set(wordsOf(x.question)));
    carriedIn.push(new Set(unsaid));
    for (const w of new Set(wordsOf(x.question))) {
      const m = usedAs.get(w) ?? new Map<number, { divides: number; other: number }>();
      for (const n of new Set(unsaid)) {
        const u = m.get(n) ?? { divides: 0, other: 0 };
        if (divisors.has(n)) u.divides++;
        else u.other++;
        m.set(n, u);
      }
      usedAs.set(w, m);
    }
    for (const t of hostWords(x.question)) {
      const l = lemma(t.text.toLowerCase().replace(/[^a-z]/g, "")) || t.text.toLowerCase();
      const v = valued.get(l) ?? [0, 0];
      v[0]++;
      if (t.tags.includes("Value")) v[1]++;
      valued.set(l, v);
    }
    const raw = x.question.toLowerCase().match(/\d[\d,.]*|[a-z]+/g) ?? [];
    raw.forEach((w, i) => {
      if (/\d/.test(w)) return;
      const l = lemma(w) || w;
      const a = afterNumber.get(l) ?? [0, 0];
      a[0]++;
      if (/\d/.test(raw[i - 1] ?? "")) a[1]++;
      afterNumber.set(l, a);
    });
  }
  const out: Learned[] = [];
  const least = options.least ?? 3;
  for (const group of ["Effect", "EffectOnMoney"]) {
    for (const d of ways.decided(group, { by: "base", z: options.z ?? 3, least })) {
      const money = group === "EffectOnMoney" ? [{ value: c("Money") }] : [];
      out.push({ word: d.key, claim: call(d.way === "Down" ? "Removes" : "Adds", money), for: d.for, against: d.against });
    }
  }
  for (const group of ["Compares", "Changes"]) {
    for (const d of ways.decided(group, { by: "majority", ratio: options.ratio ?? 3, least })) out.push({ word: d.key, claim: call(group, [{ value: c(d.way) }]), for: d.for, against: d.against });
  }
  // A word that stands where a number would ("eight apples"; seldom after a number, as a unit is)
  // and comes with a number its question never wrote is that number.
  // A word is a number when its working uses that number most times the word is said (eight: 84%);
  // a number that only often goes with it ("daily" 7, 34%) is not what the word is.
  // What it carries is said by how the working uses it: a share divides ("two-thirds of 30" is
  // 30 x 2 / 3: "thirds" DividesBy(3)); a number the tagger takes for one is that number ("eight");
  // any other word multiplies by it ("thrice", "triple": Multiplies(3)).
  const kept = carried.kept({ least: Math.max(least, 10), share: 0.3, lift: options.lift ?? 3 });
  const best = carried.best({ least: Math.max(least, 10), share: 0.5, lift: options.lift ?? 3 });
  // A word carries a number it divides by when it brings that number far more than it comes at
  // all (lift), even when the number is common ("3" in "two-thirds").
  // A common number ("2" in "half") cannot come three times as often as it comes at all; it is told
  // apart by how far above its base rate it comes, in standard errors.
  const z = (a: { share: number; lift: number; of: number }) => {
    const base = a.share / a.lift;
    return (a.share - base) / Math.sqrt((base * (1 - base)) / a.of);
  };
  const sharing = carried.kept({ least: Math.max(5, least), share: 0.2, lift: 1 }).filter((a) => a.lift >= (options.lift ?? 3) || z(a) >= 4);
  const words = new Set([...best.keys(), ...kept.map((a) => a.context), ...sharing.map((a) => a.context)]);
  for (const word of words) {
    const [n, after] = afterNumber.get(word) ?? [1, 0];
    if (after / n >= 0.1) continue;
    const uses = usedAs.get(word) ?? new Map<number, { divides: number; other: number }>();
    // The number it divides by: far more often where it is said than anywhere (lift), and mostly so.
    const times = seen.get(word) ?? 1;
    // Explained by another word that carries it more and is said with it ("tax" beside "%"): not its own.
    // Another word that carries it as strongly, said far more, with this one most times it is
    // carried here ("%" beside "tax"): it, not this word, carries the number.
    const mine = (n: number) => sharing.find((a) => a.context === word && a.outcome === n);
    // Of the examples where the word is said and the number carried, how many say the other word too.
    const beside = (w: string, other: string, n: number) => {
      const mine = questionWords.map((x, i) => (x.has(w) && carriedIn[i]!.has(n) ? x : undefined)).filter((x): x is Set<string> => !!x);
      return mine.length ? mine.filter((x) => x.has(other)).length / mine.length : 0;
    };
    const explained = (n: number) => {
      const own = mine(n);
      if (!own) return false;
      return sharing.some((a) => a.outcome === n && a.context !== word && a.count >= 2 * own.count && a.lift >= 0.8 * own.lift && beside(word, a.context, n) >= 0.6);
    };
    const carriedHere = new Set(sharing.filter((a) => a.context === word && !explained(a.outcome)).map((a) => a.outcome));
    const divides = [...uses].filter(([d, u]) => carriedHere.has(d) && Number.isInteger(d) && d > 1 && u.divides >= Math.max(5, least) && u.divides >= 0.6 * (u.divides + u.other) && (() => {
      // Divides far more often where the word is said than anywhere: by lift, or for a common
      // number by standard errors above its base rate.
      const base = Math.max(1e-6, (dividing.get(d) ?? 0) / examples.length);
      const rate = u.divides / times;
      return rate >= (options.lift ?? 3) * base || (rate - base) / Math.sqrt((base * (1 - base)) / times) >= 4;
    })()).sort((x, y) => y[1].divides - x[1].divides)[0];
    if (divides) {
      out.push({ word, claim: call("DividesBy", [{ value: divides[0] }]), for: divides[1].divides, against: divides[1].other });
      continue;
    }
    // A common number ("2" in "twice") is told apart by standard errors, as dividing is.
    const a = best.get(word) ?? sharing.filter((x) => x.context === word && x.share >= 0.5 && !explained(x.outcome)).sort((x, y) => y.count - x.count)[0];
    if (!a || !Number.isInteger(a.outcome) || a.outcome <= 1) continue;
    const [said, asValue] = valued.get(word) ?? [1, 0];
    const claim = asValue >= 0.5 * said ? call("SynonymOf", [{ value: call("Number", [{ value: a.outcome }]) }]) : call("Multiplies", [{ value: a.outcome }]);
    out.push({ word, claim, for: a.count, against: a.of - a.count });
  }
  return out;
}

/** What was learned, kept on each word's Concept. */
export function keepLearned(store: ConceptStore, learned: readonly Learned[], cause?: number): void {
  for (const l of learned) store.addRelation(nameOf(l.word), l.claim, undefined, cause);
}

/** What was learned, supposed for reading without keeping it (to measure it against what is kept). */
export function supposeLearned(lex: Lexicon, learned: readonly Learned[]): void {
  for (const l of learned) {
    const e = l.claim;
    const v = e.args[0]?.value;
    if (e.head === "Removes" || e.head === "Adds") lex.suppose(l.word, e.args.length ? "EffectOnMoney" : "Effect", e.head === "Removes" ? "Down" : "Up");
    else if (e.head === "SynonymOf") {
      if (v !== undefined && isCall(v) && v.head === "Number") lex.suppose(l.word, "Number", v.args[0]?.value);
    } else if (e.head === "Multiplies" || e.head === "DividesBy") {
      if (typeof v === "number" && v !== 0) lex.suppose(l.word, "Factor", e.head === "Multiplies" ? v : 1 / v);
    } else if (v !== undefined && isCall(v)) lex.suppose(l.word, e.head, v.head);
  }
}
