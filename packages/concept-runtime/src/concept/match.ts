/**
 * Pattern matching and substitution.
 *
 * Two things here go beyond a naive structural match, both required by the specs:
 *
 *  - `Rest($items)` in a pattern's final argument position matches any number of remaining
 *    arguments and binds them as `List(...)`. This is what makes `Sequence`, `Qualify`,
 *    `Call`, and `List` genuinely variadic (ir-spec Part 12, item 1) without adding syntax.
 *  - `$_` is anonymous: every occurrence is an independent hole and none is ever bound, so
 *    `Equals($_, $_)` asks what equals what while `Equals($x, $x)` asks what equals itself
 *    (seed-concepts Part 10).
 */
import { type Argument, type Expr, type Call, equal, isCall, isVariable, call } from "./expression.js";

export type Bindings = Map<string, Expr>;

export const ANON = "_";
export const REST = "Rest";

const restVariable = (a: Argument): string | undefined => {
  const value = a.value;
  if (!isCall(value) || value.head !== REST || value.args.length !== 1) return undefined;
  const inner = value.args[0].value;
  return isVariable(inner) ? inner.variable : undefined;
};

/** The formal name an argument aligns by: its own name, else its variable's name. */
const formalName = (a: Argument): string | undefined =>
  a.name ?? (isVariable(a.value) ? a.value.variable : undefined);

export function match(pattern: Expr, value: Expr, bindings: Bindings): boolean {
  if (isVariable(pattern)) {
    if (pattern.variable === ANON) return true; // anonymous: matches, never binds
    const existing = bindings.get(pattern.variable);
    if (existing === undefined) {
      bindings.set(pattern.variable, value);
      return true;
    }
    return equal(existing, value);
  }

  if (isCall(pattern)) {
    if (!isCall(value) || pattern.head !== value.head) return false;
    return matchArgs(pattern.args, value.args, bindings);
  }

  return equal(pattern, value);
}

function matchArgs(
  expected: readonly Argument[],
  actual: readonly Argument[],
  bindings: Bindings,
): boolean {
  const last = expected[expected.length - 1];
  const rest = last ? restVariable(last) : undefined;

  if (rest !== undefined) {
    const fixed = expected.slice(0, -1);
    if (actual.length < fixed.length) return false;
    for (let i = 0; i < fixed.length; i += 1) {
      if (!match(fixed[i].value, actual[i].value, bindings)) return false;
    }
    const tail = actual.slice(fixed.length);
    const collected = call("List", tail);
    if (rest === ANON) return true;
    const existing = bindings.get(rest);
    if (existing === undefined) {
      bindings.set(rest, collected);
      return true;
    }
    return equal(existing, collected);
  }

  if (expected.length !== actual.length) return false;

  // When every actual argument is named, align by formal name rather than position.
  const allNamed = actual.length > 0 && actual.every((a) => a.name !== undefined);
  if (allNamed) {
    const byName = new Map(actual.map((a) => [a.name!, a]));
    if (byName.size !== actual.length) return false;
    for (const e of expected) {
      const key = formalName(e);
      if (key === undefined) return false;
      const a = byName.get(key);
      if (a === undefined) return false;
      if (!match(e.value, a.value, bindings)) return false;
    }
    return true;
  }

  for (let i = 0; i < expected.length; i += 1) {
    const e = expected[i];
    const a = actual[i];
    if (e.name !== undefined && a.name !== undefined && e.name !== a.name) return false;
    if (!match(e.value, a.value, bindings)) return false;
  }
  return true;
}

export function substitute(e: Expr, bindings: Bindings): Expr {
  if (isVariable(e)) {
    const bound = bindings.get(e.variable);
    return bound === undefined ? e : bound;
  }
  if (!isCall(e)) return e;

  const args: Argument[] = [];
  for (const a of e.args) {
    // A Rest variable in body position splices its List back into the argument list.
    const rest = restVariable(a);
    if (rest !== undefined) {
      const bound = bindings.get(rest);
      if (bound !== undefined && isCall(bound) && bound.head === "List") {
        args.push(...bound.args);
        continue;
      }
    }
    args.push(a.name === undefined ? { value: substitute(a.value, bindings) } : { name: a.name, value: substitute(a.value, bindings) });
  }
  return call(e.head, args);
}

/** Free variables, excluding the anonymous hole. */
export function freeVariables(e: Expr, acc = new Set<string>()): Set<string> {
  if (isVariable(e)) {
    if (e.variable !== ANON) acc.add(e.variable);
    return acc;
  }
  if (isCall(e)) for (const a of e.args) freeVariables(a.value, acc);
  return acc;
}

/**
 * Structural specificity: how constrained a pattern is. A variable constrains nothing.
 * Used to order realization candidates (concept-spec Part 9).
 */
export function specificity(e: Expr): number {
  if (isVariable(e)) return 0;
  if (!isCall(e)) return 1;
  return 1 + e.args.reduce((sum, a) => sum + specificity(a.value), 0);
}

export const isRest = (e: Expr): e is Call => isCall(e) && e.head === REST;
