/**
 * Learning what words do from worked solutions: a situation read beside its working ("Mel is three
 * years younger than Katherine ..." beside "24 - 3 = 21"). Each amount the situation says is found
 * in the working, and how the working uses it (taken away, added) counts for the words said beside
 * it: the doing of its clause, the word between it and what it is compared to, the word after a
 * share. Nothing says what any word is; the working shows it, and what many workings agree on is
 * kept, like learning from a worked example in a book.
 */
import { words as hostWords } from "../runtime/host.js";
import type { Lexicon } from "./lexicon.js";
import type { Guess } from "./learnwords.js";

/** A number's use in a step: -1 taken away, +1 added, 0 otherwise; and the number it was put with. */
export interface Use {
  readonly way: number;
  readonly with?: number;
}

/** How each number is used in a working's steps. */
export function uses(working: string): Map<number, Use[]> {
  const out = new Map<number, Use[]>();
  // What each number worked out was made of by multiplying and dividing: "80 × 25/100 = 20" is of
  // 80 and 25, so 20 taken away later is 25's share taken away.
  const madeOf = new Map<number, number[]>();
  for (const m of working.matchAll(/<<([^=>]+)=([^>]+)>>/g)) {
    const expr = m[1]!.replace(/\s+/g, "");
    const parts = expr.match(/\d*\.?\d+|[-+*/x()]/g) ?? [];
    const sources = (n: number) => madeOf.get(n) ?? [n];
    parts.forEach((p, k) => {
      if (!/\d/.test(p)) return;
      const n = Number(p);
      const before = parts[k - 1];
      const after = parts[k + 1];
      const way = before === "-" ? -1 : before === "+" || (before === undefined && after === "+") ? 1 : 0;
      // What it was put with: the number before it, or after it when it comes first.
      const other = way === 0 ? undefined : before ? parts[k - 2] : parts[k + 2];
      for (const s of sources(n)) out.set(s, [...(out.get(s) ?? []), { way, ...(other && /\d/.test(other) ? { with: Number(other) } : {}) }]);
    });
    if (!/[-+]/.test(expr.replace(/^-/, ""))) madeOf.set(Number(m[2]), parts.filter((p) => /\d/.test(p)).flatMap((p) => sources(Number(p))));
  }
  return out;
}

/** What a worked example says its words do: for each amount said, the words beside it, voted. */
export function votes(lex: Lexicon, question: string, working: string): Guess[] {
  const used = uses(working);
  const tagged = hostWords(question);
  const out: Guess[] = [];
  const clauseEnd = (t: { text: string }) => /[,.;!?]$/.test(t.text);
  // Each number said, where, and the doing of its clause.
  const said = new Map<number, number>();
  const numberAt = (t: { text: string }) => {
    const digits = /^\$?(\d[\d,]*(?:\.\d+)?)(%?)$/.exec(t.text.replace(/[,.;!?]$/, ""));
    return { n: digits ? Number(digits[1]!.replace(/,/g, "")) : lex.count(t.text.toLowerCase().replace(/[^a-z]/g, "")), percent: !!digits?.[2] };
  };
  const doingOf = (i: number): number => {
    for (let k = i - 1; k >= 0 && !clauseEnd(tagged[k]!); k--) {
      const v = tagged[k]!;
      if (v.tags.includes("Verb") && !v.tags.includes("Copula") && !v.tags.includes("Auxiliary")) return k;
    }
    return -1;
  };
  tagged.forEach((t, i) => {
    const { n } = numberAt(t);
    if (n !== undefined && !said.has(n)) said.set(n, i);
  });
  const doingWord = (k: number) => (k >= 0 ? tagged[k]!.text.toLowerCase().replace(/[^a-z]/g, "") : undefined);
  tagged.forEach((t, i) => {
    const at = numberAt(t);
    const n = at.n;
    if (n === undefined) return;
    const percent = at.percent || /^percent/i.test(tagged[i + 1]?.text ?? "");
    const mine = doingWord(doingOf(i));
    // Put with a number said under the same doing ("$5 on paint and $3 on brushes"), a sum says
    // nothing of what the doing does; with another doing's, or a number worked out, it does.
    const differs = (u: Use) => u.with === undefined || !said.has(u.with) || doingWord(doingOf(said.get(u.with)!)) !== mine;
    const ways = [...(used.get(n) ?? []), ...(percent ? (used.get(n / 100) ?? []) : [])].filter((u) => u.way !== 0 && differs(u)).map((u) => u.way);
    // Only a number the working uses one way says anything.
    if (!ways.length || ways.some((w) => w !== ways[0])) return;
    const value = ways[0]! > 0 ? "Up" : "Down";
    // The doing of its clause: the nearest one before it.
    for (let k = i - 1; k >= 0 && !clauseEnd(tagged[k]!); k--) {
      const v = tagged[k]!;
      if (v.tags.includes("Verb") && !v.tags.includes("Copula") && !v.tags.includes("Auxiliary")) {
        // Money done with ("sold them for $15") and things done with ("sold 13 sets") apart.
        const money = /^\$/.test(t.text) || /^(dollars?|cents?)$/i.test(tagged[i + 1]?.text ?? "");
        out.push({ word: v.text.toLowerCase().replace(/[^a-z]/g, ""), predicate: money ? "EffectOnMoney" : "Effect", value });
        break;
      }
    }
    // What it is compared by: the words between it and "than".
    const than = tagged.slice(i + 1, i + 5).findIndex((x) => x.text.toLowerCase() === "than");
    if (than >= 0)
      for (const x of tagged.slice(i + 1, i + 1 + than)) if (!x.tags.includes("Value")) out.push({ word: x.text.toLowerCase().replace(/[^a-z]/g, ""), predicate: "Compares", value });
    // A share and the word after it: "20% discount".
    if (percent)
      for (const x of tagged.slice(i + 1, i + 4)) if (!x.tags.includes("Value") && !/^percent/i.test(x.text) && !x.tags.includes("Preposition") && !x.tags.includes("Determiner")) {
        out.push({ word: x.text.toLowerCase().replace(/[^a-z]/g, ""), predicate: "Changes", value });
        break;
      }
  });
  return out.filter((g) => g.word.length > 1);
}
