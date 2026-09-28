/**
 * Whether a realization's variables are of their types (concept-spec Part 6.7). A type is
 * anything IsA can point at, written like a pattern whose holes are types: `Number()`,
 * `List(String(), Rest(Number()))`, `List(Of(Number()))`, `OneOf(A, B)`, `Foo(X())`. What each
 * shape means is the graph's, as realizations of `Fits` (packs/core.ncon); the host only walks
 * what a value is, and binds type variables: in `Types(a = $T, b = $T)` both are one type.
 */
import { type Expr, call, isCall, isVariable } from "../concept/expression.js";
import type { Bindings } from "../concept/match.js";
import type { ConceptStore } from "../store/store.js";

const positional = (e: Expr): Expr[] => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);

/**
 * What a value is, most particular first: its own head or primitive (a number is a Number, text
 * a String, true and false Booleans), then what that is through IsA and SubclassOf, to types
 * nothing more is known of too.
 */
export function typesOf(store: ConceptStore, value: Expr): string[] {
  const own = typeof value === "number" ? "Number" : typeof value === "string" ? "String" : typeof value === "boolean" ? "Boolean" : isCall(value) ? value.head : undefined;
  if (own === undefined) return [];
  const out = [own];
  for (let i = 0; i < out.length && out.length < 64; i++) {
    for (const r of store.get(out[i])?.relations ?? []) {
      const parent = isCall(r.claim) && (r.claim.head === "IsA" || r.claim.head === "SubclassOf") ? r.claim.args[0]?.value : undefined;
      if (parent !== undefined && isCall(parent) && !out.includes(parent.head)) out.push(parent.head);
    }
  }
  return out;
}

/**
 * A type variable takes the type of what it first stands for: `$T` against 5 is Number(), and
 * in `List(Of($T))` against a list, the type of its first item. Only where the value shows it.
 */
function infer(store: ConceptStore, value: Expr, type: Expr, found: Map<string, Expr>): void {
  if (isVariable(type)) {
    if (!found.has(type.variable)) {
      const own = typesOf(store, value)[0];
      if (own !== undefined) found.set(type.variable, call(own, []));
    }
    return;
  }
  if (!isCall(type) || !isCall(value) || value.head !== "List") return;
  const items = positional(value);
  const parts = positional(type);
  const of = parts.length === 1 && isCall(parts[0]) && (parts[0].head === "Of" || parts[0].head === "Rest") ? positional(parts[0])[0] : undefined;
  if ((type.head === "List" || type.head === "ListOf") && (of !== undefined || type.head === "ListOf")) {
    const each = of ?? parts[0];
    if (items.length && each !== undefined) infer(store, items[0], each, found);
    return;
  }
  if (type.head === "List") parts.forEach((t, i) => i < items.length && !(isCall(t) && t.head === "Rest") && infer(store, items[i], t, found));
}

const substitute = (type: Expr, found: Map<string, Expr>): Expr =>
  isVariable(type) ? (found.get(type.variable) ?? type) : isCall(type) ? { head: type.head, args: type.args.map((a) => ({ ...a, value: substitute(a.value, found) })) } : type;

/**
 * Whether every variable a realization types (`types = Types(a = Number())`, each named for its
 * variable) holds a value of its type, asked of `Fits`. A variable the pattern did not bind, or
 * one not typed, takes anything; a type variable no value showed takes anything too.
 */
export async function typesHold(store: ConceptStore, types: Expr | undefined, bindings: Bindings, fits: (value: Expr, type: Expr) => Promise<boolean>): Promise<boolean> {
  if (types === undefined || !isCall(types)) return true;
  const typed = types.args.flatMap((a) => (a.name !== undefined && bindings.has(a.name) ? [{ value: bindings.get(a.name)!, type: a.value }] : []));
  const found = new Map<string, Expr>();
  for (const t of typed) infer(store, t.value, t.type, found);
  for (const t of typed) {
    const type = substitute(t.type, found);
    if (isVariable(type)) continue;
    if (!(await fits(t.value, type))) return false;
  }
  return true;
}
