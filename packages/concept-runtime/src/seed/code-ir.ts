/**
 * The code IR as Concepts that run (ir-spec Part 10.2), so a realization can be written in
 * Concepts instead of as a JavaScript string.
 *
 * Each primitive is one small `Code(...)` body: the only JavaScript left is here, and a
 * realization composed from these is data the graph can read, compare, and one day have a
 * Rust host run with nothing but these primitives rewritten. Substitution is the binding
 * rule, as `Let` already does: a `Lambda`'s parameters are replaced by the values it is
 * called with, then the body is evaluated.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

const HELPERS = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const truthy = (v) => v === true || (isCall(v) && v.head === "True");
  const isTruth = (v) => typeof v === "boolean" || (isCall(v) && (v.head === "True" || v.head === "False") && !v.args.length);
  const bool = (b) => api.call(b ? "True" : "False");
  const items = (v) => (isCall(v) && v.head === "List" ? v.args.map((a) => a.value) : []);
  const list = (xs) => ({ head: "List", args: xs.map((value) => ({ value })) });
  // Calling a Lambda: its parameters replaced by the values, then its body evaluated.
  const apply = async (f, values) => {
    if (!isCall(f) || f.head !== "Lambda") return api.call("Call", f, ...values);
    const params = items(f.args[0]?.value).map((p) => p && p.variable);
    const bound = new Map(params.map((p, i) => [p, values[i]]));
    return await api.evaluate(api.substitute(f.args[1].value, bound));
  };
`;

/** One primitive: a pattern, a body, and whether its arguments are evaluated first. */
const primitive = (identity: string, pattern: string, body: string, evaluateArguments = true): ConceptUnit =>
  concept(identity, {
    relations: ["IsA(CodePrimitive())"],
    realizations: [
      realization({
        pattern,
        context: "Execution()",
        evaluateArguments,
        body: code(`async (args, bindings, api) => {
          ${HELPERS}
          const v = (i) => args[i]?.value;
          ${body}
        }`),
      }),
    ],
  });

/**
 * What a call compiles to (runtime/compile.ts): JavaScript with `$name` where the code its
 * argument compiled to goes, stored as `Text(...)` under `Context(JavaScript(), Compiled())`.
 * Read as a template, never run. A value appearing twice is bound once, so nothing is
 * evaluated twice.
 */
const compiled = (identity: string, pattern: string, js: string): ConceptUnit => {
  const parts: Expr[] = [];
  const re = /\$([a-z][A-Za-z0-9]*)/g;
  let at = 0;
  for (let m = re.exec(js); m; m = re.exec(js)) {
    if (m.index > at) parts.push(js.slice(at, m.index));
    parts.push({ variable: m[1] });
    at = m.index + m[0].length;
  }
  if (at < js.length) parts.push(js.slice(at));
  return concept(identity, {
    realizations: [
      realization({
        pattern,
        context: "Context(JavaScript(), Compiled())",
        body: call("Text", parts.map((value) => ({ value }))),
      }),
    ],
  });
};

