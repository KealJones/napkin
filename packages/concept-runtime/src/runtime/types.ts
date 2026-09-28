/**
 * Whether a value is of a type (concept-spec Part 6.7). A type is anything IsA can point at, and
 * is written like a pattern whose holes are types: a Concept (`Number()`, `Someone()`), a list
 * with a type in each position (`List(String(), Number())`), a repeating tail (`List(Rest(Number()))`
 * is any number of numbers), or either of several (`OneOf(Number(), String())`). A number is a
 * Number, text a String, true and false Booleans; a call is what its head is, through IsA and
 * SubclassOf. Nothing here names a type of thing in the world: only the shapes a type can take.
 */
import { type Expr, equal, format, isCall } from "../concept/expression.js";
import type { Bindings } from "../concept/match.js";
import type { ConceptStore } from "../store/store.js";

const positional = (e: Expr): Expr[] => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);

/** What a value is, most particular first: its own head or primitive, then what it is through IsA. */
function typesOf(store: ConceptStore, value: Expr): string[] {
  const own = typeof value === "number" ? "Number" : typeof value === "string" ? "String" : typeof value === "boolean" ? "Boolean" : isCall(value) ? value.head : undefined;
  if (own === undefined) return [];
  // Through IsA and SubclassOf, to types nothing more is known of too (Animal, with no unit).
  const out = [own];
  for (let i = 0; i < out.length && out.length < 64; i++) {
    for (const r of store.get(out[i])?.relations ?? []) {
      const parent = isCall(r.claim) && (r.claim.head === "IsA" || r.claim.head === "SubclassOf") ? r.claim.args[0]?.value : undefined;
      if (parent !== undefined && isCall(parent) && !out.includes(parent.head)) out.push(parent.head);
    }
  }
  return out;
}

export function isType(store: ConceptStore, value: Expr, type: Expr): boolean {
  if (!isCall(type)) return equal(value, type);
  const parts = positional(type);
  if (type.head === "OneOf") return parts.some((t) => isType(store, value, t));
  // A list, position by position, as a pattern reads one: List(A, B) is two, Rest(C) the rest.
  if (type.head === "List" && type.args.every((a) => a.name === undefined)) {
    if (!isCall(value) || value.head !== "List") return false;
    const items = positional(value);
    let at = 0;
    for (const t of parts) {
      if (isCall(t) && t.head === "Rest") return items.slice(at).every((v) => isType(store, v, positional(t)[0] ?? t));
      if (at >= items.length || !isType(store, items[at], t)) return false;
      at++;
    }
    return at === items.length;
  }
  // A type with more said of it: what a thing's own IsA says it is, exactly.
  if (type.args.length) {
    if (!isCall(value)) return false;
    return (store.get(value.head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && format(r.claim.args[0]?.value) === format(type));
  }
  return typesOf(store, value).includes(type.head);
}

/**
 * Whether every variable a realization types (`types = Types(a = Number())`, each named for its
 * variable) holds a value of its type. A variable the pattern did not bind, or one not typed,
 * takes anything.
 */
export function typesHold(store: ConceptStore, types: Expr | undefined, bindings: Bindings): boolean {
  if (types === undefined || !isCall(types)) return true;
  for (const a of types.args) {
    if (a.name === undefined) continue;
    const value = bindings.get(a.name);
    if (value !== undefined && !isType(store, value, a.value)) return false;
  }
  return true;
}
