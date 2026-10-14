/**
 * Learning what a word does to amounts from worked examples, not from a list: in a situation whose
 * answer is known, each word that could act on the amounts (a doing beside them, a word before
 * "than", a word after a percent) is supposed to act each way it could, and the way the answer
 * bears out counts for it; the ways it does not, against. Evidence is kept by the word's base, so
 * "sold", "sells" and "selling" learn together; when several words could each explain an answer
 * they share the credit, and an answer easily hit by chance (2, 3) counts for less. What a word
 * does is also what its neighbours do: a word seen in the same company as words already learned
 * (the words beside it, the rest of its paragraph) reads as they do until it is learned itself.
 */
import { lemma, words as hostWords } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";
import { lexicon } from "./lexicon.js";
import { situationOf, solve } from "./situation.js";

export type Way = "Up" | "Down" | "None";
export type Relation = "Effect" | "EffectOnMoney" | "Compares" | "Changes";

/** A way a word could act: the relation and its value. None: it does nothing to the amounts. */
export interface Guess {
  readonly word: string;
  readonly predicate: Relation;
  readonly value: Way;
}

const WAYS: readonly Way[] = ["Up", "Down", "None"];
const key = (word: string, predicate: string, value: string) => `${word}|${predicate}|${value}`;
/** A word as its base: what its forms learn together under. */
export const baseOf = (word: string): string => {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  return lemma(w) || w;
};

/** The words of a message that could act on its amounts, each with the relation it would act by. */
export function candidates(message: string): { word: string; predicate: Relation }[] {
  const tagged = hostWords(message);
  const out = new Map<string, { word: string; predicate: Relation }>();
  tagged.forEach((t, i) => {
    const w = baseOf(t.text);
    if (!w || t.tags.includes("Value")) return;
    if (t.tags.includes("Verb") && !t.tags.includes("Copula") && !t.tags.includes("Auxiliary")) out.set(`${w}|Effect`, { word: w, predicate: "Effect" });
    // Said between an amount and "than": "30 more gold coins than", "3 years younger than".
    const than = tagged.slice(i + 1, i + 4).findIndex((x) => x.text.toLowerCase() === "than");
    if (than >= 0 && !t.tags.includes("Noun")) out.set(`${w}|Compares`, { word: w, predicate: "Compares" });
    // Said just after a percent: "25% discount", "50% more expensive".
    if (tagged.slice(Math.max(0, i - 3), i).some((x) => /%$|^percent$/i.test(x.text))) out.set(`${w}|Changes`, { word: w, predicate: "Changes" });
  });
  return [...out.values()];
}

export interface Evidence {
  readonly for: Map<string, number>;
  readonly against: Map<string, number>;
}

export const noEvidence = (): Evidence => ({ for: new Map(), against: new Map() });

/** How much an answer says: one hit by chance (2, 3) says less than one that is not (1,430). */
const weightOf = (answer: number) => Math.min(1, 0.25 + Math.log10(Math.abs(answer) + 1) / 2);

const suppose = (store: ConceptStore, guesses: readonly Guess[]) => {
  const lex = lexicon(store);
  lex.unsuppose();
  for (const g of guesses) lex.suppose(g.word, g.predicate, g.value === "None" ? undefined : g.value);
};

/**
 * One worked example read for what its words do: with what is already learned supposed, each word
 * not yet known is supposed each way, and the answer counts for and against. Returns whether the
 * situation came out right with what was already known.
 */
export function weigh(store: ConceptStore, message: string, answer: number, learned: readonly Guess[], evidence: Evidence, budget = 6): boolean {
  const right = (): boolean => {
    const s = situationOf(store, message);
    if (!s || s.amounts.length > budget) return false;
    const got = solve(s.amounts, s.asked);
    return !!got && Math.abs(got.value - answer) < 1e-6;
  };
  suppose(store, learned);
  const s = situationOf(store, message);
  if (!s || s.amounts.length > budget) return false;
  const known = new Set(learned.map((g) => `${g.word}|${g.predicate}`));
  const tried: { ways: { g: Guess; ok: boolean }[] }[] = [];
  for (const c of candidates(message)) {
    if (known.has(`${c.word}|${c.predicate}`)) continue;
    const ways = WAYS.map((value) => {
      const g: Guess = { word: c.word, predicate: c.predicate, value };
      suppose(store, [...learned, g]);
      return { g, ok: right() };
    });
    // Only a difference teaches: the answer comes out some ways and not others.
    if (ways.every((w) => w.ok) || ways.every((w) => !w.ok)) continue;
    tried.push({ ways });
  }
  // Credit shared among the words that could each explain it.
  const share = weightOf(answer) / Math.max(1, tried.length);
  for (const { ways } of tried) {
    for (const w of ways) {
      const m = w.ok ? evidence.for : evidence.against;
      const k = key(w.g.word, w.g.predicate, w.g.value);
      m.set(k, (m.get(k) ?? 0) + share);
    }
  }
  suppose(store, learned);
  const already = right();
  lexicon(store).unsuppose();
  return already;
}

