/**
 * A program written against the host (a `Code(ir=...)` body: JavaScript read into the IR)
 * lowered to a body composed of Concepts, which any host runs with its own implementation
 * of the code primitives (ir-spec Part 10.8).
 *
 * A pass over the program rather than rewrite rules: lowering has to know about names.
 * Every read of an argument becomes the pattern variable it binds, a `let` becomes a cell,
 * and a pattern cannot match "the variable i".
 *
 * The lowered body means what the program meant, in the IR's own terms:
 *   undefined             Undefined()
 *   an array              List(...), and an object Record(k=v, ...)
 *   a.args                List(Argument(name=..., value=...))
 *   `if (x)`, `a && b`    Truthy(x), the IR's truthiness
 *   `===`, `+`, `<`       Identical, AddValues, Below, answering true and false
 *   a Date, Set, Map      an Instant, a MutableSet, a MutableMap
 *   a method or library   the operation that means the same (METHODS, GLOBAL_CALLS)
 *   the host's api        the graph operation that means the same (HOST_CALLS)
 * What has no operation yet it names, and the body stays a program.
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

/** Operators read from a program, onto the operations that mean the same. */
const OPERATORS: Record<string, string> = {
  Equals: "Identical",
  NotEquals: "NotIdentical",
  Add: "AddValues",
  Subtract: "SubtractValues",
  Multiply: "MultiplyValues",
  Divide: "DivideValues",
  Modulo: "RemainderOf",
  LessThan: "Below",
  GreaterThan: "Above",
  AtMost: "NotAbove",
  AtLeast: "NotBelow",
  Negate: "NegateValue",
  Power: "RaiseToPower",
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
  /** The realization's pattern's arguments, for `args` used as a whole. */
  readonly pattern: readonly Argument[];
  /** JavaScript names that change (let, assigned, pushed to): each is a cell. */
  readonly mutable: ReadonlySet<string>;
  /** IR names that hold a cell, read with Get and written with Set. */
  readonly cells: ReadonlySet<string>;
  /** Inside a loop's body: return, continue and break are signals to the loop. */
  readonly inLoop: boolean;
}

/** A name for a JavaScript binding, fresh where it would collide. */
function declare(scope: Scope, js: string): [string, Scope] {
  let name = js;
  for (let i = 2; scope.taken.has(name); i++) name = `${js}${i}`;
  scope.taken.add(name);
  const cells = new Set(scope.cells);
  if (scope.mutable.has(js)) cells.add(name);
  else cells.delete(name);
  return [name, { ...scope, names: new Map([...scope.names, [js, name]]), cells }];
}

/** Names the program changes: declared with let, assigned, incremented, or pushed to. */
function mutations(e: Expr, out = new Set<string>()): Set<string> {
  if (!isCall(e)) return out;
  if ((e.head === "Var" || e.head === "Assign" || /^(Pre|Post)(In|De)crement$/.test(e.head)) && isVariable(e.args[0]?.value)) out.add(e.args[0].value.variable);
  if (e.head === "Var") for (const v of bindingNames(e.args[0]?.value)) out.add(v);
  if (e.head === "Call" && isHead(e.args[0]?.value, "Member", 2)) {
    const [receiver, name] = vals(e.args[0].value as Call);
    // sort changes its array in place too, when it is a named local.
    if (isVariable(receiver) && typeof name === "string" && (MUTATING.has(name) || name === "sort")) out.add(receiver.variable);
  }
  // xs[i] = v changes xs.
  if (e.head === "Assign" && isHead(e.args[0]?.value, "Index", 2) && isVariable(e.args[0].value.args[0].value)) {
    out.add(e.args[0].value.args[0].value.variable);
  }
  for (const a of e.args) mutations(a.value, out);
  return out;
}

/**
 * An array changed in place (push, sort...) is a cell of its value, which is faithful only
 * if nothing else holds the same array. So it must be made here, as a literal, and never
 * handed on: not bound to another name, passed as an argument, or put in a structure.
 * `const list = groups.get(k); list.push(x)` changes the array inside the Map; a cell
 * would change only its own copy. Answers the name that breaks this, if one does.
 */
function aliased(program: Expr): string | undefined {
  const changed = new Set<string>();
  const inits = new Map<string, Expr[]>();
  const scan = (e: Expr): void => {
    if (!isCall(e)) return;
    if (e.head === "Call" && isHead(e.args[0]?.value, "Member", 2)) {
      const [receiver, name] = vals(e.args[0].value as Call);
      if (isVariable(receiver) && typeof name === "string" && (MUTATING.has(name) || name === "sort")) changed.add(receiver.variable);
    }
    const assigned = indexAssigned(e);
    if (assigned) changed.add(assigned);
    if ((e.head === "Bind" || e.head === "Var") && isVariable(e.args[0]?.value)) {
      const n = e.args[0].value.variable;
      inits.set(n, [...(inits.get(n) ?? []), e.args[1]?.value ?? U]);
    }
    for (const a of e.args) scan(a.value);
  };
  scan(program);
  if (!changed.size) return undefined;
  for (const n of changed) {
    const made = inits.get(n) ?? [];
    // Made here: an array literal, or a copy ([...xs], xs.slice(), xs.filter(...)).
    const fresh = (v: Expr) => isHead(v, "List") || isHead(v, "Concat") || isHead(v, "Map") || isHead(v, "Filter") || (isHead(v, "Call") && isHead(v.args[0]?.value, "Member", 2) && ["slice", "map", "filter", "concat", "flatMap"].includes(String((v.args[0].value as Call).args[1].value)));
    // A binding of the same name that starts as nothing or a scalar is another binding: it
    // cannot be the array changed, since pushing to it would throw.
    const scalar = (v: Expr) => !isCall(v) || isHead(v, "Undefined", 0);
    const arrays = made.filter((v) => !scalar(v));
    if (!arrays.length || !arrays.every(fresh)) return n;
  }
  // Handed on (an argument, a value bound or stored) and changed after: the other holder
  // would see the change, and a cell's snapshot would not. Handed on after the last change,
  // a snapshot is exactly what it held. In the order the source says them.
  let n = 0;
  const lastChange = new Map<string, number>();
  const firstHandOn = new Map<string, number>();
  const walk = (e: Expr): void => {
    if (!isCall(e)) return;
    n += 1;
    if (e.head === "Call" && isHead(e.args[0]?.value, "Member", 2)) {
      const [receiver, name] = vals(e.args[0].value as Call);
      if (isVariable(receiver) && changed.has(receiver.variable) && typeof name === "string" && (MUTATING.has(name) || name === "sort")) lastChange.set(receiver.variable, n);
    }
    const assigned = indexAssigned(e);
    if (assigned && changed.has(assigned)) lastChange.set(assigned, n);
    e.args.forEach((a, i) => {
      const v = a.value;
      if (isVariable(v) && changed.has(v.variable)) {
        // Handing on is giving the array itself to something that could keep it: an argument,
        // a value bound, assigned or stored. Reading it, comparing it or measuring it is not.
        const argument = (e.head === "Call" || e.head === "New" || e.head === "OptionalCall") && i > 0;
        const stored = e.head === "Object" || e.head === "List" || e.head === "Pair" || ((e.head === "Bind" || e.head === "Var" || e.head === "Assign") && i === 1);
        if ((argument || stored) && !firstHandOn.has(v.variable)) firstHandOn.set(v.variable, n);
      }
      walk(v);
    });
  };
  walk(program);
  for (const [name, at] of firstHandOn) if ((lastChange.get(name) ?? 0) > at) return name;
  return undefined;
}

