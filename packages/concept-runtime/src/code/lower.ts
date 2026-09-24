/**
 * A program written against the host (a `Code(ir=...)` body: JavaScript read into the IR)
 * lowered to a body composed of Concepts, which the evaluator runs without writing any
 * JavaScript (ir-spec Part 10.8).
 *
 * A pass over the program rather than rewrite rules: lowering has to know about names.
 * Every read of an argument becomes the pattern variable it binds, a `let` becomes a cell,
 * and a pattern cannot match "the variable i".
 *
 * The lowered body means what the JavaScript meant. Its values are Concepts:
 *   undefined           Undefined()
 *   an array            List(...)
 *   a.args              List(Argument(name=..., value=...))
 *   `if (x)`, `a && b`  JavaScript's own truthiness, Truthy(x), where every object is true
 *   `===`, `+`, `<`     JavaScript's own operators (Identical, JsPlus, Below), which answer
 *                       true and false, not True() and False()
 * What it cannot lower yet it names, and the body stays a program.
 */
import { type Argument, type Call, type Expr, c, call, format, isCall, isVariable } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";

export class Unlowerable extends Error {}

const U = c("Undefined");
const nope = (why: string): never => {
  throw new Unlowerable(why);
};
const vals = (e: Call): Expr[] => e.args.map((a) => a.value);
const isHead = (e: Expr, head: string, arity?: number): e is Call =>
  isCall(e) && e.head === head && (arity === undefined || e.args.length === arity);
const isVar = (e: Expr, name: string): boolean => isVariable(e) && e.variable === name;
/** isHead without narrowing, for the node being lowered, which is known to be a call. */
const is = (e: Call, head: string, arity?: number): boolean => e.head === head && (arity === undefined || e.args.length === arity);

/** Operators read from JavaScript, onto the primitives that have JavaScript's meaning. */
const OPERATORS: Record<string, string> = {
  Equals: "Identical",
  NotEquals: "NotIdentical",
  LooseEquals: "LooseEquals",
  LooseNotEquals: "LooseNotEquals",
  Add: "JsPlus",
  Subtract: "JsMinus",
  Multiply: "JsTimes",
  Divide: "JsDivide",
  Modulo: "JsRemainder",
  LessThan: "Below",
  GreaterThan: "Above",
  AtMost: "NotAbove",
  AtLeast: "NotBelow",
  Negate: "JsNegate",
  TypeOf: "TypeOf",
  In: "HasField",
};

interface Scope {
  /** args[i].value, by i: the pattern variable it is. */
  readonly argument: ReadonlyMap<number, string>;
  /** The realization reads its arguments unevaluated: a raw read is Quote($x). */
  readonly lazy: boolean;
  /**
   * JavaScript's names in scope, onto the IR's. Substitution replaces a name everywhere
   * below it, a binder under it included, so a local that reuses a name already taken (the
   * pattern's $x, an outer const) is given one of its own.
   */
  readonly names: ReadonlyMap<string, string>;
  readonly taken: Set<string>;
}

/** A name for a JavaScript binding, fresh where it would collide. */
function declare(scope: Scope, js: string): [string, Scope] {
  let name = js;
  for (let i = 2; scope.taken.has(name); i++) name = `${js}${i}`;
  scope.taken.add(name);
  return [name, { ...scope, names: new Map([...scope.names, [js, name]]) }];
}

/** A temporary the lowering needs, which no JavaScript name can collide with. */
function fresh(scope: Scope): Expr {
  let n = 0;
  while (scope.taken.has(`t${n}`)) n++;
  scope.taken.add(`t${n}`);
  return { variable: `t${n}` };
}

