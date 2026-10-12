/**
 * Reading a message: which words were meant, decided together.
 *
 * Spelling used to be settled before anything was heard, each word alone: "florp" became
 * "flora" because flora is a word, whatever the sentence was about. Here every way a word could
 * have been meant (as typed, a spelling a letter or two away, two typed words that are one, one
 * typed word that is two, and what this user has meant by it before) is a candidate, and the
 * candidates are chosen together by how well the whole message then fits (resolve/fit.ts): what
 * the graph holds of each word, and whether each word can take the words around it.
 *
 * A word left as typed costs nothing. A change costs by how much of the word it changes, so a
 * change must buy fit to be taken; what the user has confirmed before counts for it
 * (resolve/learned.ts). The reading the old speller would have made is where the search
 * starts, so a message it read well is read the same.
 */
import { type Expr } from "../concept/expression.js";
import { alternatives, beside, commonness, expandBare, isWord, unbare, spelling, type Alternative } from "../ears/parser/words.js";
import type { ConceptStore } from "../store/store.js";
import { fit } from "./fit.js";
import { learnedReadings } from "./learned.js";

export interface Edit {
  /** What was typed, lowercased: one word, or two when they were joined. */
  readonly typed: string;
  /** The words it was read as. */
  readonly meant: string;
  readonly kind: Alternative["kind"] | "learned";
}

export interface Resolved {
  /** The message as read: what is heard. */
  readonly text: string;
  readonly edits: Edit[];
  /** Every reading weighed, best first: the record of why this one. */
  readonly considered: { text: string; score: number }[];
  readonly expression: Expr | undefined;
  readonly raw: string;
}

interface Token {
  readonly at: number;
  readonly raw: string;
  /** The next word, when only a space lies between: what a join would take. */
  readonly next?: { raw: string; end: number };
  readonly options: Option[];
}

interface Option {
  readonly text: string;
  readonly end: number;
  readonly edit?: Edit;
  /** What the change costs before fit is counted, less what speaks for it. */
  readonly cost: number;
  /** The speller's own correction, to a word written commonly enough to stand without more. */
  readonly stands?: boolean;
}

/** A change costs by how much of the word it changes: one letter of three is more than one of nine. */
const COST = 3;
/** How much being written beside its neighbours speaks for a word: enough to part two that fit alike. */
const BESIDE = 0.4;
/** How commonly written a word must be to be what a non-word meant (`commonness`): "happy", not "flora". */
const STANDS = 0.75;
/** Joining or splitting changes only a space. */
const SPACE = 0.5;
/** One reading must beat another by this to replace it. */
const MARGIN = 0.05;