/** The array xs[i] = v changes, when it is a name. */
const indexAssigned = (e: Call): string | undefined =>
  e.head === "Assign" && isHead(e.args[0]?.value, "Index", 2) && isVariable(e.args[0].value.args[0].value) ? e.args[0].value.args[0].value.variable : undefined;

const bindingNames = (b: Expr | undefined): string[] =>
  b === undefined ? [] : isVariable(b) ? [b.variable] : isCall(b) ? b.args.flatMap((a) => bindingNames(a.value)) : [];

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
  const rests = isCall(r.pattern) ? r.pattern.args.filter((a) => isHead(a.value, "Rest", 1)).map((a) => (a.value as Call).args[0].value).filter(isVariable).map((v) => v.variable) : [];
  try {
    const renamed = renameHost(fn.args[1].value, argsName, bindingsName, apiName);
    const alias = aliased(renamed);
    if (alias) return { why: `an array changed in place that others may hold: ${alias}` };
    const scope: Scope = {
      argument, lazy: !r.evaluateArguments, names: new Map(), taken: new Set([...argument.values(), ...rests, ...allVariables(r.pattern), ...allVariables(r.context ?? null)]),
      pattern: isCall(r.pattern) ? r.pattern.args : [], mutable: mutations(renamed), cells: new Set(), inLoop: false,
    };
    const body = lowerBody(renamed, scope);
    const left = [...leftovers(body)];
    if (left.length) return { why: `still host-shaped: ${[...new Set(left)].join(", ")}` };
    // Everything the pattern binds is in scope: its Rest lists and nested variables too.
    const patternVariables = (e: Expr, out = new Set<string>()): Set<string> => {
      if (isVariable(e)) out.add(e.variable);
      else if (isCall(e)) for (const a of e.args) patternVariables(a.value, out);
      return out;
    };
    // A context pattern binds too: Focused($game).
    const free = [...freeIn(body, patternVariables(r.context ?? null, patternVariables(r.pattern)))];
    if (free.length) return { why: `names from the host: ${[...new Set(free)].join(", ")}` };
    return { body };
  } catch (error) {
    if (error instanceof Unlowerable) return { why: error.message };
    throw error;
  }
}

const allVariables = (e: Expr, out: string[] = []): string[] => {
  if (isVariable(e)) out.push(e.variable);
  else if (isCall(e)) for (const a of e.args) allVariables(a.value, out);
  return out;
};

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
  if (["Member", "OptionalMember", "Index", "OptionalIndex", "OptionalCall", "Return", "Var", "Assign", "Await", "Async", "New", "Object", "Spread", "Try", "Finally", "Catch", "ForOf", "For", "While", "DoWhile", "Continue", "Break", "Default", "Hole"].includes(e.head)) yield e.head;
  for (const a of e.args) yield* leftovers(a.value);
}

/** Variables the body uses that nothing in it binds: JavaScript globals, or a recursive helper. */
function* freeIn(e: Expr, bound: Set<string>): Generator<string> {
  if (isVariable(e)) {
    if (!bound.has(e.variable) && e.variable !== "_") yield e.variable;
    return;
  }
  if (!isCall(e)) return;
  if (e.head === "Bind" && e.args.length === 3 && isVariable(e.args[0].value)) {
    yield* freeIn(e.args[1].value, bound);
    yield* freeIn(e.args[2].value, new Set([...bound, e.args[0].value.variable]));
    return;
  }
  if (e.head === "Recursive" && e.args.length === 2 && isVariable(e.args[0].value)) {
    yield* freeIn(e.args[1].value, new Set([...bound, e.args[0].value.variable]));
    return;
  }
  if (e.head === "Lambda" && e.args.length === 2 && isHead(e.args[0].value, "List")) {
    const params = vals(e.args[0].value).map((p) => (isHead(p, "Rest", 1) ? p.args[0].value : p)).filter(isVariable).map((p) => p.variable);
    yield* freeIn(e.args[1].value, new Set([...bound, ...params]));
    return;
  }
  for (const a of e.args) yield* freeIn(a.value, bound);
}

/** A function body: statements to one expression, or an expression as it is. */
function lowerBody(body: Expr, outer: Scope): Expr {
  const scope = { ...outer, inLoop: false };
  const steps = isHead(body, "Sequence") ? vals(body) : [body];
  // A block body is a Sequence (it says its fall-through Undefined()) or a lone return or
  // throw; anything else is a concise body, an expression, conditional or not.
  const statementLike = isHead(body, "Sequence") || isHead(body, "Return") || isHead(body, "Throw");
  return statementLike ? lowerBlock(steps, scope) : lowerExpr(body, scope);
}

