/**
 * The Mouth: render a computed Concept result as a sentence.
 *
 * The model renders; it does not decide. It is given the original message and the result
 * the graph produced, and told to say that result and nothing else — so the answer stays
 * the graph's answer rather than the model's recollection.
 */
import { type Expr, format, isCall } from "../concept/expression.js";
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
function unresolved(message: string, result: Expr, gaps: readonly string[]): string {
  const missing = gaps.length ? ` I do not know ${gaps.join(", ")}.` : "";
  return `I could not work that out.${missing}`;
}

/** A date is worth rendering directly: the model adds nothing and can get it wrong. */
function direct(result: Expr): string | undefined {
  const answer = isCall(result) && result.head === "Answer" ? result.args[0]?.value : result;
  if (!answer || !isCall(answer) || answer.head !== "Date") return undefined;
  const field = (name: string): string | number | undefined => {
    const found = answer.args.find((a) => a.name === name)?.value;
    return typeof found === "string" || typeof found === "number" ? found : undefined;
  };
  const year = field("year");
  const month = field("month");
  const day = field("day");
  const weekday = field("weekday");
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const name = months[Number(month) - 1] ?? String(month);
  return `${weekday ? `${weekday}, ` : ""}${name} ${day}, ${year}.`;
}

export interface SayOptions extends ModelOptions {
  /** Identities the graph could not realize. Their presence means this is not an answer. */
  unrealized?: readonly string[];
}

export async function say(
  message: string,
  result: Expr,
  options: SayOptions = {},
): Promise<string> {
  const straightforward = direct(result);
  if (straightforward) return straightforward;

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