/** A realization's `Code(ir=...)` body as Concepts, or the reason it cannot be yet. */
export function lowerRealization(r: Realization): { body: Expr } | { why: string } {
  const program = isCall(r.body) && r.body.head === "Code" ? r.body.args.find((a) => a.name === "ir")?.value : undefined;
  if (program === undefined) return { why: "not a program" };
  let fn = program;
  if (isHead(fn, "Async", 1)) fn = fn.args[0].value;
  if (!isHead(fn, "Lambda", 2)) return { why: "not a function" };
  const params = fn.args[0].value;
  const names = isHead(params, "List") ? vals(params).map((p) => (isVariable(p) ? p.variable : "?")) : [];
  const [argsName, bindingsName, apiName] = names;
  const argument = new Map<number, string>();
  if (isCall(r.pattern)) {
    r.pattern.args.forEach((a, i) => {
      if (isVariable(a.value)) argument.set(i, a.value.variable);
    });
  }
  const scope: Scope = { argument, lazy: !r.evaluateArguments, names: new Map(), taken: new Set(argument.values()) };
  try {
    const renamed = renameHost(fn.args[1].value, argsName, bindingsName, apiName);
    const body = lowerBody(renamed, scope);
    const left = [...leftovers(body)];
    if (left.length) return { why: `still host-shaped: ${[...new Set(left)].join(", ")}` };
    const free = [...freeIn(body, new Set(argument.values()))];
    if (free.length) return { why: `names from the host: ${[...new Set(free)].join(", ")}` };
    return { body };
  } catch (error) {
    if (error instanceof Unlowerable) return { why: error.message };
    throw error;
  }
}

/** The program's own names for args, bindings and api, as $args, $bindings, $api. */
function renameHost(e: Expr, args?: string, bindings?: string, api?: string): Expr {
  const to: Record<string, string> = {};
  if (args) to[args] = "args";
  if (bindings) to[bindings] = "bindings";
  if (api) to[api] = "api";
  const walk = (x: Expr): Expr => {
    if (isVariable(x)) return to[x.variable] ? { variable: `__${to[x.variable]}` } : x;
    if (!isCall(x)) return x;
    return call(x.head, x.args.map((a) => (a.name === undefined ? { value: walk(a.value) } : { name: a.name, value: walk(a.value) })));
  };
  return walk(e);
}

const HOST = ["__args", "__bindings", "__api"];

/** What says the body still reaches the host directly. */
function* leftovers(e: Expr): Generator<string> {
  if (isVariable(e) && HOST.includes(e.variable)) yield e.variable.slice(2);
  if (!isCall(e)) return;
  if (["Member", "OptionalMember", "Index", "OptionalIndex", "OptionalCall", "Return", "Var", "Assign", "Await", "Async", "New", "Object", "Spread", "Throw", "Try", "Finally", "Catch", "ForOf", "For", "While", "DoWhile", "Continue", "Break", "Default", "Hole", "Regex"].includes(e.head)) yield e.head;
  for (const a of e.args) yield* leftovers(a.value);
}

/** Variables the body uses that nothing in it binds: JavaScript globals, or a recursive helper. */
function* freeIn(e: Expr, bound: Set<string>): Generator<string> {
  if (isVariable(e)) {
    if (!bound.has(e.variable) && e.variable !== "_") yield e.variable;
    return;
  }
  if (!isCall(e)) return;
  if (e.head === "Let" && e.args.length === 3 && isVariable(e.args[0].value)) {
    yield* freeIn(e.args[1].value, bound);
    yield* freeIn(e.args[2].value, new Set([...bound, e.args[0].value.variable]));
    return;
  }
  if (e.head === "Lambda" && e.args.length === 2 && isHead(e.args[0].value, "List")) {
    const params = vals(e.args[0].value).filter(isVariable).map((p) => p.variable);
    yield* freeIn(e.args[1].value, new Set([...bound, ...params]));
    return;
  }
  for (const a of e.args) yield* freeIn(a.value, bound);
}

