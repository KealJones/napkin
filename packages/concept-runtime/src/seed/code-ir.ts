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

export function codeIrUnits(): ConceptUnit[] {
  return [
    concept("CodePrimitive", { relations: ["IsA(Category())"] }),
    // A function value: stays as it is until called.
    concept("Lambda", { relations: ["IsA(Marker())"] }),

    primitive("Call", "Call($f, Rest($args))", `return await apply(v(0), args.slice(1).map((a) => a.value));`),

    // Logic. Not, And and Or are words a message says too ("don't", "apples and pears"),
    // so they only compute over truth values and otherwise stay as said. And and Or stop at
    // the first answer, so their arguments are not evaluated first.
    primitive("Equals", "Equals($a, $b)", `return bool(api.format(v(0)) === api.format(v(1)));`),
    primitive("NotEquals", "NotEquals($a, $b)", `return bool(api.format(v(0)) !== api.format(v(1)));`),
    primitive("Not", "Not($x)", `const x = v(0); if (!isTruth(x)) return api.call("Not", x); return truthy(x) ? api.call("False") : api.call("True");`),
    primitive("And", "And(Rest($xs))", `for (const a of args) { const x = await api.evaluate(a.value); if (!isTruth(x)) return api.call("And", ...args.map((b) => b.value)); if (!truthy(x)) return api.call("False"); } return api.call("True");`, false),
    primitive("Or", "Or(Rest($xs))", `for (const a of args) { const x = await api.evaluate(a.value); if (!isTruth(x)) return api.call("Or", ...args.map((b) => b.value)); if (truthy(x)) return api.call("True"); } return api.call("False");`, false),

    // Lists.
    primitive("Length", "Length($xs)", `return items(v(0)).length;`),
    primitive("Concat", "Concat(Rest($lists))", `return list(args.flatMap((a) => items(a.value)));`),
    primitive("Includes", "Includes($xs, $x)", `const x = api.format(v(1)); return bool(items(v(0)).some((i) => api.format(i) === x));`),
    primitive("Map", "Map($xs, $f)", `const out = []; for (const x of items(v(0))) out.push(await apply(v(1), [x])); return list(out);`),
    primitive("FlatMap", "FlatMap($xs, $f)", `const out = []; for (const x of items(v(0))) out.push(...items(await apply(v(1), [x]))); return list(out);`),
    primitive("Filter", "Filter($xs, $f)", `const out = []; for (const x of items(v(0))) if (truthy(await apply(v(1), [x]))) out.push(x); return list(out);`),
    primitive("Reduce", "Reduce($xs, $f, $initial)", `let acc = v(2); for (const x of items(v(0))) acc = await apply(v(1), [acc, x]); return acc;`),

    // Expressions as data: what a call is made of.
    primitive("Head", "Head($e)", `return isCall(v(0)) ? v(0).head : api.call("Undefined");`),
    primitive("Arg", "Arg($e, $i)", `const a = isCall(v(0)) ? v(0).args.filter((x) => x.name === undefined)[v(1)] : undefined; return a ? a.value : api.call("Undefined");`),
    primitive("ArgNamed", "ArgNamed($e, $name)", `const a = isCall(v(0)) ? v(0).args.find((x) => x.name === v(1)) : undefined; return a ? a.value : api.call("Undefined");`),
    primitive("MakeCall", "MakeCall($head, $args)", `return { head: String(v(0)), args: items(v(1)).map((value) => ({ value })) };`),

    // The store, read. What holds in any context and was not retracted.
    primitive(
      "Subjects",
      "Subjects($predicate, $object)",
      `const o = isCall(v(1)) ? v(1).head : api.format(v(1));
      return list(api.store.asObject(o).filter((t) => t.predicate === String(v(0)) && t.context === undefined && !api.store.retracted(t.subject, t.expr)).map((t) => api.call(t.subject)));`,
    ),
    primitive(
      "Holds",
      "Holds($subject, $predicate)",
      `const s = isCall(v(0)) ? v(0).head : String(v(0));
      return list(api.relations.of(s, { transitive: false }).filter((t) => t.predicate === String(v(1)) && !t.context).map((t) => t.object));`,
    ),
  ];
}
