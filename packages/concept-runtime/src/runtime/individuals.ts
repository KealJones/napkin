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
): { expression: Expr; resolved: NameResolution[] } {
  const resolved: NameResolution[] = [];

  const walk = (e: Expr): Expr => {
    if (!isCall(e)) return e;
    const args = e.args.map((a) =>
      a.name === undefined ? { value: walk(a.value) } : { name: a.name, value: walk(a.value) },
    );
    // Already resolved by an earlier pass over this same expression: never overwritten.
    if (e.args.some((a) => a.name === "resolvedTo")) return call(e.head, args);
    const matches = findNamed(store, e.head);
    if (matches.length === 1) {
      resolved.push({ name: e.head, to: matches[0] });
      return call(e.head, [...args, { name: "resolvedTo", value: c(matches[0]) }]);
    }
    if (matches.length > 1) {
      ambiguities.push(
        `${e.head}() matched ${matches.length} individuals named "${e.head}": ${matches.join(", ")}`,
      );
    }
    return call(e.head, args);
  };

  return { expression: walk(expression), resolved };
}
