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
If the result is Describes(Thing(), List(...)), describe the thing using only those facts.

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
  const absent = gaps.filter((g) => g.kind === "unknown").map((g) => g.identity);
  const inert = gaps.filter((g) => g.kind !== "unknown").map((g) => g.identity);
  const parts: string[] = [];
  if (absent.length) parts.push(`I do not know ${absent.join(", ")}.`);
  if (inert.length) parts.push(`I do not know how to ${inert.join(", ")}.`);
  return ["I could not work that out.", ...parts].join(" ");
}

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
  // failed to.
  if (options.unrealized?.length) return unresolved(message, result, options.unrealized);

  const prompt = `The message was: ${message}\n\nThe result is: ${format(result)}\n\nSay it.`;
  try {
    const text = await generate(SYSTEM, prompt, options);
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || format(result);
  } catch {
    // Rendering is a convenience; the result is the answer, so fall back to showing it.
    return format(result);
  }
}
