/**
 * A told message answered as it felt (packs/follows.ncon): what it felt like, said back, and what
 * it leads to. Kept apart from the turn, which names only core's Concepts.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { Runtime } from "./evaluator.js";

/** A result that only kept what was told (believed, noted, stated): nothing was asked. */
export const keptOnly = (e: Expr | undefined): boolean =>
  e !== undefined && isCall(e) && (e.head === "Believed" || e.head === "Noted" || e.head === "Stated" || (e.head === "Sequence" && e.args.every((a) => keptOnly(a.value))));

/**
 * What a told message felt like and leads to, worded by the graph, when it felt clearly one way or
 * led somewhere. Undefined for a question, or a message that felt nothing much.
 */
export async function feltReply(
  runtime: Runtime,
  message: string,
  word: (runtime: Runtime, identity: string, input: Expr) => Promise<string | undefined>,
): Promise<string | undefined> {
  if (message.includes("?") || !runtime.store.has("Follows")) return undefined;
  const follows = await runtime.evaluate(call("Follows", [{ value: message }]), c("Execution")).catch(() => undefined);
  if (follows === undefined || !isCall(follows) || follows.head !== "Follows") return undefined;
  const v = follows.args.find((a) => a.name === "valence")?.value;
  const led = follows.args.some((a) => a.name === "causes" || a.name === "wants");
  if (!led && (typeof v !== "number" || Math.abs(v) < 0.2)) return undefined;
  const text = await word(runtime, "RenderResponse", follows).catch(() => undefined);
  return text?.trim() || undefined;
}