/** The compiled forms, one per primitive, and for the arithmetic and If that already run. */
const TEMPLATES: ConceptUnit[] = [
  compiled("List", "List(Rest($xs))", "L([$xs])"),
  compiled("Call", "Call($f, Rest($args))", "(await ($f)($args))"),
  compiled("Equals", "Equals($a, $b)", "B(F($a) === F($b))"),
  compiled("NotEquals", "NotEquals($a, $b)", "B(F($a) !== F($b))"),
  compiled("Not", "Not($x)", "((x) => (T(x) || (isCall(x) && x.head === \"False\")) ? B(!T(x)) : E(\"Not\", x))($x)"),
  compiled("And", "And($a, $b)", "B(T($a) && T($b))"),
  compiled("Or", "Or($a, $b)", "B(T($a) || T($b))"),
  compiled("Length", "Length($xs)", "((xs) => (typeof xs === \"string\" ? xs.length : I(xs).length))($xs)"),
  compiled("Concat", "Concat(Rest($lists))", "L([$lists].flatMap(I))"),
  compiled("Includes", "Includes($xs, $x)", "((xs, x) => B(typeof xs === \"string\" ? typeof x === \"string\" && xs.includes(x) : I(xs).some((i) => F(i) === F(x))))($xs, $x)"),
  // In order, as the interpreter does: two identical calls at once read as a cycle.
  compiled("Map", "Map($xs, $f)", "L(await (async (xs, f) => { const o = []; for (const x of xs) o.push(await f(x)); return o; })(I($xs), $f))"),
  compiled("FlatMap", "FlatMap($xs, $f)", "L(await (async (xs, f) => { const o = []; for (const x of xs) o.push(...I(await f(x))); return o; })(I($xs), $f))"),
  compiled("Filter", "Filter($xs, $f)", "L(await (async (xs, f) => { const o = []; for (const x of xs) if (T(await f(x))) o.push(x); return o; })(I($xs), $f))"),
  compiled("Reduce", "Reduce($xs, $f, $initial)", "(await (async (xs, f, acc) => { for (const x of xs) acc = await f(acc, x); return acc; })(I($xs), $f, $initial))"),
  compiled("Unique", "Unique($xs)", "((xs) => { const seen = new Set(); return L(I(xs).filter((x) => !seen.has(F(x)) && seen.add(F(x)))); })($xs)"),
  compiled("Matches", "Matches($text, $pattern)", "((t, p) => B(typeof t === \"string\" && new RegExp(p).test(t)))($text, $pattern)"),
  compiled("First", "First($xs)", "((xs) => (xs.length ? xs[0] : api.call(\"Undefined\")))(I($xs))"),
  compiled("JoinText", "JoinText(Rest($parts))", "[$parts].map((p) => (typeof p === \"string\" ? p : F(p))).join(\"\")"),
  compiled("IsCall", "IsCall($x)", "B(isCall($x))"),
  compiled("Evaluate", "Evaluate($x)", "(await api.evaluate($x))"),
  compiled("Known", "Known($x)", "B(api.store.has(K($x)))"),
  compiled("TruthOf", "TruthOf($subject, $predicate, $object)", "((s, p, o) => api.call({ true: \"True\", false: \"False\" }[api.relations.truth(K(s), String(p), o)] ?? \"UnknownTruth\"))($subject, $predicate, $object)"),
  compiled("Closure", "Closure($subject, $predicate)", "((s, p) => L(api.relations.of(K(s)).filter((t) => t.predicate === String(p) && !t.context && t.object !== undefined).map((t) => t.object)))($subject, $predicate)"),
  compiled("Claimed", "Claimed($subject, $predicate)", "((s, p) => B(api.relations.of(K(s)).some((t) => t.predicate === String(p) && !t.context && t.object === undefined)))($subject, $predicate)"),
  compiled("Head", "Head($e)", "((e) => (isCall(e) ? e.head : api.call(\"Undefined\")))($e)"),
  compiled("Arg", "Arg($e, $i)", "((e, i) => { const a = isCall(e) ? e.args.filter((x) => x.name === undefined)[i] : undefined; return a ? a.value : api.call(\"Undefined\"); })($e, $i)"),
  compiled("ArgNamed", "ArgNamed($e, $name)", "((e, n) => { const a = isCall(e) ? e.args.find((x) => x.name === n) : undefined; return a ? a.value : api.call(\"Undefined\"); })($e, $name)"),
  compiled("MakeCall", "MakeCall($head, $args)", "((h, xs) => ({ head: String(h), args: I(xs).map((value) => ({ value })) }))($head, $args)"),
  compiled("Subjects", "Subjects($predicate, $object)", "((p, o) => L(api.store.asObject(K(o)).filter((t) => t.predicate === String(p) && t.context === undefined && !api.store.retracted(t.subject, t.expr)).map((t) => api.call(t.subject))))($predicate, $object)"),
  compiled("Holds", "Holds($subject, $predicate)", "((s, p) => L(api.relations.of(K(s), { transitive: false }).filter((t) => t.predicate === String(p) && !t.context).map((t) => t.object)))($subject, $predicate)"),
  compiled("If", "If($condition, $then, $otherwise)", "(T($condition) ? $then : $otherwise)"),
  compiled("Add", "Add($a, $b)", "(await N(\"Add\", $a, $b, (x, y) => x + y))"),
  compiled("Subtract", "Subtract($a, $b)", "(await N(\"Subtract\", $a, $b, (x, y) => x - y))"),
  compiled("Multiply", "Multiply($a, $b)", "(await N(\"Multiply\", $a, $b, (x, y) => x * y))"),
  compiled("Divide", "Divide($a, $b)", "(await N(\"Divide\", $a, $b, (x, y) => (y === 0 ? api.call(\"Undefined\") : x / y)))"),
  compiled("GreaterThan", "GreaterThan($a, $b)", "(await N(\"GreaterThan\", $a, $b, (x, y) => B(x > y)))"),
  compiled("LessThan", "LessThan($a, $b)", "(await N(\"LessThan\", $a, $b, (x, y) => B(x < y)))"),
];

