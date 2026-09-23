/**
 * Grammatical mood, read off the surface of a sentence, so the Ears does not have to mark
 * it. Mood is grammar, not use (`AGENTS.md`): "could you close the door" is a question in
 * form, whatever it is for. Written as `Mood(kind, line)`, a name that says what it does, so a user
 * saying "imperative" or "do" collides with nothing (`design/reading-spec.md`).
 *
 * This only ever ADDS: a line that already has a mood, or that is a marker, is left exactly
 * as written. And it only acts where a line can be tied to its sentence without guessing:
 * when the message is one sentence, or when there are exactly as many open lines as
 * sentences, in order.
 */
import { parse } from "../concept/expression.js";
import { repairs, splitTopLevel } from "./lift.js";

export type Mood = "Interrogative" | "Checking" | "Imperative" | "Declarative";

/**
 * Whether lift can make a line parse, with the same repairs it will apply. A line nothing can
 * save is left alone: wrapping it first would only hide it.
 */
const parses = (line: string): boolean =>
  repairs.some((repair) => {
    try {
      parse(repair(line.replace(/^\$[A-Za-z_]\w*\s*=\s*/, "")));
      return true;
    } catch {
      return false;
    }
  });

const LEADING = /^(ok|okay|so|basically|also|and|but|then|first|now|yeah|well|hey|no|wait|thanks|hmm|um|uh)\b[,!]?\s*/;
const INTERJECTION = /^(hey there|hi there|hello|hi|hey|thanks|thank you|thx|ty|lol|lmao|ok|okay|cool|sick|nice)[\s!.?]*$/;
const WH = /^(what|what's|whats|who|who's|when|where|why|how|which|whether)\b/;
const AUX = /^(is|are|was|were|do|does|did|can|could|would|will|should|have|has|am)\b/;
const TAG = /,\s*(right|no|yeah|yes|ok|okay|correct|huh)\s*\?+\s*$/;
const SUBJECT = /^(i|i'm|im|i've|ive|i'd|we|we're|you're|he|she|they|it|it's|its|my|our|his|her|their|the|a|an|this|that|these|those|there|there's|[a-z]+'s)\b/;
const VERB_SECOND = /^(is|was|are|were|has|have|had|keeps|needs|likes|said|went|did)$/;

/** The mood of one sentence, or undefined when it has none (an interjection, a fragment). */
export function mood(sentence: string): Mood | undefined {
  let t = sentence.trim().toLowerCase();
  if (INTERJECTION.test(t)) return undefined;
  while (LEADING.test(t)) t = t.replace(LEADING, "");
  if (!/[a-z]/.test(t)) return undefined;
  if (/^(please|do not|don'?t|let'?s)\b/.test(t)) return "Imperative";
  // "do the dishes" is an order; "do you know" is a question. Without a "?", a leading
  // do/does/did asks only when a subject pronoun follows it.
  if (/^(do|does|did)\b/.test(t) && !/\?\s*$/.test(t) && !/^(do|does|did)\s+(i|you|we|they|he|she|it)\b/.test(t)) return "Imperative";
  if (WH.test(t) || AUX.test(t)) return "Interrogative";
  // Statement word order with only a "?" or a tag to mark it: a check, not an open question.
  if (TAG.test(t) || /\?\s*$/.test(t)) return "Checking";
  if (SUBJECT.test(t)) return "Declarative";
  if (VERB_SECOND.test(t.split(/\s+/)[1] ?? "")) return "Declarative";
  return "Imperative";
}

/** A trailing "!" or "??" stresses the whole sentence; returns the marks, verbatim. */
export const emphatic = (sentence: string): string | undefined => /(!+|\?\?+)\s*$/.exec(sentence.trim())?.[1];

/** Sentences of a message, with fenced blocks and list markers removed. */
export function sentences(message: string): string[] {
  return message
    .replace(/```[\s\S]*?```/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*([-*]|\d+[.)]|#+)\s*/, ""))
    .filter((s) => /[a-z]/i.test(s));
}

/** Lines that already carry a mood or are markers, which a mood never wraps. */
const SETTLED = /^(Mood|Whether|MarkAside|Heading|Item|Block|InlineCode|Unclear|Ref|MarkCorrection)\(/;

/** Add `Mood(kind, line)`, and `Emphasis` for a stressed sentence, to each open line. */
export function frame(raw: string, message: string): string {
  const lines = raw.split("\n").flatMap((l) => splitTopLevel(l.trim()));
  const open = lines
    .map((line, i) => ({ line: line.trim(), i }))
    .filter(({ line }) => line && !/^\$[A-Za-z_]\w*\s*=/.test(line) && !SETTLED.test(line) && parses(line));
  if (!open.length) return raw;

  const said = sentences(message);
  let chosen: (string | undefined)[];
  if (said.length === 1) chosen = open.map(() => said[0]);
  else if (said.length === open.length) chosen = said;
  // More lines than sentences, or fewer: tie each line to the sentence it shares the most
  // words with, which works because the Ears keeps the user's words. A line that shares
  // nothing, or ties between sentences, is left unframed.
  else chosen = open.map(({ line }) => closest(line, said));

  open.forEach(({ line, i }, k) => {
    const sentence = chosen[k];
    if (sentence === undefined) return;
    const marks = emphatic(sentence);
    let out = marks && !line.startsWith("MarkEmphasis(") ? `MarkEmphasis(${JSON.stringify(marks)}, ${line})` : line;
    const m = mood(sentence);
    if (m) out = `Mood(${m}(), ${out})`;
    lines[i] = out;
  });
  return lines.join("\n");
}

const wordsOf = (text: string): string[] =>
  (text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3);

function closest(line: string, said: string[]): string | undefined {
  const mine = wordsOf(line);
  const scores = said.map((s) => {
    const theirs = wordsOf(s);
    return mine.filter((w) => theirs.some((t) => t.slice(0, 5) === w.slice(0, 5))).length;
  });
  const best = Math.max(0, ...scores);
  if (best === 0 || scores.filter((n) => n === best).length > 1) return undefined;
  return said[scores.indexOf(best)];
}
