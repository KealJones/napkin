/**
 * Reading again, when told what was meant.
 *
 * "no, I meant plus", after a message was read some other way: one of its words was not the
 * word meant. Which one is worked out from the words themselves: the one that was read as
 * something else last time, the one the graph holds nothing of, the one spelled most like what
 * was meant, the one that is the same kind of thing as what was meant (an operator for an
 * operator). The message is then read again with that word as meant, and the reading is kept
 * (resolve/learned.ts), so the same typing is read right the next time without being told.
 */
import { typesOf } from "../runtime/types.js";
import { c } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { isWord, settled } from "../ears/parser/words.js";
import type { ConceptStore } from "../store/store.js";
import { keepReading, refuseReading } from "./learned.js";
import type { Edit } from "./readings.js";

export interface Reread {
  /** The earlier message, with the word as meant. */
  readonly message: string;
  readonly typed: string;
  readonly meant: string;
  /** Whether the reading was kept: a slip is, one known word swapped for another is not. */
  readonly kept: boolean;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Kinds too wide to say two words are alike: everything is one of these. */
const kinds = (store: ConceptStore, word: string): string[] => typesOf(store, c(nameOf(word))).slice(1);

/**
 * The earlier message read again with `meant` in place of the word it corrects, or undefined
 * when no word of it stands out as the one corrected.
 */
export function reread(store: ConceptStore, earlier: string, meantRaw: string, edits: readonly Edit[] = []): Reread | undefined {
  const meant = meantRaw.trim().replace(/^["'`]+|["'`.!?]+$/g, "").toLowerCase();
  // A word or two is a word corrected; more is the message said again, and is heard as it is.
  if (!meant || !/^[a-z]+( [a-z]+)?$/.test(meant)) return undefined;
  const words = [...earlier.matchAll(/[A-Za-z]+/g)];
  const meantKinds = new Set(kinds(store, meant.split(" ")[0]));
  let best: { at: number; end: number; typed: string; score: number } | undefined;
  const consider = (at: number, end: number, typed: string) => {
    const close = 1 - distance(typed, meant.replace(/ /g, "")) / Math.max(typed.length, meant.length);
    const edited = edits.some((e) => e.typed === typed);
    // The same kind of thing: how much of what each is, the other is too (an operator for an operator).
    const mine = kinds(store, typed);
    const shared = typed === meant || !mine.length || !meantKinds.size ? 0 : mine.filter((k) => meantKinds.has(k)).length / new Set([...mine, ...meantKinds]).size;
    // The word itself; spelled alike; read as something else before; a word neither the graph nor English has; the same kind of thing.
    const score = (typed === meant ? 6 : 0) + 8 * Math.max(0, close - 0.4) + (edited ? 1 : 0) + (store.has(nameOf(typed)) ? 0 : isWord(typed) ? 0.5 : 1) + 3 * shared;
    if (!best || score > best.score) best = { at, end, typed, score };
  };
  words.forEach((m, i) => {
    consider(m.index, m.index + m[0].length, m[0].toLowerCase());
    const next = words[i + 1];
    if (next && /^ +$/.test(earlier.slice(m.index + m[0].length, next.index))) consider(m.index, next.index + next[0].length, `${m[0]} ${next[0]}`.toLowerCase());
  });
  if (!best || best.score < 1.5) return undefined;
  const { at, end, typed } = best;
  // A slip is kept as a reading; one settled word said in place of another is only said again.
  const slip = typed === meant || !typed.split(" ").every((w) => settled(w));
  if (slip) keepReading(store, typed, meant, 3);
  for (const e of edits) if (e.typed === typed && e.meant !== meant) refuseReading(store, typed, e.meant);
  return { message: earlier.slice(0, at) + meant + earlier.slice(end), typed, meant, kept: slip };
}