/** What the evidence agrees on: a way that worked clearly more than it failed and more than the others. */
export function agreed(evidence: Evidence, least = 1.5, ratio = 3): Guess[] {
  const best = new Map<string, { value: Way; n: number; second: number }>();
  for (const [k, n] of evidence.for) {
    const [word, predicate, value] = k.split("|") as [string, Relation, Way];
    const against = evidence.against.get(k) ?? 0;
    if (n < least || n < ratio * against) continue;
    const id = `${word}|${predicate}`;
    const was = best.get(id);
    if (!was || n > was.n) best.set(id, { value, n, second: was ? was.n : 0 });
    else if (n > was.second) best.set(id, { ...was, second: n });
  }
  return [...best]
    .filter(([, b]) => b.n >= 2 * b.second)
    .map(([id, b]) => {
      const [word, predicate] = id.split("|") as [string, Relation];
      return { word, predicate, value: b.value };
    });
}

/**
 * The company each word keeps: the words beside it (by side and distance, numbers as one) and the
 * other words of its paragraph. Words that keep the same company are used alike.
 */
export interface Company {
  readonly vectors: Map<string, Map<string, number>>;
}

export function companyOf(texts: readonly string[]): Company {
  const counts = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  const token = (w: string) => (/^\$/.test(w) ? "$#" : /\d/.test(w) ? (/%$/.test(w) ? "#%" : "#") : baseOf(w));
  for (const text of texts) {
    const ts = (text.match(/\$?\d[\d,.]*%?|[A-Za-z]+/g) ?? []).map(token).filter(Boolean);
    const paragraph = new Set(ts.filter((t) => t.length > 3 && t !== "#"));
    const seen = new Set<string>();
    ts.forEach((w, i) => {
      if (w === "#" || w === "$#" || w === "#%") return;
      const v = counts.get(w) ?? new Map<string, number>();
      for (const d of [-2, -1, 1, 2]) {
        const n = ts[i + d];
        if (n === undefined) continue;
        const f = `${d}:${n}`;
        v.set(f, (v.get(f) ?? 0) + (Math.abs(d) === 1 ? 2 : 1));
        if (!seen.has(f)) seen.add(f);
      }
      for (const p of paragraph) if (p !== w) v.set(`p:${p}`, (v.get(`p:${p}`) ?? 0) + 0.2);
      counts.set(w, v);
    });
    for (const f of seen) df.set(f, (df.get(f) ?? 0) + 1);
  }
  // Common company says little: weighed down by how many paragraphs have it.
  const vectors = new Map<string, Map<string, number>>();
  for (const [w, v] of counts) {
    const out = new Map<string, number>();
    let norm = 0;
    for (const [f, n] of v) {
      const x = n / Math.log(2 + (df.get(f) ?? 1));
      out.set(f, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [f, x] of out) out.set(f, x / norm);
    vectors.set(w, out);
  }
  return { vectors };
}

export function likeness(company: Company, a: string, b: string): number {
  const x = company.vectors.get(a);
  const y = company.vectors.get(b);
  if (!x || !y) return 0;
  const [small, big] = x.size < y.size ? [x, y] : [y, x];
  let dot = 0;
  for (const [f, v] of small) dot += v * (big.get(f) ?? 0);
  return dot;
}

/**
 * A word not yet learned read as the words most like it are: the ways of its nearest learned
 * neighbours (for the same relation), each counted by how alike they are. Undefined when nothing
 * learned is near enough, or the neighbours disagree.
 */
export function byNeighbours(company: Company, learned: readonly Guess[], word: string, predicate: Relation, near = 0.35, k = 5): Way | undefined {
  const ranked = learned
    .filter((g) => g.predicate === predicate && g.word !== word)
    .map((g) => ({ g, sim: likeness(company, baseOf(word), g.word) }))
    .filter((x) => x.sim >= near)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
  if (!ranked.length) return undefined;
  const votes = new Map<Way, number>();
  for (const { g, sim } of ranked) votes.set(g.value, (votes.get(g.value) ?? 0) + sim);
  const sorted = [...votes].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[1]![1] > sorted[0]![1] / 2) return undefined;
  return sorted[0]![0];
}