export function codeIrUnits(): ConceptUnit[] {
  return [
    ...TEMPLATES,
    concept("Compiled", { relations: ["IsA(ContextFacet())"] }),
    concept("Compile", { relations: ["IsA(RealizationProperty())"] }),
    concept("CodePrimitive", { relations: ["IsA(Category())"] }),
    // A function value: stays as it is until called.
    concept("Lambda", { relations: ["IsA(Marker())"] }),
    // A list literal is its elements' values, as an array literal is: List(Arg(e, 0)) is the
    // argument, not the expression that would find it.
    concept("List", {
      realizations: [realization({ pattern: "List(Rest($xs))", context: "Execution()", body: code(`(args, bindings, api) => ({ head: "List", args: args.map((a) => ({ value: a.value })) })`) })],
    }),

    primitive("Call", "Call($f, Rest($args))", `return await apply(v(0), args.slice(1).map((a) => a.value));`),

    // Logic. Not, And and Or are words a message says too ("don't", "apples and pears"),
    // so they only compute over truth values and otherwise stay as said. And and Or stop at
    // the first answer, so their arguments are not evaluated first.
    primitive("Equals", "Equals($a, $b)", `return bool(api.format(v(0)) === api.format(v(1)));`),
    primitive("NotEquals", "NotEquals($a, $b)", `return bool(api.format(v(0)) !== api.format(v(1)));`),
    primitive("Not", "Not($x)", `const x = v(0); if (!isTruth(x)) return api.call("Not", x); return truthy(x) ? api.call("False") : api.call("True");`),
    primitive("And", "And(Rest($xs))", `for (const a of args) { const x = await api.evaluate(a.value); if (!isTruth(x)) return api.call("And", ...args.map((b) => b.value)); if (!truthy(x)) return api.call("False"); } return api.call("True");`, false),
    primitive("Or", "Or(Rest($xs))", `for (const a of args) { const x = await api.evaluate(a.value); if (!isTruth(x)) return api.call("Or", ...args.map((b) => b.value)); if (truthy(x)) return api.call("True"); } return api.call("False");`, false),

    // Lists, and text where JavaScript's own length and includes read text too.
    primitive("Length", "Length($xs)", `return typeof v(0) === "string" ? v(0).length : items(v(0)).length;`),
    primitive("Concat", "Concat(Rest($lists))", `return list(args.flatMap((a) => items(a.value)));`),
    primitive("Includes", "Includes($xs, $x)", `if (typeof v(0) === "string") return bool(typeof v(1) === "string" && v(0).includes(v(1))); const x = api.format(v(1)); return bool(items(v(0)).some((i) => api.format(i) === x));`),
    primitive("Map", "Map($xs, $f)", `const out = []; for (const x of items(v(0))) out.push(await apply(v(1), [x])); return list(out);`),
    primitive("FlatMap", "FlatMap($xs, $f)", `const out = []; for (const x of items(v(0))) out.push(...items(await apply(v(1), [x]))); return list(out);`),
    primitive("Filter", "Filter($xs, $f)", `const out = []; for (const x of items(v(0))) if (truthy(await apply(v(1), [x]))) out.push(x); return list(out);`),
    primitive("Reduce", "Reduce($xs, $f, $initial)", `let acc = v(2); for (const x of items(v(0))) acc = await apply(v(1), [acc, x]); return acc;`),

    primitive("Unique", "Unique($xs)", `const seen = new Set(); return list(items(v(0)).filter((x) => !seen.has(api.format(x)) && seen.add(api.format(x))));`),

    primitive("First", "First($xs)", `const xs = items(v(0)); return xs.length ? xs[0] : api.call("Undefined");`),

    // Text.
    primitive("JoinText", "JoinText(Rest($parts))", `return args.map((a) => (typeof a.value === "string" ? a.value : api.format(a.value))).join("");`),
    primitive("Matches", "Matches($text, $pattern)", `return bool(typeof v(0) === "string" && new RegExp(v(1)).test(v(0)));`),

    // Expressions as data: what a call is made of.
    primitive("Head", "Head($e)", `return isCall(v(0)) ? v(0).head : api.call("Undefined");`),
    primitive("Arg", "Arg($e, $i)", `const a = isCall(v(0)) ? v(0).args.filter((x) => x.name === undefined)[v(1)] : undefined; return a ? a.value : api.call("Undefined");`),
    primitive("ArgNamed", "ArgNamed($e, $name)", `const a = isCall(v(0)) ? v(0).args.find((x) => x.name === v(1)) : undefined; return a ? a.value : api.call("Undefined");`),
    primitive("MakeCall", "MakeCall($head, $args)", `return { head: String(v(0)), args: items(v(1)).map((value) => ({ value })) };`),

    primitive("IsCall", "IsCall($x)", `return bool(isCall(v(0)));`),
    // An expression held as a value, run. The arguments of a Concept that reads them
    // unevaluated arrive as expressions; this is how its body evaluates one.
    primitive("Evaluate", "Evaluate($x)", `return await api.evaluate(v(0));`),

    // The store, read. What holds in any context and was not retracted.
    primitive(
      "Subjects",
      "Subjects($predicate, $object)",
      `const o = isCall(v(1)) ? v(1).head : String(v(1));
      return list(api.store.asObject(o).filter((t) => t.predicate === String(v(0)) && t.context === undefined && !api.store.retracted(t.subject, t.expr)).map((t) => api.call(t.subject)));`,
    ),
    primitive("Known", "Known($x)", `return bool(api.store.has(isCall(v(0)) ? v(0).head : String(v(0))));`),
    // Whether a relation holds, with inheritance and transitivity: True, False or UnknownTruth.
    primitive(
      "TruthOf",
      "TruthOf($subject, $predicate, $object)",
      `const s = isCall(v(0)) ? v(0).head : String(v(0));
      return api.call({ true: "True", false: "False" }[api.relations.truth(s, String(v(1)), v(2))] ?? "UnknownTruth");`,
    ),
    // What a subject holds by a predicate, inherited and transitive; Holds is what it states.
    primitive(
      "Closure",
      "Closure($subject, $predicate)",
      `const s = isCall(v(0)) ? v(0).head : String(v(0));
      return list(api.relations.of(s).filter((t) => t.predicate === String(v(1)) && !t.context && t.object !== undefined).map((t) => t.object));`,
    ),
    // A nullary claim held, inherited: Small() for "the mouse is small".
    primitive(
      "Claimed",
      "Claimed($subject, $predicate)",
      `const s = isCall(v(0)) ? v(0).head : String(v(0));
      return bool(api.relations.of(s).some((t) => t.predicate === String(v(1)) && !t.context && t.object === undefined));`,
    ),
    primitive(
      "Holds",
      "Holds($subject, $predicate)",
      `const s = isCall(v(0)) ? v(0).head : String(v(0));
      return list(api.relations.of(s, { transitive: false }).filter((t) => t.predicate === String(v(1)) && !t.context).map((t) => t.object));`,
    ),
  ];
}