const isStatement = (e: Expr): boolean =>
  isCall(e) && ["Return", "Bind", "Var", "If", "Throw", "ForOf", "For", "While", "DoWhile", "Sequence", "Continue", "Break", "Try"].includes(e.head) && !(e.head === "Bind" && e.args.length === 3);

const LOOPS = ["ForOf", "For", "While", "DoWhile"];

/** Does control leave the block through every path (return, throw, continue or break)? */
function exits(e: Expr): boolean {
  if (isHead(e, "Return") || isHead(e, "Throw") || isHead(e, "Continue") || isHead(e, "Break")) return true;
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

/** Does control leave from inside: a return, or a continue or break of this loop? */
function leavesInside(e: Expr, loop = true): boolean {
  if (!isCall(e)) return false;
  if (e.head === "Return") return true;
  if (loop && (e.head === "Continue" || e.head === "Break")) return true;
  if (e.head === "Lambda" || e.head === "Func") return false;
  const inner = loop && !LOOPS.includes(e.head);
  return e.args.some((a) => leavesInside(a.value, inner));
}

const flatten = (steps: Expr[]): Expr[] => steps.flatMap((s) => (isHead(s, "Sequence") ? flatten(vals(s)) : [s]));

/** function f() {} as a statement, async or not: hoisted, as JavaScript hoists it. */
const declaredFunction = (e: Expr): Call | undefined => {
  const inner = isHead(e, "Async", 1) ? e.args[0].value : e;
  return isHead(inner, "Func", 3) && isVariable(inner.args[0].value) ? inner : undefined;
};

/** Every variable an expression mentions: what it may need bound. */
const mentioned = (e: Expr, out = new Set<string>()): Set<string> => {
  if (isVariable(e)) out.add(e.variable);
  else if (isCall(e)) for (const a of e.args) mentioned(a.value, out);
  return out;
};

/**
 * const f = (...) => ... used by a function declared above it: JavaScript allows it, since
 * the one above runs later. Nested binding does not, so f moves up to just before its
 * first use, where everything it names is bound already. Answers the steps reordered.
 */
function hoistLateFunctions(input: Expr[]): Expr[] {
  const steps = [...input];
  const declares = (s: Expr): string[] => (isHead(s, "Bind", 2) || isHead(s, "Var", 2) ? bindingNames(s.args[0].value) : []);
  for (let moved = true; moved; ) {
    moved = false;
    for (let j = 1; j < steps.length && !moved; j++) {
      const s = steps[j];
      if (!isHead(s, "Bind", 2) || !isVariable(s.args[0].value)) continue;
      const value = isHead(s.args[1].value, "Async", 1) ? s.args[1].value.args[0].value : s.args[1].value;
      if (!isHead(value, "Lambda")) continue;
      const name = s.args[0].value.variable;
      const i = steps.findIndex((t, k) => k < j && mentioned(t).has(name));
      if (i < 0) continue;
      const before = new Set(steps.slice(0, i).flatMap(declares));
      const after = new Set(steps.slice(i).flatMap(declares));
      const needs = [...mentioned(value)].filter((v) => v !== name && after.has(v) && !before.has(v));
      if (needs.length) continue;
      steps.splice(j, 1);
      steps.splice(i, 0, s);
      moved = true;
    }
  }
  return steps;
}

function lowerBlock(input: Expr[], scope: Scope): Expr {
  const steps = hoistLateFunctions(flatten(input));
  if (!steps.length) return U;
  // Function declarations are bound before the block runs, so a call above one reaches it.
  const functions = steps.filter((s) => declaredFunction(s) !== undefined);
  if (functions.length) {
    const others = steps.filter((s) => declaredFunction(s) === undefined);
    const hoist = (i: number, s: Scope): Expr => {
      if (i >= functions.length) return lowerBlock(others, s);
      const f = declaredFunction(functions[i])!;
      const [name, params, body] = vals(f);
      return bind(name, (inner) => lowerExpr(c("Lambda", params, body), inner), (inner) => hoist(i + 1, inner), s);
    };
    return hoist(0, scope);
  }
  const [first, ...rest] = steps;
  if (isHead(first, "Return")) {
    const value = first.args.length ? lowerExpr(first.args[0].value, scope) : U;
    // Inside a loop a return is a signal the loop hands back.
    return scope.inLoop ? c("LoopReturn", value) : value;
  }
  if (isHead(first, "Continue", 0)) return scope.inLoop ? c("LoopNext") : nope("continue outside a loop");
  if (isHead(first, "Break", 0)) return scope.inLoop ? c("LoopStop") : nope("break outside a loop");
  if (isHead(first, "Throw", 1)) return c("Throw", lowerExpr(first.args[0].value, scope));
  if (isHead(first, "Bind", 2) || isHead(first, "Var", 2)) {
    const [name, value] = vals(first);
    // The value is lowered where its own name is already bound, for a helper that recurses.
    return bind(name, isHead(value, "Lambda") ? (inner) => lowerExpr(value, inner) : lowerExpr(value, scope), (inner) => lowerBlock(rest, inner), scope);
  }
  if (isCall(first) && LOOPS.includes(first.head)) return lowerLoop(first, rest, scope);
  if (isHead(first, "ForLoop", 3)) return lowerLoop(first, rest, scope);
  if (isHead(first, "If", 3)) {
    const [cond, then, otherwise] = vals(first);
    const test = truth(cond, scope);
    const leaves = (b: Expr) => (scope.inLoop ? leavesInside(b) : returnsInside(b));
    if (!leaves(then) && !leaves(otherwise)) {
      const effect = c("If", test, lowerBlock([then], scope), lowerBlock([otherwise], scope));
      return rest.length ? c("Steps", effect, lowerBlock(rest, scope)) : c("Steps", effect, U);
    }
    // A branch that may return: what follows runs only on the paths that do not.
    const branch = (b: Expr) => lowerBlock(exits(b) ? [b] : [b, ...rest], scope);
    return c("If", test, branch(then), branch(otherwise));
  }
  if (isHead(first, "Undefined", 0) && rest.length) return lowerBlock(rest, scope);
  if (isCall(first) && isStatement(first)) nope(first.head);
  const value = lowerExpr(first, scope);
  return rest.length ? c("Steps", value, lowerBlock(rest, scope)) : c("Steps", value, U);
}

/** const x = v; ... as Bind($x, v, ...). A destructuring reads each field. */
function bind(name: Expr, value: Expr | ((scope: Scope) => Expr), body: (scope: Scope) => Expr, scope: Scope): Expr {
  if (isVariable(name)) {
    const [ir, inner] = declare(scope, name.variable);
    // A helper that calls itself sees its own name: Recursive($f, Lambda(...)).
    const v = typeof value === "function" ? value(inner) : value;
    const own = { variable: ir };
    // A name that changes holds a cell of its value.
    if (inner.cells.has(ir)) return c("Bind", own, c("Cell", v), body(inner));
    const recursive = isHead(v, "Lambda", 2) && [...freeIn(v, new Set())].includes(ir);
    return c("Bind", own, recursive ? c("Recursive", own, v) : v, body(inner));
  }
  if (typeof value === "function") value = value(scope);
  // A destructuring: the value once, then each part read from it. A part may have a
  // default, used where the value has nothing, and a List's last part may take the rest.
  const parts: { js: string; key: string | number; rest?: boolean; fallback?: Expr }[] = [];
  const part = (item: Expr, key: string | number) => {
    if (isHead(item, "Default", 2) && isVariable(item.args[0].value)) parts.push({ js: item.args[0].value.variable, key, fallback: item.args[1].value });
    else if (isVariable(item)) parts.push({ js: item.variable, key });
    else nope(`destructuring shape ${format(name)}`);
  };
  if (isHead(name, "Object")) {
    for (const a of name.args) {
      if (a.name === undefined) return nope(`destructuring shape ${format(name)}`);
      part(a.value, a.name);
    }
  } else if (isHead(name, "List")) {
    vals(name).forEach((item, i, all) => {
      if (isHead(item, "Hole")) return;
      if (isHead(item, "Spread", 1) && i === all.length - 1 && isVariable(item.args[0].value)) parts.push({ js: item.args[0].value.variable, key: i, rest: true });
      else part(item, i);
    });
  } else return nope(`destructuring shape ${format(name)}`);
  const t = fresh(scope);
  let inner = scope;
  const names: string[] = [];
  for (const { js } of parts) {
    const [ir, next] = declare(inner, js);
    names.push(ir);
    inner = next;
  }
  let out = body(inner);
  for (let i = parts.length - 1; i >= 0; i--) {
    const { key, rest, fallback } = parts[i];
    let read: Expr = rest ? c("Slice", t, key) : typeof key === "number" ? c("Element", t, key) : c("FieldOf", t, key);
    if (fallback !== undefined) {
      const r = fresh(inner);
      read = c("Bind", r, read, c("If", c("Identical", r, U), lowerExpr(fallback, inner), r));
    }
    out = c("Bind", { variable: names[i] }, inner.cells.has(names[i]) ? c("Cell", read) : read, out);
  }
  return c("Bind", t, value, out);
}

/** A condition as JavaScript tests it: truthiness. */
function truth(e: Expr, scope: Scope): Expr {
  const v = lowerExpr(e, scope);
  return isBoolean(v) ? v : c("Truthy", v);
}

/** Produces true or false already, so needs no Truthy. */
const isBoolean = (e: Expr): boolean =>
  typeof e === "boolean" || (isCall(e) && ["Identical", "NotIdentical", "IsNothing", "Below", "Above", "NotAbove", "NotBelow", "Truthy", "Falsy", "HasField", "IsLoopReturn", "AnySatisfies", "AllSatisfy", "MatchesPattern", "StartsWith", "EndsWith", "SetHas", "IsNotANumber", "IsFiniteNumber", "IsWholeNumber", "IsKnown"].includes(e.head));

function lowerExpr(e: Expr, scope: Scope): Expr {
  if (isVariable(e) && (e.variable === "NaN" || e.variable === "Infinity") && !scope.names.has(e.variable)) return c(e.variable === "NaN" ? "NotANumber" : "Infinite");
  if (isVariable(e) && e.variable === "__args") return argumentsList(scope);
  if (isVariable(e)) {
    const name = scope.names.get(e.variable) ?? e.variable;
    return scope.cells.has(name) ? c("Get", { variable: name }) : { variable: name };
  }
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
      const name = scope.argument.get(i);
      // A literal in the pattern (Can(You(), $x)) is what args[i] holds there, quoted so it is
      // not evaluated again.
      if (name === undefined) {
        const literal = scope.pattern[i]?.value;
        if (literal === undefined || isHead(literal, "Rest")) return nope(`args[${i}] past the pattern`);
        return c("Quote", literal);
      }
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
  }
  // Anything else reached through api (api.store.asObject, api.relations.of): the graph
  // operation that means the same.
  const path = hostPath(is(e, "Call") ? args[0] : e);
  if (path !== undefined && path !== "call" && path !== "evaluate" && path !== "format") {
    if (is(e, "Call")) {
      const to = Object.hasOwn(HOST_CALLS, path) ? HOST_CALLS[path] : nope(`api.${path}`);
      return to(spreadless(args.slice(1)).map(x));
    }
    return Object.hasOwn(HOST_VALUES, path) ? c(HOST_VALUES[path]) : nope(`api.${path}`);
  }

  // The language's own library: each onto the operation that means the same.
  if (is(e, "New") && isVariable(args[0]) && !scope.names.has(args[0].variable)) {
    return construct(args[0].variable, spreadless(args.slice(1)).map(x));
  }
  if (is(e, "Call") && isVariable(args[0]) && !scope.names.has(args[0].variable) && Object.hasOwn(GLOBAL_CALLS, args[0].variable)) {
    return GLOBAL_CALLS[args[0].variable](args.slice(1), scope);
  }
  if ((is(e, "Member", 2) || is(e, "OptionalMember", 2)) && isVariable(args[0]) && GLOBAL_OBJECTS.has(args[0].variable) && !scope.names.has(args[0].variable)) {
    const name = `${args[0].variable}.${String(args[1])}`;
    if (Object.hasOwn(GLOBAL_VALUES, name)) return GLOBAL_VALUES[name];
    // A library function handed on as a value, xs.some(Number.isNaN): a Lambda that calls it.
    if (Object.hasOwn(GLOBAL_CALLS, name)) {
      const t = fresh(scope);
      return c("Lambda", c("List", t), GLOBAL_CALLS[name]([t], scope));
    }
    return nope(name);
  }
  if (is(e, "Call") && (isHead(args[0], "Member", 2) || isHead(args[0], "OptionalMember", 2))) {
    const [target, ...rest] = args;
    const receiver = (target as Call).args[0].value;
    const name = (target as Call).args[1].value;
    if (typeof name !== "string") return nope("computed method");
    if (isVariable(receiver) && GLOBAL_OBJECTS.has(receiver.variable) && !scope.names.has(receiver.variable)) {
      const full = `${receiver.variable}.${name}`;
      return Object.hasOwn(GLOBAL_CALLS, full) ? GLOBAL_CALLS[full](rest, scope) : nope(full);
    }
    const local = isVariable(receiver) ? scope.names.get(receiver.variable) ?? receiver.variable : undefined;
    if (MUTATING.has(name) || (name === "sort" && local !== undefined && scope.cells.has(local))) return mutate(receiver, name, rest, scope);
    const method = Object.hasOwn(METHODS, name) ? METHODS[name] : nope(`.${name}`);
    const recv = x(receiver);
    const inner = method(recv, spreadless(rest).map(x));
    // receiver?.name(...) stops at a missing receiver.
    if (!isHead(target, "OptionalMember")) return inner;
    const t = fresh(scope);
    return c("Bind", t, recv, c("If", c("IsNothing", t), U, substituteFirst(inner, recv, t)));
  }

  if (is(e, "Assign", 2)) {
    const target = args[0];
    // xs[i] = v on a local array: its cell holds the array with that element replaced.
    if (isHead(target, "Index", 2) && isVariable(target.args[0].value)) {
      const cell = scope.names.get(target.args[0].value.variable) ?? target.args[0].value.variable;
      if (!scope.cells.has(cell)) return nope("assignment to an element of what is not a local");
      const ref = { variable: cell };
      const t = fresh(scope);
      return c("Bind", t, x(args[1]), c("Steps", c("Set", ref, c("WithElement", c("Get", ref), x(target.args[1].value), t)), t));
    }
    const name = isVariable(target) ? scope.names.get(target.variable) ?? target.variable : undefined;
    if (name === undefined || !scope.cells.has(name)) return nope(isVariable(target) ? `assignment to ${target.variable}` : "assignment to a field");
    return c("Set", { variable: name }, x(args[1]));
  }
  if ((is(e, "PostIncrement", 1) || is(e, "PostDecrement", 1) || is(e, "PreIncrement", 1) || is(e, "PreDecrement", 1)) && isVariable(args[0])) {
    const name = scope.names.get(args[0].variable) ?? args[0].variable;
    if (!scope.cells.has(name)) return nope("increment of a const");
    const ref = { variable: name };
    const step = head.endsWith("Increment") ? "AddValues" : "SubtractValues";
    if (head.startsWith("Pre")) return c("Set", ref, c(step, c("Get", ref), 1));
    const t = fresh(scope);
    return c("Bind", t, c("Get", ref), c("Steps", c("Set", ref, c(step, t, 1)), t));
  }
  if (is(e, "Await", 1)) return x(args[0]);
  // The IR is asynchronous already: an async function is a function.
  if (is(e, "Async", 1) && isHead(args[0], "Lambda")) return x(args[0]);
  // A regular expression is a value, Regex("source", "flags").
  if (is(e, "Regex", 2) && typeof args[0] === "string" && typeof args[1] === "string") return e;
  if (is(e, "Member", 2) && args[1] === "head") return c("Head", x(args[0]));
  if (is(e, "Member", 2) && args[1] === "size") return c("SizeOf", x(args[0]));
  if (is(e, "Member", 2) && args[1] === "args") return c("Arguments", x(args[0]));
  if (is(e, "Member", 2) && typeof args[1] === "string") return c("FieldOf", x(args[0]), args[1]);
  if (is(e, "OptionalMember", 2) && typeof args[1] === "string") {
    const t = fresh(scope);
    const read = args[1] === "head" ? c("Head", t) : args[1] === "args" ? c("Arguments", t) : c("FieldOf", t, args[1]);
    return c("Bind", t, x(args[0]), c("If", c("IsNothing", t), U, read));
  }
  if (is(e, "Index", 2)) return c("Element", x(args[0]), x(args[1]));
  if (is(e, "OptionalIndex", 2)) {
    const t = fresh(scope);
    return c("Bind", t, x(args[0]), c("If", c("IsNothing", t), U, c("Element", t, x(args[1]))));
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
    const test = head === "Otherwise" ? c("IsNothing", t) : c("Truthy", t);
    const [yes, no] = head === "And" ? [right, t] : head === "Or" ? [t, right] : [right, t];
    return c("Bind", t, left, c("If", test, yes, no));
  }
  // == and != only against null or undefined: whether there is nothing there.
  if ((is(e, "LooseEquals", 2) || is(e, "LooseNotEquals", 2)) && args.some((v) => v === null || isHead(v, "Undefined", 0))) {
    const other = args[0] === null || isHead(args[0], "Undefined", 0) ? args[1] : args[0];
    const nothing = c("IsNothing", x(other));
    return head === "LooseEquals" ? nothing : c("Falsy", nothing);
  }
  if (Object.hasOwn(OPERATORS, head) && (args.length === 2 || args.length === 1)) return call(OPERATORS[head], args.map((v) => ({ value: x(v) })));
  if (is(e, "Lambda", 2)) {
    const [ps, body] = args;
    if (!isHead(ps, "List")) nope("parameter shape");
    let inner = scope;
    const params: Expr[] = [];
    const cells: [Expr, Expr][] = [];
    // Parameters that are not a plain name: a default, a destructuring. Each takes a fresh
    // name, and the body begins by binding what the source named from it.
    const shaped: [Expr, Expr][] = [];
    for (const p of vals(ps as Call)) {
      if (isHead(p, "Spread", 1) && isVariable(p.args[0].value)) {
        const [ir, next] = declare(inner, p.args[0].value.variable);
        inner = next;
        params.push(c("Rest", { variable: ir }));
        continue;
      }
      if (!isVariable(p)) {
        const given = fresh(inner);
        params.push(given);
        shaped.push([p, given]);
        continue;
      }
      const [ir, next] = declare(inner, p.variable);
      inner = next;
      // A parameter the body changes is a cell, given the value it was called with.
      if (inner.cells.has(ir)) {
        const given = fresh(inner);
        params.push(given);
        cells.push([{ variable: ir }, given]);
      } else params.push({ variable: ir });
    }
    const bodyIn = (s: Scope): Expr => {
      let out = lowerBody(body, s);
      for (const [name, given] of [...cells].reverse()) out = c("Bind", name, c("Cell", given), out);
      return out;
    };
    const shape = (i: number, s: Scope): Expr => {
      if (i >= shaped.length) return bodyIn(s);
      const [pattern, given] = shaped[i];
      if (isHead(pattern, "Default", 2)) {
        const [name, value] = vals(pattern);
        const chosen = c("If", c("Identical", given, U), lowerExpr(value, s), given);
        return bind(name, chosen, (t) => shape(i + 1, t), s);
      }
      return bind(pattern, given, (t) => shape(i + 1, t), s);
    };
    const lowered = shape(0, inner);
    return c("Lambda", call("List", params.map((value) => ({ value }))), lowered);
  }
  if (is(e, "Call")) {
    const [f, ...rest] = args;
    if (rest.some((v) => isHead(v, "Spread"))) return c("CallWith", x(f), listOf(rest, scope));
    return call("Call", [{ value: x(f) }, ...rest.map((v) => ({ value: x(v) }))]);
  }
  if (is(e, "Hole", 0)) return U;
  if (["Map", "Filter", "FlatMap", "Reduce", "Includes", "Length", "Concat", "List", "Sequence", "Bind"].includes(e.head)) {
    if (e.head === "List" && args.some((v) => isHead(v, "Spread"))) return listOf(args, scope);
    // [...a, b] reads as Concat(a, List(b)): what is spread may be a set, a map or text.
    const part = (v: Expr) => (e.head === "Concat" && !isHead(v, "List") ? c("AsList", x(v)) : x(v));
    const lowered = call(e.head === "Sequence" ? "Steps" : e.head, e.args.map((a: Argument) => (a.name === undefined ? { value: part(a.value) } : { name: a.name, value: x(a.value) })));
    // Includes answers True() or False(), and JavaScript's includes a boolean.
    return e.head === "Includes" ? c("Truthy", lowered) : lowered;
  }
  if (is(e, "Object") && e.args.some((a) => isHead(a.value, "Spread"))) {
    // { ...a, k: v }: the fields of each part in order, later ones winning.
    const parts = e.args.map((a) => {
      if (isHead(a.value, "Spread", 1)) return x(a.value.args[0].value);
      if (a.name === undefined) return nope("computed key");
      return call("Record", [{ name: a.name, value: x(a.value) }]);
    });
    return c("Merge", call("List", parts.map((value) => ({ value }))));
  }
  if (is(e, "Object")) {
    const keys = e.args.map((a) => a.name);
    // { head, args } is a call being made; anything else a record of its fields.
    if (keys.length === 2 && keys.includes("head") && keys.includes("args")) {
      const h = e.args.find((a) => a.name === "head")!.value;
      const as = e.args.find((a) => a.name === "args")!.value;
      return c("CallOf", x(h), x(as));
    }
    if (keys.some((k) => k === undefined)) return nope("computed key");
    return call("Record", e.args.map((a) => ({ name: a.name, value: x(a.value) })));
  }
  if (is(e, "Undefined", 0)) return U;
  return nope(e.head);
}