/** A function body: statements to one expression, or an expression as it is. */
function lowerBody(body: Expr, scope: Scope): Expr {
  const steps = isHead(body, "Sequence") ? vals(body) : [body];
  // A block body is a Sequence (it says its fall-through Undefined()) or a lone return or
  // throw; anything else is a concise body, an expression, conditional or not.
  const statementLike = isHead(body, "Sequence") || isHead(body, "Return") || isHead(body, "Throw");
  return statementLike ? lowerBlock(steps, scope) : lowerExpr(body, scope);
}

const isStatement = (e: Expr): boolean =>
  isCall(e) && ["Return", "Let", "Var", "If", "Throw", "ForOf", "For", "While", "Sequence"].includes(e.head) && !(e.head === "Let" && e.args.length === 3);

/** Does control leave the block through every path (return or throw)? */
function exits(e: Expr): boolean {
  if (isHead(e, "Return") || isHead(e, "Throw")) return true;
  if (isHead(e, "Sequence")) return vals(e).some(exits);
  if (isHead(e, "If", 3)) return exits(e.args[1].value) && exits(e.args[2].value);
  return false;
}

/** Does a return appear anywhere inside, other than in a nested function? */
function returnsInside(e: Expr): boolean {
  if (!isCall(e)) return false;
  if (e.head === "Return") return true;
  if (e.head === "Lambda" || e.head === "Func") return false;
  return e.args.some((a) => returnsInside(a.value));
}

const flatten = (steps: Expr[]): Expr[] => steps.flatMap((s) => (isHead(s, "Sequence") ? flatten(vals(s)) : [s]));

function lowerBlock(input: Expr[], scope: Scope): Expr {
  const steps = flatten(input);
  if (!steps.length) return U;
  const [first, ...rest] = steps;
  if (isHead(first, "Return")) return first.args.length ? lowerExpr(first.args[0].value, scope) : U;
  if (isHead(first, "Throw", 1)) return c("Throw", lowerExpr(first.args[0].value, scope));
  if (isHead(first, "Let", 2)) {
    const [name, value] = vals(first);
    return bind(name, lowerExpr(value, scope), (inner) => lowerBlock(rest, inner), scope);
  }
  if (isHead(first, "If", 3)) {
    const [cond, then, otherwise] = vals(first);
    const test = truth(cond, scope);
    if (!returnsInside(then) && !returnsInside(otherwise)) {
      const effect = c("If", test, lowerBlock([then], scope), lowerBlock([otherwise], scope));
      return rest.length ? c("Sequence", effect, lowerBlock(rest, scope)) : c("Sequence", effect, U);
    }
    // A branch that may return: what follows runs only on the paths that do not.
    const branch = (b: Expr) => lowerBlock(exits(b) ? [b] : [b, ...rest], scope);
    return c("If", test, branch(then), branch(otherwise));
  }
  if (isHead(first, "Undefined", 0) && rest.length) return lowerBlock(rest, scope);
  if (isCall(first) && isStatement(first)) nope(first.head);
  const value = lowerExpr(first, scope);
  return rest.length ? c("Sequence", value, lowerBlock(rest, scope)) : c("Sequence", value, U);
}

/** const x = v; ... as Let($x, v, ...). A destructuring reads each field. */
function bind(name: Expr, value: Expr, body: (scope: Scope) => Expr, scope: Scope): Expr {
  if (isVariable(name)) {
    const [ir, inner] = declare(scope, name.variable);
    return c("Let", { variable: ir }, value, body(inner));
  }
  // A destructuring: the value once, then each part read from it.
  const parts: [string, Expr][] = [];
  if (isHead(name, "Object")) {
    for (const a of name.args) {
      if (a.name === undefined || !isVariable(a.value)) return nope("destructuring shape");
      parts.push([a.value.variable, a.name]);
    }
  } else if (isHead(name, "List")) {
    vals(name).forEach((item, i) => {
      if (isHead(item, "Hole")) return;
      if (!isVariable(item)) nope("destructuring shape");
      parts.push([(item as { variable: string }).variable, i]);
    });
  } else return nope("destructuring shape");
  const t = fresh(scope);
  let inner = scope;
  const names: string[] = [];
  for (const [js] of parts) {
    const [ir, next] = declare(inner, js);
    names.push(ir);
    inner = next;
  }
  let out = body(inner);
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = parts[i][1];
    const read = typeof key === "number" ? c("Element", t, key) : c("FieldOf", t, key);
    out = c("Let", { variable: names[i] }, read, out);
  }
  return c("Let", t, value, out);
}

