/**
 * Whether a value is of a kind (concept-spec Part 4.5). A kind is what IsA takes: a Concept
 * (`Number()`, `Someone()`), a list of one kind (`List(Number())`), positions
 * (`TupleOf(String(), Rest(Number()))`), or either of several (`OneOf(Number(), String())`).
 * A number is a Number, text a String, true and false Booleans; a call is what its head is,
 * through IsA, and what its own IsA relations say it is. Nothing here names a kind of thing in
 * the world: only the shapes a kind can take.
 */
import { type Expr, equal, format, isCall, isVariable } from "../concept/expression.js";
import type { Bindings } from "../concept/match.js";
import type { ConceptStore } from "../store/store.js";

const positional = (e: Expr): Expr[] => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);

/** What a value is, most particular first: its own head or primitive, then its IsA lineage. */
function kindsOf(store: ConceptStore, value: Expr): string[] {
  const own = typeof value === "number" ? "Number" : typeof value === "string" ? "String" : typeof value === "boolean" ? "Boolean" : isCall(value) ? value.head : undefined;
  if (own === undefined) return [];
  // Through IsA and SubclassOf, to kinds nothing more is known of too (Animal, with no unit).
  const out = [own];
  for (let i = 0; i < out.length && out.length < 64; i++) {
    for (const r of store.get(out[i])?.relations ?? []) {
      const parent = isCall(r.claim) && (r.claim.head === "IsA" || r.claim.head === "SubclassOf") ? r.claim.args[0]?.value : undefined;
      if (parent !== undefined && isCall(parent) && !out.includes(parent.head)) out.push(parent.head);
    }
  }
  return out;
}

export function isKind(store: ConceptStore, value: Expr, kind: Expr): boolean {
  if (!isCall(kind)) return equal(value, kind);
  const parts = positional(kind);
  if (kind.head === "OneOf") return parts.some((k) => isKind(store, value, k));
  if (kind.head === "List" && parts.length <= 1) {
    if (!isCall(value) || value.head !== "List") return false;
    return parts.length === 0 || positional(value).every((v) => isKind(store, v, parts[0]));
  }
  if (kind.head === "TupleOf") {
    if (!isCall(value) || value.head !== "List") return false;
    const items = positional(value);
    let at = 0;
    for (const k of parts) {
      if (isCall(k) && k.head === "Rest") return items.slice(at).every((v) => isKind(store, v, positional(k)[0] ?? k));
      if (at >= items.length || !isKind(store, items[at], k)) return false;
      at++;
    }
    return at === items.length;
  }
  // A kind with more said of it (List(Shopping())): what a thing is said to be, exactly.
  if (parts.length || kind.args.length) {
    if (!isCall(value)) return false;
    return (store.get(value.head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && format(r.claim.args[0]?.value) === format(kind));
  }
  return kindsOf(store, value).includes(kind.head);
}

/**
 * Whether every variable a realization types (`types = List(Of($a, Number()))`) holds a value
 * of its kind. A variable the pattern did not bind, or one not typed, takes anything.
 */
export function typesHold(store: ConceptStore, types: Expr | undefined, bindings: Bindings): boolean {
  if (types === undefined) return true;
  for (const t of positional(types)) {
    if (!isCall(t) || t.head !== "Of") continue;
    const [variable, kind] = positional(t);
    if (variable === undefined || kind === undefined || !isVariable(variable)) continue;
    const value = bindings.get(variable.variable);
    if (value !== undefined && !isKind(store, value, kind)) return false;
  }
  return true;
}

/** How many variables a realization types: a typed realization is meant more narrowly. */
export const typedCount = (types: Expr | undefined): number => positional(types ?? null).filter((t) => isCall(t) && t.head === "Of").length;