/**
 * `args` as a whole: an Argument record per pattern argument, the Rest ones included, as
 * the host would have passed them.
 */
function argumentsList(scope: Scope): Expr {
  const parts: Expr[] = [];
  const pattern = scope.pattern;
  let fixed: Expr[] = [];
  for (const a of pattern) {
    const v = a.value;
    const rest = isHead(v, "Rest", 1) && isVariable(v.args[0].value) ? v.args[0].value : undefined;
    if (rest) {
      if (fixed.length) parts.push(call("List", fixed.map((value) => ({ value }))));
      fixed = [];
      parts.push(c("Arguments", scope.lazy ? c("Quote", rest) : rest));
      continue;
    }
    const value = !isVariable(v) || scope.lazy ? c("Quote", v) : v;
    fixed.push(call("Argument", a.name === undefined ? [{ name: "value", value }] : [{ name: "name", value: a.name }, { name: "value", value }]));
  }
  if (fixed.length) parts.push(call("List", fixed.map((value) => ({ value }))));
  return parts.length === 1 ? parts[0] : call("Concat", parts.map((value) => ({ value })));
}

/**
 * A loop, as a primitive that runs a Lambda per turn: its body answers JsContinue(),
 * JsBreak() or JsReturned(value) to say how the turn ended, and what follows the loop runs
 * only if no turn returned.
 */
