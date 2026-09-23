/**
 * Scoring one Ears reading against the message it came from.
 *
 * Every check is about the Ears' job and nothing else: did it keep what was said, mark
 * what the message did, and put holes where the unknowns are. None of them asks whether
 * the reading uses the graph's names. A check that did would reward the prompt for
 * teaching graph vocabulary, which is the thing `../AGENTS.md` forbids.
 *
 * Two kinds of result:
 *  - hard checks, pass or fail, some automatic and some declared per case;
 *  - soft measures, reported but never failing a case: how many content words survived,
 *    and which names look copied from the prompt rather than taken from the message.
 */
import { type Expr, format, heads, isCall, walk } from "../../concept/expression.js";
import { check, looksLikeQuestion } from "../ears.js";
import { lift, type Lifted } from "../lift.js";

export const INTERROGATIVES = new Set([
  "What", "Who", "When", "Where", "Why", "How", "HowMany", "HowMuch", "WhichOf", "Whether", "WhatIs",
]);

/** Moods `mood.ts` adds; a question in either of the last two is asked even with no question word. */
const MOODS = new Set(["Imperative", "Declarative", "Interrogative", "Checking"]);

/**
 * The IR's own vocabulary (`ir-spec.md` Parts 6-8, `seed-concepts.md` Parts 9-11). The
 * prompt is allowed to teach these, so using one is never a copy.
 */
const IR_VOCABULARY = new Set([
  ...INTERROGATIVES,
  "Do", "Fact", "Tell", "Mood", ...MOODS, "InlineCode", "Unclear",
  "MarkCorrection", "MarkMisspelling", "MarkFuzzy", "MarkEmphasis", "MarkAside", "Ref", "Not",
  "Qualify", "Ordinal", "Field", "Heading", "Item", "Block", "Please", "It",
  "List", "Object", "Pair", "String", "Number", "Boolean", "Sequence", "Let",
  "Me", "You", "We", "Self", "Date", "Time", "Am", "Pm",
]);

export interface Expect {
  /** Overrides the surface guess. true: must hold an interrogative. false: must hold none. */
  question?: boolean;
  /** At least one of these interrogatives must appear. */
  interrogative?: string | string[];
  /** Heads that must appear. */
  has?: string[];
  /** Heads that must not appear. */
  lacks?: string[];
  /** Substrings that must not appear in the formatted reading. */
  lacksText?: string[];
  /** Words from the message that must survive, in a name or a string. */
  keeps?: string[];
  /** At least this many `Ref`s. */
  refs?: number;
  /** At least this many of each head. */
  counts?: Record<string, number>;
  /** Digits that must survive. Defaults to every digit in the message. */
  digits?: string[];
  /** Numbers that must survive as numbers, not inside a string ("7am" is Am(7), not "7am"). */
  numbers?: number[];
}

export interface EvalCase {
  id: string;
  message: string;
  /**
   * Where the case came from. Whether the prompt currently shows it as an example is
   * worked out at run time instead, since that changes whenever the prompt does.
   */
  source: "spec" | "novel" | "regression" | "heldout" | "gold";
  /** `open`: the IR cannot express this cleanly yet, so it is reported apart. */
  status?: "open";
  history?: { message: string; spoken: string }[];
  expect?: Expect;
  /** The intended reading in line form (`eval/ears/gold.md`). Expectations derive from it. */
  target?: string;
}

export interface Score {
  /** Hard checks by name; a case passes when every one is true. */
  checks: Record<string, boolean>;
  /** Content words of the message that survived, 0 to 1. */
  retained: number;
  /** Content words that did not survive. */
  dropped: string[];
  /** Names shown in the prompt that the message never said. */
  copied: string[];
  /** Overlap of name words with the gold reading, 0 to 1, when there is one. */
  match?: number;
  /** How much of the message's word order the reading keeps, 0 to 1. */
  order: number;
}

const STOP = new Set(
  ("the and but are was were been being for with that this these those its it's you your " +
    "yours our ours his her hers their theirs them they she him she'll i'm i've i'd " +
    "what who when where why how which whether can could would will shall should may might " +
    "must please does did doing done have has had not dont don't than then there here " +
    "just like some any all also into onto from about very really let let's me my mine " +
    "is am be do to of in on at by or an a so if as up out no yes ok okay").split(/\s+/),
);