/** Code, quotes and links are verbatim: nothing in them is another word. */
const VERBATIM = /```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|https?:\/\/\S+|\S+@\S+|\S*[\\/_]\S*/g;

function tokens(store: ConceptStore, text: string): Token[] {
  const shut: [number, number][] = [...text.matchAll(VERBATIM)].map((m) => [m.index, m.index + m[0].length]);
  const words = [...text.matchAll(/[A-Za-z]+/g)].filter((m) => !shut.some(([a, b]) => m.index >= a && m.index < b));
  const out: Token[] = [];
  words.forEach((m, i) => {
    const raw = m[0];
    const at = m.index;
    const end = at + raw.length;
    const after = words[i + 1];
    const next = after && /^ +$/.test(text.slice(end, after.index)) ? { raw: after[0], end: after.index + after[0].length } : undefined;
    const prev = i ? words[i - 1][0].toLowerCase() : "";
    const typed = raw.toLowerCase();
    const options: Option[] = [{ text: raw, end, cost: 0 }];
    // Said that way on purpose: drawn-out words, names and identifiers (as `correct` leaves them).
    const starts = at === 0 || /[.!?]\s*$/.test(text.slice(0, at));
    // A name in code is not a word: g(2), list.length, x = 5.
    const inCode = /^[([{.=_]/.test(text.slice(end)) || /[._$]$/.test(text.slice(0, at));
    const onPurpose = inCode || /(.)\1\1/i.test(raw) || (/[A-Z]/.test(raw.slice(1)) && /[a-z]/.test(raw)) || (!starts && /^[A-Z][a-z]/.test(raw));
    const learned = learnedReadings(store, typed);
    for (const l of learned) {
      if (l.meant === typed) options[0] = { text: raw, end, cost: -l.weight };
      else options.push({ text: l.meant, end, edit: { typed, meant: l.meant, kind: "learned" }, cost: -l.weight });
    }
    if (next) {
      const pair = `${typed} ${next.raw.toLowerCase()}`;
      for (const l of learnedReadings(store, pair)) options.push({ text: l.meant, end: next.end, edit: { typed: pair, meant: l.meant, kind: "learned" }, cost: -l.weight });
    }
    if (!onPurpose) {
      // What the speller alone would read it as stands where it has a reading: the others are
      // weighed only for a word it left as typed that English does not have.
      const spelled = spelling(raw, prev);
      const proposed = alternatives(raw, prev, next?.raw ?? "").filter((a) =>
        spelled !== undefined
          ? a.text === spelled && (a.graph || a.common >= STANDS || unbare(a.text) !== a.text)
          : // A slip keeps the word's first letter, and changes two letters only of a long word (as the speller holds).
            a.kind !== "spelling" || (typed.length >= 3 && !isWord(typed) && a.text[0] === typed[0] && (a.distance === 1 || typed.length >= 7) && (a.graph || a.common >= STANDS)),
      );
      for (const a of proposed) {
        if (learned.some((l) => l.meant === a.text)) continue;
        const joined = a.replaces === 2 && next;
        if (a.replaces === 2 && !joined) continue;
        const near = a.kind === "spelling" ? BESIDE * (beside(prev, a.text, next?.raw ?? "") - beside(prev, typed, next?.raw ?? "")) : 0;
        // What the change costs, less how much more the word meant is written than the one typed.
        const cost = (a.kind === "spelling" ? (COST * a.distance) / typed.length - a.common + commonness(typed) : SPACE) - near;
        options.push({ text: unbare(a.text), end: joined ? next.end : end, edit: { typed: joined ? `${typed} ${next.raw.toLowerCase()}` : typed, meant: a.text, kind: a.kind }, cost, stands: a.text === spelled });
      }
    }
    if (options.length > 1 || options[0].cost !== 0) out.push({ at, raw, next, options });
  });
  return out;
}

/** The text with each open word written as chosen. A join takes the next word with it. */
function write(text: string, open: readonly Token[], chosen: readonly number[]): { text: string; edits: Edit[]; cost: number } {
  let out = text;
  let cost = 0;
  const edits: Edit[] = [];
  let taken = Infinity;
  for (let i = open.length - 1; i >= 0; i--) {
    let option = open[i].options[chosen[i]];
    // The word after was already written over by its own choice: this one cannot also take it.
    if (option.end > taken) option = open[i].options[0];
    out = out.slice(0, open[i].at) + option.text + out.slice(option.end);
    cost += option.cost;
    if (option.edit) edits.unshift(option.edit);
    taken = open[i].at;
  }
  return { text: out, edits, cost };
}

export type HearText = (text: string) => Promise<{ expression: Expr | undefined; raw: string }>;

export async function resolve(store: ConceptStore, message: string, hearText: HearText): Promise<Resolved> {
  const text = expandBare(message);
  const open = tokens(store, text);
  const heard = new Map<string, { expression: Expr | undefined; raw: string; fit: ReturnType<typeof fit> }>();
  const weigh = async (chosen: readonly number[]) => {
    const written = write(text, open, chosen);
    let h = heard.get(written.text);
    if (!h) {
      const r = await hearText(written.text);
      h = { ...r, fit: fit(store, r.expression) };
      heard.set(written.text, h);
    }
    return { ...written, expression: h.expression, raw: h.raw, score: h.fit.score - written.cost };
  };
  // Where the search starts: what was taught, else what the speller alone would have read
  // where the word it chose is commonly written or the graph's own. A rarer guess ("florp" as
  // flora) does not stand: the word is left as typed.
  const chosen = open.map((t) => {
    const taught = t.options.findIndex((o, k) => (k === 0 ? o.cost < 0 : o.edit?.kind === "learned"));
    if (taught >= 0) return taught;
    const stands = t.options.findIndex((o) => o.stands);
    return stands < 0 ? 0 : stands;
  });
  let best = await weigh(chosen);
  const considered = new Map<string, number>([[best.text, best.score]]);
  // Each open word in turn, the others held: twice, so a word can be read in the light of a
  // neighbour that was itself just read.
  for (let pass = 0; pass < 2 && open.length; pass++) {
    let changed = false;
    for (let i = 0; i < open.length; i++) {
      for (let k = 0; k < open[i].options.length; k++) {
        if (k === chosen[i]) continue;
        const trial = [...chosen];
        trial[i] = k;
        const got = await weigh(trial);
        considered.set(got.text, got.score);
        // The speller's own reading, where it stands, is replaced only by what was taught.
        if (open[i].options[chosen[i]].stands && open[i].options[k].edit?.kind !== "learned") continue;
        // Leaving a word as typed wins a tie: a change has to earn its place.
        if (got.score > best.score + MARGIN || (k === 0 && got.score >= best.score - MARGIN && got.text !== best.text)) {
          best = got;
          chosen[i] = k;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return {
    text: best.text,
    edits: best.edits,
    considered: [...considered].map(([t, score]) => ({ text: t, score })).sort((a, b) => b.score - a.score),
    expression: best.expression,
    raw: best.raw,
  };
}