function lowerLoop(loop: Call, rest: Expr[], scope: Scope): Expr {
  const inner = { ...scope, inLoop: true };
  const thunk = (e: Expr, s: Scope) => c("Lambda", c("List"), e);
  let run: Expr;
  if (loop.head === "ForOf") {
    const [binding, iterable, body] = vals(loop);
    const item = fresh(scope);
    const turn = bind(binding, item, (s) => lowerBlock([body], { ...s, inLoop: true }), inner);
    run = c("LoopOver", lowerExpr(iterable, scope), c("Lambda", c("List", item), turn));
  } else if (loop.head === "While") {
    const [test, body] = vals(loop);
    run = c("LoopWhile", thunk(truth(test, scope), scope), thunk(lowerBlock([body], inner), inner));
  } else if (loop.head === "DoWhile") {
    const [body, test] = vals(loop);
    run = c("LoopDoWhile", thunk(lowerBlock([body], inner), inner), thunk(truth(test, scope), scope));
  } else if (loop.head === "For") {
    // for (init; test; step) body: the init is a statement before the loop, its names in scope.
    const [init, test, step, body] = vals(loop);
    return lowerBlock([init, c("ForLoop", test, step, body), ...rest], scope);
  } else {
    const [test, step, body] = vals(loop);
    run = c("LoopFor", thunk(test === true ? true : truth(test, scope), scope), thunk(lowerBlock([body], inner), inner), thunk(isHead(step, "Undefined", 0) ? U : lowerExpr(step, scope), scope));
  }
  const after = lowerBlock(rest, scope);
  const body = loop.head === "ForOf" ? loop.args[2].value : loop.head === "DoWhile" ? loop.args[0].value : loop.args[loop.args.length - 1].value;
  if (!returnsInside(body)) return c("Steps", run, after);
  // A turn that returned: the function returns, or hands the signal on to an outer loop.
  const r = fresh(scope);
  return c("Bind", r, run, c("If", c("IsLoopReturn", r), scope.inLoop ? r : c("LoopReturnValue", r), after));
}

