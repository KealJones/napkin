/**
 * Resolving a proper-name head to the individual that holds it, through `Named`
 * (memory-spec Part 3.2, Part 8.3; reading-spec.md R18).
 *
 * A proper name parses as an ordinary nullary head, the same shape as any other Concept
 * reference: "greg" is `Greg()`, exactly the way "chess" is `Chess()`. Nothing in the shape
 * tells them apart. What does is whether the graph holds an individual `Named` that text --
 * a kind is never `Named`, only an individual is, so the lookup itself is the test, and a
 * kind head simply never matches.
 *
 * Modelled on `references.ts`'s `resolveReferences`: resolution runs once, at write time,
 * over the parse that is about to become a `Said` (memory-spec Part 8.3), and what it found
 * is recorded in place, on the head itself, the same way a resolved `Ref` is.
 */
import { type Expr, call, c, isCall } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { objectKey } from "../store/store.js";

/** Every individual holding `Named(text)`, through the object index -- never by identity. */
export function findNamed(store: ConceptStore, text: string): string[] {
  const key = objectKey(text);
  if (key === undefined) return [];
  return store
    .asObject(key)
    .filter((t) => t.predicate === "Named")
    .map((t) => t.subject);
}

export interface NameResolution {
  readonly name: string;
  readonly to: string;
}

/**
 * Rewrites every proper-name head with what it resolved to, or leaves it exactly as said.
 *
 * A name is not always nullary. "greg called" is `Greg(Called())` (reading-spec R18): the
 * subject is implicit, so the name is the HEAD of the call and its claim is the argument,
 * the same convention a stored relation uses. "that meme Greg sent" nests it instead, as a
 * plain argument, `Greg()`. Both are the same shape from here: whatever a call's head is,
 * it is worth a `Named` lookup, so resolution checks every head, not only leaf ones, and
 * adds what it found as one more argument rather than replacing the ones already there.
 *
 * - **Zero matches** leaves the head untouched. Reading never mints (Part 6.2): an
 *   unresolved name is not an error, it stays a description inside `Said` until something
 *   needs it to be more (Part 6.3).
 * - **One match** rewrites `Greg(Called())` to `Greg(Called(), resolvedTo=Greg_1())`,
 *   visible in place the way `Ref(..., resolvedTo=...)` is.
 * - **Two or more matches** is genuine ambiguity (Part 6.5, concept-spec Part 9.5): picking
 *   one would silently attach a claim to the wrong Greg, so nothing is picked. It is
 *   surfaced through the same ambiguity channel selection already uses, and an explicit
 *   description elsewhere in the message is what a later pass would use to break the tie.
 */
export function resolveNames(
  store: ConceptStore,
  expression: Expr,
  ambiguities: string[],
  chosen: ReadonlyMap<string, string> = new Map(),
): { expression: Expr; resolved: NameResolution[] } {
  const resolved: NameResolution[] = [];

  const walk = (e: Expr): Expr => {
    if (!isCall(e)) return e;
    const args = e.args.map((a) =>
      a.name === undefined ? { value: walk(a.value) } : { name: a.name, value: walk(a.value) },
    );
    // Already resolved by an earlier pass over this same expression: never overwritten.
    if (e.args.some((a) => a.name === "resolvedTo")) return call(e.head, args);
    const picked = chosen.get(e.head);
    const matches = picked ? [picked] : findNamed(store, e.head);
    if (matches.length === 1) {
      resolved.push({ name: e.head, to: matches[0] });
      return call(e.head, [...args, { name: "resolvedTo", value: c(matches[0]) }]);
    }
    if (matches.length > 1) {
      ambiguities.push(
        `${e.head}() matched ${matches.length} individuals named "${e.head}": ${matches.join(", ")}`,
      );
      // Marked in place, so the turn asks rather than attaching the claim to either.
      return call(e.head, [...args, { name: "ambiguous", value: call("List", matches.map((m) => ({ value: c(m) }))) }]);
    }
    return call(e.head, args);
  };

  return { expression: walk(expression), resolved };
}