/** Lowercase words of a name: `ShiftHours` is shift and hours, `F3` is f3. */
export function nameWords(head: string): string[] {
  return head
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function contentWords(message: string): string[] {
  const words = message.toLowerCase().match(/[a-z][a-z']*/g) ?? [];
  return [...new Set(words.map((w) => w.replace(/'s$/, "")).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/** Same word, allowing for inflection: `visit` matches `Visited`, `doubled` matches `Double`. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length, 5);
  return n >= 3 && a.slice(0, n) === b.slice(0, n);
}

function strings(e: Expr): string[] {
  return [...walk(e)].filter((n): n is string => typeof n === "string").map((s) => s.toLowerCase());
}

function numbers(e: Expr): number[] {
  return [...walk(e)].filter((n): n is number => typeof n === "number");
}

/** Everything a word could have survived as: the words of every name, and every string. */
function haystack(e: Expr): { names: string[]; text: string } {
  return { names: [...heads(e)].flatMap(nameWords), text: strings(e).join(" ") };
}

function survives(word: string, hay: { names: string[]; text: string }): boolean {
  const parts = word.toLowerCase().split(/\s+/);
  return parts.every((p) => hay.text.includes(p) || hay.names.some((n) => sameWord(p, n)));
}

/**
 * A fused interrogative counts as its question word: WhoDid is Who, WhatIs is What. Both
 * forms are under test, and a count should not decide between them.
 */
const asked = (head: string): string =>
  /^(What|Who|When|Where|Why|How|Which)(Is|Are|Was|Were|Did|Do|Does|Will|Would|Can|Could|Should|Has|Have|Had)$/.exec(head)?.[1] ?? head;

function count(e: Expr, head: string): number {
  return [...walk(e)].filter((n) => isCall(n) && asked(n.head) === head).length;
}

/**
 * Word order kept: the longest run of the message's content words, in order, found in a
 * left-to-right walk of the reading, over the words that survived at all. "who did hamlet
 * kill" read as Who(Did(Hamlet(), Kill())) keeps it all; Killed(Hamlet(), Who()) does not.
 */
export function orderKept(message: string, e: Expr): number {
  const said = (message.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2);
  const read: string[] = [];
  for (const n of walk(e)) {
    if (isCall(n)) read.push(...nameWords(n.head));
    else if (typeof n === "string") read.push(...(n.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  }
  const a = said.filter((w) => read.some((r) => sameWord(w, r)));
  if (a.length < 2) return 1;
  const b = read.filter((r) => a.some((w) => sameWord(w, r)));
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      table[i][j] = sameWord(a[i - 1], b[j - 1]) ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[a.length][b.length] / a.length;
}

/**
 * Names in the reading that appear in the prompt's own text but that the message never
 * said. The measured failure this catches: "give me three examples of a bird" read as
 * `Do(Write(Function()))`, copied from an example about writing a function.
 */
export function copiedNames(message: string, e: Expr, promptNames: ReadonlySet<string>): string[] {
  const said = message.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...heads(e)].filter(
    (h) =>
      promptNames.has(h) &&
      !IR_VOCABULARY.has(h) &&
      !nameWords(h).some((w) => said.some((s) => sameWord(w, s))),
  );
}

/** Every capitalised name followed by a paren in the prompt text. */
export function namesIn(prompt: string): Set<string> {
  return new Set([...prompt.matchAll(/\b([A-Z][A-Za-z0-9]*)\(/g)].map((m) => m[1]));
}

/**
 * What a gold reading commits to, as checks. Its frames, markers, holes and references
 * must all appear, as often; the words and digits it kept must survive. Everything else
 * about it, including which names it chose, is only compared softly.
 */
const COMMITTED = new Set([
  ...[...INTERROGATIVES].filter((h) => h !== "Whether"), "MarkCorrection", "MarkMisspelling", "MarkFuzzy", "MarkEmphasis", "MarkAside", "Ref", "Not",
  "Heading", "Item", "Block", "InlineCode", "Please", "Unclear", "Mood", ...MOODS,
]);

export function expectFrom(message: string, target: Expr): Expect {
  const hay = haystack(target);
  const counts: Record<string, number> = {};
  for (const h of heads(target)) if (COMMITTED.has(h)) counts[h] = count(target, h);
  return {
    question: [...heads(target)].some((h) => INTERROGATIVES.has(asked(h)) || h === "Interrogative" || h === "Checking"),
    counts,
    keeps: contentWords(message).filter((w) => survives(w, hay)),
    digits: (message.match(/\d+/g) ?? []).filter((d) => format(target).includes(d)),
    numbers: [...new Set(numbers(target))],
  };
}

const nameSet = (e: Expr): Set<string> =>
  new Set([...heads(e)].filter((h) => !IR_VOCABULARY.has(h)).flatMap(nameWords).map((w) => w.slice(0, 5)));

/** Jaccard overlap of the words in non-IR names. Soft: two good readings can differ. */
export function match(target: Expr, reading: Expr): number {
  const a = nameSet(target);
  const b = nameSet(reading);
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter((w) => b.has(w)).length / union.size : 1;
}

export function score(
  c: EvalCase,
  lifted: Pick<Lifted, "expression" | "rejected">,
  promptNames: ReadonlySet<string> = new Set(),
): Score {
  const e = lifted.expression;
  const target = c.target === undefined ? undefined : lift(c.target).expression;
  const x = { ...(target === undefined ? {} : expectFrom(c.message, target)), ...c.expect };
  const checks: Record<string, boolean> = {};

  checks.parsed = e !== undefined;
  checks.lines = lifted.rejected.length === 0;
  if (e === undefined) {
    return { checks, retained: 0, dropped: contentWords(c.message), copied: [], order: 0 };
  }

  checks.names = !check(c.message, e).some((p) => p.includes("capital letter"));

  const asks = [...heads(e)].some((h) => INTERROGATIVES.has(asked(h)) || h === "Interrogative" || h === "Checking");
  const question = x.question ?? (looksLikeQuestion(c.message) ? true : undefined);
  if (question !== undefined) checks.question = asks === question;

  if (x.interrogative) {
    const wanted = Array.isArray(x.interrogative) ? x.interrogative : [x.interrogative];
    checks.interrogative = wanted.some((h) => [...heads(e)].some((x) => asked(x) === h));
  }

  const hay = haystack(e);
  for (const h of x.has ?? []) checks[`has:${h}`] = heads(e).has(h);
  for (const h of x.lacks ?? []) checks[`lacks:${h}`] = !heads(e).has(h);
  const text = format(e);
  for (const t of x.lacksText ?? []) checks[`lacksText:${t}`] = !text.includes(t);
  for (const w of x.keeps ?? []) checks[`keeps:${w}`] = survives(w, hay);
  if (x.refs !== undefined) checks.refs = count(e, "Ref") >= x.refs;
  for (const [h, n] of Object.entries(x.counts ?? {})) checks[`counts:${h}`] = count(e, h) >= n;

  // A digit stays a digit (`ir-spec.md` Part 9.7): 10 is 10, never Number("ten"). It may
  // also survive inside a string ("3pm") or a name (F3).
  const digits = x.digits ?? c.message.match(/\d+/g) ?? [];
  if (digits.length) {
    const nums = numbers(e).map(Math.abs);
    const names = [...heads(e)].join(" ");
    checks.digits = digits.every(
      (d) => nums.includes(Number(d)) || hay.text.includes(d) || names.includes(d),
    );
  }

  if (x.numbers?.length) {
    const got = numbers(e);
    checks.numbers = x.numbers.every((n) => got.includes(n));
  }

  const words = contentWords(c.message);
  const dropped = words.filter((w) => !survives(w, hay));
  return {
    checks,
    retained: words.length ? (words.length - dropped.length) / words.length : 1,
    dropped,
    copied: copiedNames(c.message, e, promptNames),
    match: target === undefined ? undefined : match(target, e),
    order: orderKept(c.message, e),
  };
}

/** Families, so `keeps:typescript` and `keeps:function` report as one row. */
export const family = (name: string): string => name.split(":")[0];

export const passed = (s: Score): boolean => Object.values(s.checks).every(Boolean);