/** xs.push(v) and the others that change xs: xs is a cell, given its changed value. */
function mutate(receiver: Expr, name: string, rest: Expr[], scope: Scope): Expr {
  const cell = isVariable(receiver) ? scope.names.get(receiver.variable) ?? receiver.variable : undefined;
  if (cell === undefined || !scope.cells.has(cell)) return nope(`.${name} on what is not a local`);
  const ref = { variable: cell };
  const values = spreadless(rest).map((v) => lowerExpr(v, scope));
  const now = c("Get", ref);
  const t = fresh(scope);
  const set = (next: Expr, answer: Expr) => c("Bind", t, next, c("Steps", c("Set", ref, t), answer));
  const list = call("List", values.map((value) => ({ value })));
  if (name === "push") return set(c("Concat", now, list), c("Length", t));
  if (name === "unshift") return set(c("Concat", list, now), c("Length", t));
  if (name === "pop" || name === "shift") {
    const l = fresh(scope);
    const taken = c("AtPosition", l, name === "pop" ? -1 : 0);
    const left = name === "pop" ? c("Slice", l, 0, -1) : c("Slice", l, 1);
    return c("Bind", l, now, c("Steps", c("Set", ref, left), taken));
  }
  if (name === "reverse") return set(c("Reverse", now), t);
  if (name === "sort") return set(call("Sort", [{ value: now }, ...values.map((value) => ({ value }))]), t);
  return nope(`.${name}`);
}