/**
 * A result as the Mouth should say it. A minted identity means nothing and must not be
 * read (memory-spec Part 3.2), so an individual is said by its name, and the user as the
 * person being spoken to. The result itself keeps the identities; only its rendering loses
 * them.
 */
export function forSaying(store: ConceptStore, e: Expr): Expr {
  if (!isCall(e)) return e;
  // A line's mood is how it was said, not what it says.
  if (e.head === "Mood" && e.args.length === 2) return forSaying(store, e.args[1].value);
  // A description keeps every sense, but when some facts hold in any context those are
  // what the word means to someone who named no sense, and the rest is noise to say:
  // "chess is a board game", not "also a musical and a surname".
  const listed = e.head === "Describes" ? e.args[1]?.value : undefined;
  if (listed !== undefined && isCall(listed) && listed.head === "List") {
    // A namesake learned flat, before namesakes were told apart, is still a namesake:
    // "IsA(ElectronicGame())" beside "IsA(Landform())" is the game called Volcano.
    const namesake = (v: Expr): boolean => {
      if (!isCall(v) || v.head !== "IsA") return false;
      const kind = v.args[0]?.value;
      return kind !== undefined && isCall(kind) && store.asObject(kind.head).some((t) => t.subject === "Namesake" && t.predicate === "Covers");
    };
    const general = listed.args.filter((a) => !(isCall(a.value) && a.value.head === "In") && !namesake(a.value));
    if (general.length && general.length < listed.args.length) {
      return forSaying(store, call("Describes", [e.args[0], { value: call("List", general) }]));
    }
  }
  // What a name resolved to is for memory, not for saying, and a name is already how the
  // thing it names is said.
  const args = e.args
    .filter((a) => a.name !== "resolvedTo" && !(isCall(a.value) && a.value.head === "Named"))
    .map((a) => ({ ...a, value: forSaying(store, a.value) }));
  if (e.args.length === 0) {
    const unit = store.get(e.head);
    if (unit?.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0]?.value) && (r.claim.args[0].value as { head: string }).head === "User")) {
      return c("Me");
    }
    const name = store.asSubject(e.head).find((t) => t.predicate === "Named")?.object;
    if (typeof name === "string") return c(name.replace(/\s+(\w)/g, (_, ch: string) => ch.toUpperCase()));
  }
  return call(e.head, args);
}

const PRONOUNS = new Set(["He", "She", "Him", "Her"]);

/**
 * "what does he like": a third-person pronoun points at the individual talked about last,
 * found through the time index in what was said recently and recorded in place, once, the
 * way a name is (memory-spec Part 8.3). The user is never "he". With nobody recent it stays
 * as said.
 */
export function resolvePronouns(store: ConceptStore, expression: Expr, withinMs = 30 * 60_000): Expr {
  const now = new Date();
  const recent = store.between(new Date(now.getTime() - withinMs).toISOString(), now.toISOString()).reverse();
  let latest: string | undefined;
  const find = (e: Expr): void => {
    if (latest || !isCall(e)) return;
    const to = e.args.find((a) => a.name === "resolvedTo")?.value;
    if (to !== undefined && isCall(to) && e.head !== "Ref") {
      latest = to.head;
      return;
    }
    for (const a of e.args) find(a.value);
  };
  // A minted individual something was just recorded about ("greg is my coworker" stamps
  // Greg_1), or one a recent message named. Not the user, and not the system.
  const minted = (identity: string): boolean =>
    /_\d+$/.test(identity) &&
    !store.asSubject(identity).some((t) => t.predicate === "IsA" && t.object !== undefined && isCall(t.object) && t.object.head === "User");
  for (const entry of recent) {
    if (minted(entry.identity)) latest = entry.identity;
    else if (isCall(entry.relation.claim) && entry.relation.claim.head === "Said") find(entry.relation.claim);
    if (latest) break;
  }
  if (!latest) return expression;
  const walk = (e: Expr): Expr => {
    if (!isCall(e)) return e;
    const pointing =
      (PRONOUNS.has(e.head) && e.args.length === 0) ||
      (e.head === "Ref" && e.args.length === 1 && typeof e.args[0].value === "string" && /^(he|she|him|her)$/i.test(e.args[0].value));
    if (pointing) return call(e.head, [...e.args, { name: "resolvedTo", value: c(latest!) }]);
    return call(e.head, e.args.map((a) => ({ ...a, value: walk(a.value) })));
  };
  return walk(expression);
}

