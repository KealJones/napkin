/**
 * A told message answered as it felt (packs/follows.ncon): what it felt like, said back, and what
 * it leads to. Kept apart from the turn, which names only core's Concepts.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { Runtime } from "./evaluator.js";
import { typesOf } from "./types.js";

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
  // Something bad going on in the life of the one talking is kept, to ask after later.
  const told = follows.args.find((a) => a.name === "told")?.value;
  const about = follows.args.find((a) => a.name === "about")?.value;
  if (typeof v === "number" && v <= -0.3 && typeof told === "string" && told && about === undefined) {
    runtime.store.addRelation("Me", call("Concern", [{ value: told }, { name: "valence", value: v }, { name: "at", value: new Date().toISOString() }]), undefined, runtime.trace.cause);
  }
  const said = text?.trim();
  // What the reply offered, ending on a question ("Do you want to talk about it?", "Do you want to
  // find a new job?"), kept with the words it was offered in, so a "yeah" next is taken as yes to it.
  if (said && said.endsWith("?") && about === undefined) {
    const wants = follows.args.find((a) => a.name === "wants")?.value;
    const offered = wants !== undefined && isCall(wants) && wants.args[0] ? wants.args[0].value : c("TalkingItOver");
    runtime.store.addRelation("Self", call("Offered", [{ value: offered }, { name: "said", value: said }]), undefined, runtime.trace.cause);
  }
  return said || undefined;
}

/**
 * A yes or no to what the last reply offered ("Do you want to talk about it?" "yeah"): answered as
 * an answer to that, by whether the words are an Agreement or a Refusal. Undefined when the last
 * reply offered nothing, or the message is neither.
 */
export async function offerAnswered(
  runtime: Runtime,
  message: string,
  lastSpoken: string | undefined,
  word: (runtime: Runtime, identity: string, input: Expr) => Promise<string | undefined>,
): Promise<string | undefined> {
  if (!lastSpoken || !runtime.store.has("OfferAnswered")) return undefined;
  const offer = [...runtime.store.asSubject("Self")].reverse().find((t) => t.predicate === "Offered" && isCall(t.expr) && t.expr.args.some((a) => a.name === "said" && a.value === lastSpoken.trim()));
  if (!offer || !isCall(offer.expr)) return undefined;
  const first = message.trim().toLowerCase().split(/[^a-z']+/).filter(Boolean)[0];
  if (!first) return undefined;
  const kinds = typesOf(runtime.store, c(first[0].toUpperCase() + first.slice(1)));
  const yes = kinds.includes("Agreement");
  const no = kinds.includes("Refusal");
  if (!yes && !no) return undefined;
  const what = offer.expr.args[0]?.value;
  if (what === undefined) return undefined;
  const text = await word(runtime, "RenderResponse", call("OfferAnswered", [{ value: what }, { value: c(yes ? "Agreement" : "Refusal") }])).catch(() => undefined);
  return text?.trim() || undefined;
}

/** What is going on with the one talking that Napkin has not asked after yet, newest first. */
export function openConcerns(runtime: Runtime): string[] {
  const asked = new Set(
    runtime.store.asSubject("Me").filter((t) => t.predicate === "CheckedIn" && isCall(t.expr)).map((t) => (isCall(t.expr) ? String(t.expr.args[0]?.value) : "")),
  );
  const out: string[] = [];
  for (const t of [...runtime.store.asSubject("Me")].reverse()) {
    if (t.predicate !== "Concern" || !isCall(t.expr)) continue;
    const told = t.expr.args[0]?.value;
    if (typeof told === "string" && !asked.has(told) && !out.includes(told)) out.push(told);
  }
  return out;
}

/**
 * Small talk ("hi", "how are you") with something bad going on that was told before: asked after,
 * once, the way a friend would ("How is your mom doing?"). Undefined when nothing is open, or the
 * answer is not small talk.
 */
export async function checkIn(
  runtime: Runtime,
  result: Expr | undefined,
  word: (runtime: Runtime, identity: string, input: Expr) => Promise<string | undefined>,
): Promise<string | undefined> {
  if (result === undefined || !isCall(result) || !runtime.store.has("CheckIn")) return undefined;
  const inner = result.head === "Answer" ? result.args[0]?.value : result;
  if (inner === undefined || !isCall(inner) || !typesOf(runtime.store, inner).includes("SmallTalk")) return undefined;
  const told = openConcerns(runtime)[0];
  if (!told) return undefined;
  const text = await word(runtime, "RenderResponse", call("CheckIn", [{ value: told }])).catch(() => undefined);
  if (!text?.trim()) return undefined;
  runtime.store.addRelation("Me", call("CheckedIn", [{ value: told }]), undefined, runtime.trace.cause);
  return text.trim();
}