/** The library's objects, reached by name when nothing local has it. */
const GLOBAL_OBJECTS = new Set(["Number", "Math", "JSON", "Object", "Date", "Array", "String", "Reflect", "Promise", "Buffer", "Infinity", "NaN"]);
/** Methods that change what they are called on: cells, not operations. */
const MUTATING = new Set(["push", "unshift", "pop", "shift", "splice", "reverse", "fill", "copyWithin"]);

type Lowered = (receiver: Expr, xs: Expr[]) => Expr;
/** An operation taking between min and max arguments after the receiver. */
const takes = (min: number, max: number, f: Lowered): Lowered => (r, xs) =>
  xs.length < min || xs.length > max ? nope(`${xs.length} arguments`) : f(r, xs);
const op = (head: string, min = 0, max = min): Lowered => takes(min, max, (r, xs) => call(head, [r, ...xs].map((value) => ({ value }))));

/** A method call, onto the operation that means the same. */
const METHODS: Record<string, Lowered> = {
  find: op("FirstSatisfying", 1),
  findIndex: op("IndexSatisfying", 1),
  some: op("AnySatisfies", 1),
  every: op("AllSatisfy", 1),
  forEach: takes(1, 1, (r, [f]) => c("Steps", c("LoopOver", r, f), U)),
  map: op("Map", 1),
  filter: op("Filter", 1),
  flatMap: op("FlatMap", 1),
  reduce: op("Reduce", 2),
  sort: op("Sort", 0, 1),
  replace: op("Replace", 2),
  replaceAll: takes(2, 2, (r, [p, w]) => (isHead(p, "Regex", 2) ? c("Replace", r, p, w) : nope(".replaceAll of text"))),
  test: takes(1, 1, (r, [t]) => c("MatchesPattern", r, t)),
  exec: takes(1, 1, (r, [t]) => c("MatchOf", r, t)),
  join: takes(0, 1, (r, [sep]) => c("Join", r, sep ?? ",")),
  slice: takes(0, 2, (r, xs) => call("Slice", [r, ...(xs.length ? xs : [0])].map((value) => ({ value })))),
  indexOf: op("IndexOf", 1),
  includes: takes(1, 1, (r, [v]) => c("Truthy", c("Includes", r, v))),
  toLowerCase: op("Lowercase"),
  toUpperCase: op("Uppercase"),
  padStart: op("PadStart", 1, 2),
  startsWith: op("StartsWith", 1),
  endsWith: op("EndsWith", 1),
  split: op("Split", 1),
  at: op("AtPosition", 1),
  localeCompare: op("CompareText", 1),
  concat: takes(0, 99, (r, xs) => call("Concat", [r, ...xs].map((value) => ({ value })))),
  toString: op("ToText"),
  getFullYear: op("YearOf"),
  // The month counts from 1; JavaScript's from 0.
  getMonth: takes(0, 0, (r) => c("SubtractValues", c("MonthOf", r), 1)),
  getDate: op("DayOf"),
  getDay: op("WeekdayOf"),
  getHours: op("HourOf"),
  getMinutes: op("MinuteOf"),
  getTime: op("MillisecondsOf"),
  toISOString: op("IsoText"),
  add: op("SetAdd", 1),
  has: op("SetHas", 1),
  get: op("MapGet", 1),
  set: op("MapSet", 2),
  values: op("ValuesOf"),
};

type Library = (raw: Expr[], scope: Scope) => Expr;
/** A library function, onto the operation. Its arguments raw, so a spread can be a List. */
const fn = (head: string, n = 1): Library => (raw, scope) =>
  raw.length !== n ? nope(`${head} of ${raw.length}`) : call(head, spreadless(raw).map((v) => ({ value: lowerExpr(v, scope) })));