/** A condition as JavaScript tests it: truthiness. */
function truth(e: Expr, scope: Scope): Expr {
  const v = lowerExpr(e, scope);
  return isBoolean(v) ? v : c("Truthy", v);
}

/** Produces true or false already, so needs no Truthy. */
const isBoolean = (e: Expr): boolean =>
  typeof e === "boolean" || (isCall(e) && ["Identical", "NotIdentical", "LooseEquals", "LooseNotEquals", "Below", "Above", "NotAbove", "NotBelow", "Truthy", "Falsy", "IsCall", "HasField", "Includes"].includes(e.head));

function lowerExpr(e: Expr, scope: Scope): Expr {
  if (isVariable(e)) return { variable: scope.names.get(e.variable) ?? e.variable };
  if (!isCall(e)) return e;
  const x = (v: Expr) => lowerExpr(v, scope);
  const args = vals(e);
  const head = e.head;

  // args[i].value, bindings.get("x"): the realization's own variables.
  const argIndex = (v: Expr): number | undefined => {
    if ((isHead(v, "Index", 2) || isHead(v, "OptionalIndex", 2)) && isVar(v.args[0].value, "__args") && typeof v.args[1].value === "number") return v.args[1].value;
    return undefined;
  };
  if ((is(e, "Member", 2) || is(e, "OptionalMember", 2)) && e.args[1].value === "value") {
    const i = argIndex(e.args[0].value);
    if (i !== undefined) {
      const name = scope.argument.get(i) ?? nope(`args[${i}] has no variable in the pattern`);
      return scope.lazy ? c("Quote", { variable: name }) : { variable: name };
    }
  }
  if (is(e, "Call") && isHead(args[0], "Member", 2) && isVar(args[0].args[0].value, "__bindings") && args[0].args[1].value === "get" && typeof args[1] === "string") {
    return scope.lazy ? c("Quote", { variable: args[1] }) : { variable: args[1] };
  }

  // The host's api, onto the primitives that do the same.
  if (is(e, "Call") && isHead(args[0], "Member", 2) && isVar(args[0].args[0].value, "__api")) {
    const method = args[0].args[1].value;
    const rest = args.slice(1);
    if (method === "call") return c("MakeCall", x(rest[0]), listOf(rest.slice(1), scope));
    if (method === "evaluate") {
      // A lazy realization evaluating its own argument: the variable, which is evaluated where
      // the body is.
      const own = rest.length === 1 ? argIndex(isHead(rest[0], "Member", 2) && rest[0].args[1].value === "value" ? rest[0].args[0].value : U) : undefined;
      if (scope.lazy && own !== undefined) return { variable: scope.argument.get(own) ?? nope("argument") };
      return call("Evaluate", rest.map((v) => ({ value: x(v) })));
    }
    if (method === "format") return c("FormatExpression", x(rest[0]));
    return nope(`api.${String(method)}`);
  }

  if (is(e, "Await", 1)) return x(args[0]);
  if (is(e, "Member", 2) && args[1] === "head") return c("Head", x(args[0]));
  if (is(e, "Member", 2) && args[1] === "args") return c("Arguments", x(args[0]));
  if (is(e, "Member", 2) && typeof args[1] === "string") return c("FieldOf", x(args[0]), args[1]);
  if (is(e, "OptionalMember", 2) && typeof args[1] === "string") {
    const t = fresh(scope);
    const read = args[1] === "head" ? c("Head", t) : args[1] === "args" ? c("Arguments", t) : c("FieldOf", t, args[1]);
    return c("Let", t, x(args[0]), c("If", c("LooseEquals", t, null), U, read));
  }
  if (is(e, "Index", 2)) return c("Element", x(args[0]), x(args[1]));
  if (is(e, "OptionalIndex", 2)) {
    const t = fresh(scope);
    return c("Let", t, x(args[0]), c("If", c("LooseEquals", t, null), U, c("Element", t, x(args[1]))));
  }
  if (is(e, "If", 3)) return c("If", truth(args[0], scope), x(args[1]), x(args[2]));
  if (is(e, "Not", 1)) return c("Falsy", x(args[0]));
  // a && b is a when a is falsy, else b; a || b the other way; a ?? b b when a is nullish.
  if (is(e, "And", 2) || is(e, "Or", 2) || is(e, "Otherwise", 2)) {
    const left = x(args[0]);
    const right = x(args[1]);
    // Short-circuit, as JavaScript is: the right side runs only when it decides.
    if (isBoolean(left) && head === "And") return c("If", left, right, false);
    if (isBoolean(left) && head === "Or") return c("If", left, true, right);
    const t = fresh(scope);
    const test = head === "Otherwise" ? c("LooseEquals", t, null) : c("Truthy", t);
    const [yes, no] = head === "And" ? [right, t] : head === "Or" ? [t, right] : [right, t];
    return c("Let", t, left, c("If", test, yes, no));
  }
  if (OPERATORS[head] && (args.length === 2 || args.length === 1)) return call(OPERATORS[head], args.map((v) => ({ value: x(v) })));
  if (is(e, "Lambda", 2)) {
    const [ps, body] = args;
    if (!isHead(ps, "List") || !vals(ps).every(isVariable)) nope("parameter shape");
    let inner = scope;
    const params: Expr[] = [];
    for (const p of vals(ps as Call)) {
      const [ir, next] = declare(inner, (p as { variable: string }).variable);
      params.push({ variable: ir });
      inner = next;
    }
    return c("Lambda", call("List", params.map((value) => ({ value }))), lowerBody(body, inner));
  }
  if (is(e, "Call")) {
    const [f, ...rest] = args;
    if (isHead(f, "Member") || isHead(f, "OptionalMember")) nope(`method .${String(f.args[1]?.value)}`);
    return call("Call", [{ value: x(f) }, ...rest.map((v) => ({ value: x(v) }))]);
  }
  if (["Map", "Filter", "FlatMap", "Reduce", "Includes", "Length", "Concat", "List", "Sequence", "Let"].includes(e.head)) {
    if (e.head === "List" && args.some((v) => isHead(v, "Spread"))) return listOf(args, scope);
    return call(e.head, e.args.map((a: Argument) => (a.name === undefined ? { value: x(a.value) } : { name: a.name, value: x(a.value) })));
  }
  if (is(e, "Undefined", 0)) return U;
  return nope(e.head);
}

/** Arguments with spreads in them, as one List: api.call("X", ...xs) or [...a, b]. */
function listOf(items: Expr[], scope: Scope): Expr {
  const parts: Expr[] = [];
  let run: Expr[] = [];
  for (const v of items) {
    if (isHead(v, "Spread", 1)) {
      if (run.length) parts.push(call("List", run.map((value) => ({ value }))));
      run = [];
      parts.push(lowerExpr(v.args[0].value, scope));
    } else run.push(lowerExpr(v, scope));
  }
  if (!parts.length) return call("List", run.map((value) => ({ value })));
  if (run.length) parts.push(call("List", run.map((value) => ({ value }))));
  return parts.length === 1 ? parts[0] : call("Concat", parts.map((value) => ({ value })));
}

export { format };
