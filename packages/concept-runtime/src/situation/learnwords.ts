/**
 * Learning what a word does to amounts from worked examples, not from a list: in a situation whose
 * answer is known, each word that could act on the amounts (a doing beside them, a word before
 * "than", a word after a percent) is supposed to act each way it could, and the way the answer
 * bears out counts for it; the ways it does not, against. What many situations agree on is kept as
 * a fact on the word (`Sell Effect(Down())`, `Older Compares(Up())`), so a word met once in a
 * worked example reads the same in every situation after.
 */
import { words as hostWords } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";
import { lexicon } from "./lexicon.js";
import { situationOf, solve } from "./situation.js";

/** A way a word could act: the relation and its value (Up, Down). */
export interface Guess {
  readonly word: string;
  readonly predicate: "Effect" | "Compares" | "Changes";
  readonly value: "Up" | "Down";
}

const key = (g: Guess) => `${g.word}|${g.predicate}|${g.value}`;

/** The words of a message that could act on its amounts, each with the relation it would act by. */
export function candidates(message: string): { word: string; predicate: Guess["predicate"] }[] {
  const tagged = hostWords(message);
  const out = new Map<string, { word: string; predicate: Guess["predicate"] }>();
  tagged.forEach((t, i) => {
    const w = t.text.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return;
    if (t.tags.includes("Verb") && !t.tags.includes("Copula") && !t.tags.includes("Auxiliary")) out.set(`${w}|Effect`, { word: w, predicate: "Effect" });
    // Said between an amount and "than": "30 more gold coins than", "3 years younger than".
    const than = tagged.slice(i + 1, i + 4).findIndex((x) => x.text.toLowerCase() === "than");
    if (than >= 0 && !t.tags.includes("Value") && !t.tags.includes("Noun")) out.set(`${w}|Compares`, { word: w, predicate: "Compares" });
    // Said just after a percent: "25% discount", "50% more expensive".
    const percent = tagged.slice(Math.max(0, i - 3), i).some((x) => /%$|^percent$/i.test(x.text));
    if (percent && !t.tags.includes("Value")) out.set(`${w}|Changes`, { word: w, predicate: "Changes" });
  });
  return [...out.values()];
}

export interface Evidence {
  readonly for: Map<string, number>;
  readonly against: Map<string, number>;
}

export const noEvidence = (): Evidence => ({ for: new Map(), against: new Map() });

/**
 * One worked example read for what its words do: with what is already learned supposed, each word
 * not yet known is supposed each way, and the answer counts for and against. Returns whether the
 * situation came out right with what was already known.
 */
export function weigh(store: ConceptStore, message: string, answer: number, learned: readonly Guess[], evidence: Evidence, budget = 6): boolean {
  const lex = lexicon(store);
  const right = (): boolean => {
    const s = situationOf(store, message);
    if (!s || s.amounts.length > budget) return false;
    const got = solve(s.amounts, s.asked);
    return !!got && Math.abs(got.value - answer) < 1e-6;
  };
  const known = new Set(learned.map((g) => `${g.word}|${g.predicate}`));
  const apply = (extra?: Guess) => {
    lex.unsuppose();
    for (const g of learned) lex.suppose(g.word, g.predicate, g.value);
    if (extra) lex.suppose(extra.word, extra.predicate, extra.value);
  };
  apply();
  const s = situationOf(store, message);
  if (!s || s.amounts.length > budget) return false;
  const already = right();
  for (const c of candidates(message)) {
    if (known.has(`${c.word}|${c.predicate}`)) continue;
    const ways = (["Up", "Down"] as const).map((value) => {
      const g: Guess = { word: c.word, predicate: c.predicate, value };
      apply(g);
      return { g, ok: right() };
    });
    // Only a difference teaches: the answer comes out one way and not the other.
    if (ways.every((w) => w.ok) || ways.every((w) => !w.ok)) continue;
    for (const w of ways) {
      const m = w.ok ? evidence.for : evidence.against;
      m.set(key(w.g), (m.get(key(w.g)) ?? 0) + 1);
    }
  }
  apply();
  return already;
}

/** What the evidence agrees on: a way seen to work often and seldom seen to fail. */
export function agreed(evidence: Evidence, least = 2, ratio = 3): Guess[] {
  const out: Guess[] = [];
  for (const [k, n] of evidence.for) {
    const against = evidence.against.get(k) ?? 0;
    if (n < least || n < ratio * against) continue;
    const [word, predicate, value] = k.split("|") as [string, Guess["predicate"], Guess["value"]];
    // Not both ways: the one with more for it.
    const other = `${word}|${predicate}|${value === "Up" ? "Down" : "Up"}`;
    if ((evidence.for.get(other) ?? 0) >= n) continue;
    out.push({ word, predicate, value });
  }
  return out;
}
