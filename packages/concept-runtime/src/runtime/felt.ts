/**
 * A told message answered as it felt (packs/follows.ncon): what it felt like, said back, and what
 * it leads to. Kept apart from the turn, which names only core's Concepts.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { Runtime } from "./evaluator.js";
import { typesOf } from "./types.js";
import { words } from "./host.js";

/** Whether a message asks, "?" or not: it starts with a question word or a helper ("what is ...", "is it ..."). */
export const asks = (store: Runtime["store"], message: string): boolean => {
  if (message.includes("?")) return true;
  const first = message.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  if (!first) return false;
  const kinds = typesOf(store, c(first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()));
  return kinds.includes("Interrogative") || kinds.includes("QuestionWord") || kinds.includes("Helper");
};

/** Whether a message tells of something that happened (a doing, not "is"): news, felt more readily than a fact kept. */
export const happened = (message: string): boolean =>
  words(message).some((w) => w.tags.includes("Verb") && !w.tags.includes("Copula") && !w.tags.includes("Auxiliary"));

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
  /** How strongly it must feel: a fact kept ("my favorite color is blue") needs more than news does. */
  least = 0.2,
): Promise<string | undefined> {
  if (message.includes("?") || !runtime.store.has("Follows")) return undefined;
  const follows = await runtime.evaluate(call("Follows", [{ value: message }]), c("Execution")).catch(() => undefined);
  if (follows === undefined || !isCall(follows) || follows.head !== "Follows") return undefined;
  const v = follows.args.find((a) => a.name === "valence")?.value;
  const led = follows.args.some((a) => a.name === "causes" || a.name === "wants");
  if (!led && (typeof v !== "number" || Math.abs(v) < least)) return undefined;
  const text = await word(runtime, "RenderResponse", follows).catch(() => undefined);
  return text?.trim() || undefined;
}

/** The Follows a turn answered with, wherever it is in the result (a Noted's reply, or the reply itself). */
export function followsIn(result: Expr | undefined): Expr | undefined {
  if (result === undefined || !isCall(result)) return undefined;
  if (result.head === "Follows" && result.args.length) return result;
  for (const a of result.args) {
    const f = followsIn(a.value);
    if (f) return f;
  }
  return undefined;
}

/**
 * After a reply about something told: something bad going on in the life of the one talking is
 * kept, to ask after later (`Concern`); and what the reply offered, ending on a question ("Do you
 * want to talk about it?"), is kept with the words it was said in, so a "yeah" next answers it.
 */
export async function remember(runtime: Runtime, message: string, result: Expr | undefined, spoken: string, felt: boolean): Promise<void> {
  let follows = followsIn(result);
  // Only a reply about what was told keeps anything: one that said "Got it." keeps nothing.
  if (!follows && !felt) return;
  if (!follows && !message.includes("?") && runtime.store.has("Follows")) {
    const f = await runtime.evaluate(call("Follows", [{ value: message }]), c("Execution")).catch(() => undefined);
    if (f !== undefined && isCall(f) && f.head === "Follows" && f.args.length) follows = f;
  }
  if (!follows || !isCall(follows)) return;
  const arg = (n: string) => (isCall(follows!) ? follows!.args.find((a) => a.name === n)?.value : undefined);
  const v = arg("valence");
  const told = arg("told");
  const about = arg("about");
  if (about !== undefined) return;
  const said = spoken.trim();
  if (typeof v === "number" && v <= -0.3 && typeof told === "string" && told) {
    runtime.store.addRelation("Me", call("Concern", [{ value: told }, { name: "valence", value: v }, { name: "at", value: new Date().toISOString() }]), undefined, runtime.trace.cause);
  }
  // A yes-or-no question ("Do you want to talk about it?", led by a helper word): "yeah" answers it.
  // "How are you holding up?" is not one.
  const question = said.split(/(?<=[.!?])\s+/).pop() ?? "";
  const lead = question.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  const yesNo = !!lead && typesOf(runtime.store, c(lead.charAt(0).toUpperCase() + lead.slice(1).toLowerCase())).includes("Helper");
  if (said.endsWith("?") && yesNo) {
    const wants = arg("wants");
    const offered = wants !== undefined && isCall(wants) && wants.args[0] ? wants.args[0].value : c("TalkingItOver");
    runtime.store.addRelation("Self", call("Offered", [{ value: offered }, { name: "said", value: said }]), undefined, runtime.trace.cause);
  }
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

/**
 * Asked of Napkin to do something ("can you help me build a web app?"): a helper word put to the
 * one spoken to (a word that `Refers(Self())`), in what was heard.
 */
export function askedOfNapkin(store: Runtime["store"], heard: Expr | undefined): boolean {
  if (heard === undefined) return false;
  const refersToSelf = (e: Expr): boolean =>
    isCall(e) && store.asSubject(e.head).some((t) => t.predicate === "Refers" && t.object !== undefined && isCall(t.object) && (t.object as { head: string }).head === "Self");
  const walk = (e: Expr): boolean => {
    if (!isCall(e)) return false;
    if (typesOf(store, c(e.head)).includes("Helper") && e.args[0] !== undefined && refersToSelf(e.args[0].value)) return true;
    return e.args.some((a) => walk(a.value));
  };
  return walk(heard);
}