const spokenName = (head: string): string => head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/**
 * How to tell one individual from another by what is lasting about them (memory-spec
 * Part 7.7): "your coworker", "who likes cats". Their name is the same, so it says nothing.
 */
export function describeIndividual(store: ConceptStore, identity: string): string {
  const user = store.asObject("User").find((t) => t.predicate === "IsA")?.subject;
  for (const t of store.asSubject(identity)) {
    if (t.predicate === "Named" || t.context !== undefined) continue;
    const object = t.object !== undefined && isCall(t.object) ? t.object.head : undefined;
    if (t.predicate.endsWith("Of") && object === user) return `your ${spokenName(t.predicate.slice(0, -2))}`;
    if (t.predicate === "IsA" && object) return `the ${spokenName(object)}`;
    if (object) return `who ${spokenName(t.predicate)} ${spokenName(object)}`;
  }
  return identity;
}

/**
 * A reading with a name that matched more than one individual becomes the question of
 * which one was meant, carrying the words so the answer can re-read them (memory-spec
 * Part 6.5: genuine ambiguity asks rather than guesses).
 */
export function whichOf(store: ConceptStore, expression: Expr, said: string): Expr | undefined {
  let which: Expr | undefined;
  const find = (e: Expr): void => {
    if (which || !isCall(e)) return;
    const options = e.args.find((a) => a.name === "ambiguous")?.value;
    if (options !== undefined && isCall(options)) {
      const ids = options.args.map((a) => a.value).filter(isCall).map((v) => v.head);
      which = call("Which", [
        { value: c(e.head) },
        { value: call("List", ids.map((id) => ({ value: c(id) }))) },
        { name: "described", value: call("List", ids.map((id) => ({ value: describeIndividual(store, id) }))) },
        { name: "said", value: said },
      ]);
      return;
    }
    for (const a of e.args) find(a.value);
  };
  find(expression);
  return which;
}

/**
 * The answer to a Which asked last turn: the one whose description the reply uses, or
 * "the first" / "the second". Undefined when the reply picks none, and the message is then
 * read as a message of its own.
 */
export function answerToWhich(
  lastResult: string | undefined,
  message: string,
  parse: (s: string) => Expr,
): { name: string; chosen: string; said: string } | undefined {
  if (!lastResult?.startsWith("Which(")) return undefined;
  let asked: Expr;
  try {
    asked = parse(lastResult);
  } catch {
    return undefined;
  }
  if (!isCall(asked)) return undefined;
  const name = asked.args[0]?.value;
  const ids = asked.args[1]?.value;
  const described = asked.args.find((a) => a.name === "described")?.value;
  const said = asked.args.find((a) => a.name === "said")?.value;
  if (name === undefined || ids === undefined || described === undefined || !isCall(name) || !isCall(ids) || !isCall(described) || typeof said !== "string") return undefined;
  const words = new Set(message.toLowerCase().match(/[a-z]+/g) ?? []);
  const ORDINALS = ["first", "second", "third", "fourth"];
  const candidates = ids.args.map((a, i) => ({ id: isCall(a.value) ? a.value.head : "", text: String(described.args[i]?.value ?? "") }));
  const byOrder = candidates.findIndex((_, i) => words.has(ORDINALS[i]));
  const byWords = candidates.filter((cand) => cand.text.split(" ").some((w) => w.length > 3 && words.has(w)));
  const pick = byOrder >= 0 ? candidates[byOrder] : byWords.length === 1 ? byWords[0] : undefined;
  return pick ? { name: name.head, chosen: pick.id, said } : undefined;
}
