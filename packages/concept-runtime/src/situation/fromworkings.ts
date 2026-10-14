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
import { lemma } from "../runtime/host.js";
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

const wordsOf = (text: string): string[] => (text.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => lemma(w) || w);
const numbersIn = (text: string): number[] => (text.replace(/,(\d{3})/g, "$1").match(/\d*\.?\d+/g) ?? []).map(Number);

/** The steps of a working: each expression and what it came to. */
const stepsOf = (working: string) => [...working.matchAll(/<<([^=>]+)=([^>]+)>>/g)].map((m) => ({ expr: m[1]!.replace(/\s+/g, ""), result: Number(m[2]) }));

export function learnFromWorkings(store: ConceptStore, examples: readonly WorkedExample[], options: LearnOptions = {}): Learned[] {
  const lex = lexicon(store);
  const ways = new Directions();
  const carried = new Associations<string, number>();
  // How often a word comes right after a number: a unit ("5 minutes"), not a number of its own.
  const afterNumber = new Map<string, [number, number]>();
  for (const x of examples) {
    for (const g of votes(lex, x.question, x.working)) if (g.value !== "None") ways.add(lemma(g.word) || g.word, g.predicate, g.value);
    const steps = stepsOf(x.working);
    const results = new Set(steps.map((s) => s.result));
    const said = new Set(numbersIn(x.question));
    const unsaid = steps.flatMap((s) => numbersIn(s.expr)).filter((n) => !results.has(n) && !said.has(n) && n !== 0 && n !== 1);
    carried.observe(wordsOf(x.question), unsaid);
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
  for (const a of carried.best({ least: Math.max(least, 10), share: 0.5, lift: options.lift ?? 3 }).values()) {
    const [n, after] = afterNumber.get(a.context) ?? [1, 0];
    if (after / n >= 0.1 || !Number.isInteger(a.outcome) || a.outcome <= 1) continue;
    out.push({ word: a.context, claim: call("SynonymOf", [{ value: call("Number", [{ value: a.outcome }]) }]), for: a.count, against: a.of - a.count });
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
    } else if (v !== undefined && isCall(v)) lex.suppose(l.word, e.head, v.head);
  }
}