const ofList = (head: string): Library => (raw, scope) => c(head, listOf(raw, scope));
const GLOBAL_CALLS: Record<string, Library> = {
  "Number.isNaN": fn("IsNotANumber"),
  "Number.isFinite": fn("IsFiniteNumber"),
  "Number.isInteger": fn("IsWholeNumber"),
  Number: fn("ToNumber"),
  String: fn("ToText"),
  "Math.floor": fn("RoundDown"),
  "Math.ceil": fn("RoundUp"),
  "Math.round": fn("RoundNearest"),
  "Math.abs": fn("AbsoluteValue"),
  "Math.sqrt": fn("SquareRootOf"),
  "Math.cbrt": fn("CubeRootOf"),
  "Math.pow": fn("RaiseToPower", 2),
  "Math.max": ofList("Largest"),
  "Math.min": ofList("Smallest"),
  "JSON.stringify": fn("Json"),
  "Object.keys": fn("Fields"),
  // The month counts from 1.
  "Date.UTC": (raw, scope) => {
    if (raw.length !== 3) return nope("Date.UTC of " + raw.length);
    const [y, m, d] = spreadless(raw).map((v) => lowerExpr(v, scope));
    return c("UtcMilliseconds", y, c("AddValues", m, 1), d);
  },
};
const GLOBAL_VALUES: Record<string, Expr> = {
  "Math.PI": Math.PI,
  "Math.E": Math.E,
  "Number.MAX_SAFE_INTEGER": Number.MAX_SAFE_INTEGER,
  "Number.MIN_SAFE_INTEGER": Number.MIN_SAFE_INTEGER,
  "Number.EPSILON": Number.EPSILON,
  "Number.POSITIVE_INFINITY": c("Infinite"),
  "Number.NEGATIVE_INFINITY": c("NegateValue", c("Infinite")),
  "Number.NaN": c("NotANumber"),
};

/** new X(...), onto what makes the value it stands for. */
function construct(name: string, xs: Expr[]): Expr {
  if (name === "Date") {
    if (xs.length === 0) return c("CurrentInstant");
    if (xs.length === 1) return c("InstantFrom", xs[0]);
    // The month counts from 1.
    if (xs.length >= 3 && xs.length <= 6) return call("LocalInstant", [xs[0], c("AddValues", xs[1], 1), ...xs.slice(2)].map((value) => ({ value })));
  }
  // What is thrown is its message.
  if (name === "Error" && xs.length === 1) return xs[0];
  if (name === "Set" && xs.length <= 1) return call("NewSet", xs.map((value) => ({ value })));
  if (name === "Map" && xs.length <= 1) return call("NewMap", xs.map((value) => ({ value })));
  if (name === "RegExp" && xs.length >= 1 && xs.length <= 2) return c("Regex", xs[0], xs[1] ?? "");
  return nope(`new ${name}`);
}

/** The host's facilities, by path, onto the graph operations. */
const HOST_CALLS: Record<string, (xs: Expr[]) => Expr> = Object.fromEntries(
  Object.entries({
    "store.asObject": ["ClaimsWithObject", 1, 1],
    "store.asSubject": ["ClaimsWithSubject", 1, 1],
    "store.get": ["UnitOf", 1, 1],
    "store.has": ["IsKnown", 1, 1],
    "store.all": ["AllUnits", 0, 0],
    "store.addRelation": ["Assert", 2, 4],
    "relations.of": ["ClaimsOf", 1, 2],
    "store.mentioning": ["MentionsOf", 1, 1],
    "store.mint": ["MintIdentity", 1, 1],
    "store.findStamp": ["StampOf", 1, 1],
    "store.between": ["StampsBetween", 2, 2],
    "store.collect": ["CollectStamps", 1, 1],
    "store.seed": ["SeedUnit", 1, 1],
    "store.addRealization": ["AddRealization", 2, 2],
    ambient: ["Ambient", 1, 1],
    forgetTurns: ["ForgetTurns", 1, 1],
    parse: ["ParseExpression", 1, 1],
  } as Record<string, [string, number, number]>).map(([path, [head, min, max]]) => [
    path,
    (xs: Expr[]) => (xs.length < min || xs.length > max ? nope(`api.${path} of ${xs.length}`) : call(head, xs.map((value) => ({ value })))),
  ]),
);
HOST_CALLS.rank = (xs) => (xs.length === 1 ? c("Rank", xs[0], c("List")) : xs.length === 2 ? c("Rank", xs[0], xs[1]) : nope("api.rank"));
const HOST_VALUES: Record<string, string> = { "trace.cause": "CurrentCause", context: "CurrentContext", events: "Events" };

/** api.store.asObject as "store.asObject": a member chain rooted at the host's api. */
function hostPath(e: Expr): string | undefined {
  if (!isHead(e, "Member", 2) && !isHead(e, "OptionalMember", 2)) return undefined;
  const [o, k] = vals(e);
  if (typeof k !== "string") return undefined;
  if (isVar(o, "__api")) return k;
  const inner = hostPath(o);
  return inner === undefined ? undefined : `${inner}.${k}`;
}

/** Arguments, which a bridge takes one by one: a spread among them is not lowered yet. */
function spreadless(values: Expr[]): Expr[] {
  if (values.some((v) => isHead(v, "Spread"))) nope("spread arguments");
  return values;
}

/** The receiver in a lowered call replaced by the name it was bound to. */
function substituteFirst(e: Expr, receiver: Expr, t: Expr): Expr {
  if (!isCall(e)) return e;
  return call(e.head, e.args.map((a, i) => (i === 0 && a.value === receiver ? { value: t } : a)));
}

/** Arguments with spreads in them, as one List: api.call("X", ...xs) or [...a, b]. */
function listOf(items: Expr[], scope: Scope): Expr {
  const parts: Expr[] = [];
  let run: Expr[] = [];
  for (const v of items) {
    if (isHead(v, "Spread", 1)) {
      if (run.length) parts.push(call("List", run.map((value) => ({ value }))));
      run = [];
      parts.push(c("AsList", lowerExpr(v.args[0].value, scope)));
    } else run.push(lowerExpr(v, scope));
  }
  if (!parts.length) return call("List", run.map((value) => ({ value })));
  if (run.length) parts.push(call("List", run.map((value) => ({ value }))));
  return parts.length === 1 ? parts[0] : call("Concat", parts.map((value) => ({ value })));
}

export { format };
