/**
 * The Mouth: render a computed Concept result as a sentence.
 *
 * The model renders; it does not decide. It is given the original message and the result
 * the graph produced, and told to say that result and nothing else — so the answer stays
 * the graph's answer rather than the model's recollection.
 */
import { type Expr, format, isCall, walk } from "../concept/expression.js";
import { ANON } from "../concept/match.js";
import { generate, type ModelOptions } from "./ollama.js";

const SYSTEM = `You put a computed result into one short sentence.

The result was produced by a Concept network, not by you. Say what it says. Do not add
facts, do not hedge, do not explain the notation, and do not mention Concepts.

If the result is Answer(x), say x.
If the result is Answer(True()), answer yes by stating what was asked as a fact.
If the result is Answer(False()), answer no by stating the opposite as a fact.
If the result is Answer(UnknownTruth()), say you do not know yet, naming what was asked.
If the result is Describes(Thing(), List(...)), describe the thing using only those facts.
Every fact in the list is about the thing: Describes(Greg(), List(CoworkerOf(Me()))) means
Greg is your coworker.
A fact written In(fact, Sense()) holds only in that sense. Lead with the facts that are not
wrapped in In, and if there are any, give the other senses at most a short "it is also".
Me() in a result is the person you are talking to, so it is "you" when you say it.
If the result is Believed(x, List(...)), say briefly that you will remember it, saying the
facts back in plain words. If the result is Noted(x), acknowledge it in a few words and
say it back to them, for example "Got it, you ate an apple."

Reply with the sentence only. No preamble, no markdown, no quotes around it.`;

/**
 * A residual is not an answer. Narrating one as though it were is how a system starts
 * saying things it has not worked out — the studio once reported "the result is a command
 * to convert the current timestamp", which is a description of an expression that never
 * ran. So an unrealized result is never handed to the model at all.
 */
function unresolved(message: string, result: Expr, gaps: readonly Unrealized[]): string {
  // Not knowing a Concept and not knowing how to DO one are different admissions, and
  // saying "I do not know Choose" about a Concept it had just learned was the wrong one.
  const absent = gaps.filter((g) => g.kind === "unknown").map((g) => words(g.identity));
  const inert = gaps.filter((g) => g.kind !== "unknown").map((g) => words(g.identity));
  const parts: string[] = [];
  if (absent.length) parts.push(`I don't know what ${list(absent)} ${absent.length > 1 ? "are" : "is"} yet.`);
  if (inert.length) parts.push(`I don't know how to ${list(inert)} yet.`);
  return parts.length ? parts.join(" ") : "I could not work that out.";
}

/** A Concept's name as the words it came from: `GrannySmith` is "granny smith". */
const words = (identity: string): string => identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

const list = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/**
 * When the answer is. Read off the Concepts that were asked for, not off the English: a
 * shift forward is future whatever words carried it, and "what time will it be in 5 hours"
 * answered "It is 4:02 PM" because the copula was hardcoded.
 */
const AHEAD = new Set(["Tomorrow", "DayAfter", "HourAfter", "Later", "After"]);
const BEHIND = new Set(["Yesterday", "DayBefore", "HourBefore", "Earlier", "Before", "Ago"]);
const SHIFTS = new Set(["ShiftHours", "ShiftDays"]);

export function tense(asked: Expr | undefined): "is" | "will be" | "was" {
  if (asked === undefined) return "is";
  let answer: "is" | "will be" | "was" = "is";
  for (const node of walk(asked)) {
    if (!isCall(node)) continue;
    if (SHIFTS.has(node.head)) {
      // The sign of the shift is the tense. Nothing else needs to know about time.
      const by = node.args[1]?.value;
      if (typeof by === "number" && by !== 0) answer = by > 0 ? "will be" : "was";
      continue;
    }
    if (AHEAD.has(node.head)) answer = "will be";
    else if (BEHIND.has(node.head)) answer = "was";
  }
  return answer;
}

/**
 * A date or a clock time is worth rendering directly: the model adds nothing and can get
 * it wrong. A `spoken` field is a rendering the graph already chose, so it wins outright —
 * that is the whole reason Format carries one instead of collapsing to a string.
 */
function direct(result: Expr, when: "is" | "will be" | "was"): string | undefined {
  const answer = isCall(result) && result.head === "Answer" ? result.args[0]?.value : result;
  if (!answer || !isCall(answer)) return undefined;
  if (answer.head !== "Date" && answer.head !== "Time") return undefined;
  const field = (name: string): string | number | undefined => {
    const found = answer.args.find((a) => a.name === name)?.value;
    return typeof found === "string" || typeof found === "number" ? found : undefined;
  };

  const spoken = field("spoken");
  if (answer.head === "Time") {
    if (spoken !== undefined) return `It ${when} ${spoken}.`;
    const hour = field("hour");
    const minute = field("minute");
    if (hour === undefined || minute === undefined) return undefined;
    return `It ${when} ${hour}:${String(minute).padStart(2, "0")}.`;
  }

  if (spoken !== undefined) return `${spoken}.`;
  const year = field("year");
  const month = field("month");
  const day = field("day");
  const weekday = field("weekday");
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const name = months[Number(month) - 1] ?? String(month);
  return `${weekday ? `${weekday}, ` : ""}${name} ${day}, ${year}.`;
}

/**
 * An anonymous unknown that survived evaluation is the system missing an INPUT, not an
 * answer and not a failure. The honest response is the question it implies. Handing the
 * residual to the model instead got "The result is an unbound variable named _".
 */
function question(result: Expr): string | undefined {
  let asked: string | undefined;
  const find = (e: Expr): void => {
    if (!isCall(e)) return;
    const direct = e.args.some(
      (a) => typeof a.value === "object" && a.value !== null && "variable" in a.value && a.value.variable === ANON,
    );
    // Innermost wins: the deepest call holding the unknown is the one missing its values.
    if (direct) asked = e.head;
    for (const a of e.args) find(a.value);
  };
  find(result);
  if (!asked) return undefined;
  const verb = asked.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return `What should I ${verb}?`;
}

export interface Unrealized {
  readonly identity: string;
  readonly kind: "unknown" | "inert" | "reference";
}

export interface SayOptions extends ModelOptions {
  /** What the graph could not realize. Its presence means this is not an answer. */
  unrealized?: readonly Unrealized[];
  /**
   * The result still contains an expression that never ran.
   *
   * Separate from `unrealized`, because a result can be entirely uncomputed with nothing
   * learnable about it -- an unresolved Ref explains every residual above it, and a Ref is
   * a Marker. That combination handed the model an unevaluated comparison and it answered
   * from its own knowledge, correctly, which is worse than answering wrongly.
   */
  uncomputed?: boolean;
  /** What was asked, so the answer can be placed in time the way the question was. */
  asked?: Expr;
}

export async function say(
  message: string,
  result: Expr,
  options: SayOptions = {},
): Promise<string> {
  const straightforward = direct(result, tense(options.asked));
  if (straightforward) return straightforward;

  const asking = question(result);
  if (asking) return asking;

  // Say plainly that it did not work out, rather than describing the expression that
  // failed to, or worse, answering it from memory.
  if (options.unrealized?.length || options.uncomputed) {
    return unresolved(message, result, options.unrealized ?? []);
  }

  const prompt = `The message was: ${message}\n\nThe result is: ${format(result)}\n\nSay it.`;
  try {
    const text = await generate(SYSTEM, prompt, options);
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || format(result);
  } catch {
    // Rendering is a convenience; the result is the answer, so fall back to showing it.
    return format(result);
  }
}
