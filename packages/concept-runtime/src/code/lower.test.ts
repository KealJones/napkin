import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, isCall, parse, type Expr } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { importTypeScript } from "./import.js";
import { lowerRealization } from "./lower.js";

/** A realization whose body is this JavaScript, as the packs hold it, and its lowered form. */
const lowered = (pattern: string, js: string, lazy = false) => {
  const module = importTypeScript(js).expression;
  assert.ok(isCall(module));
  const ir = module.args[0].value;
  const r = realization({ pattern, context: "Execution()", evaluateArguments: !lazy, body: c("Code", ir) });
  const withIr = { ...r, body: { head: "Code", args: [{ name: "ir", value: ir }] } };
  const out = lowerRealization(withIr);
  assert.ok("body" in out, "why" in out ? out.why : "");
  return out.body;
};

const run = async (identity: string, pattern: string, body: Expr, call: string, lazy = false) => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept(identity, { realizations: [realization({ pattern, context: "Execution()", evaluateArguments: !lazy, body })] }));
  return format(await new Runtime(store).evaluate(parse(call), c("Execution")));
};

test("a lowered body answers what its JavaScript answered", async () => {
  const neg = lowered("Neg($x)", '(args, bindings, api) => typeof args[0].value === "number" ? -args[0].value : api.call("Neg", args[0].value)');
  assert.equal(format(neg), 'If(Identical(TypeOf($x), "number"), JsNegate($x), MakeCall("Neg", List($x)))');
  assert.equal(await run("Neg", "Neg($x)", neg, "Neg(4)"), "-4");
  assert.equal(await run("Neg", "Neg($x)", neg, "Neg(Cats())"), "Neg(Cats())");
});

test("truthiness is JavaScript's: every object is true, False() included", async () => {
  const body = lowered("T($x)", '(args) => args[0].value ? "yes" : "no"');
  assert.equal(await run("T", "T($x)", body, "T(False())"), '"yes"');
  assert.equal(await run("T", "T($x)", body, "T(0)"), '"no"');
  assert.equal(await run("T", "T($x)", body, 'T("")'), '"no"');
});

test("&& and || answer an operand, and stop at the first that decides", async () => {
  const body = lowered("P($x)", "(args) => args[0].value && args[0].value.head");
  assert.equal(await run("P", "P($x)", body, "P(Dog())"), '"Dog"');
  assert.equal(await run("P", "P($x)", body, "P(0)"), "0");
});

test("a local that reuses the pattern's name is given its own", () => {
  const body = lowered("Take($x)", "async (args, bindings, api) => { const x = args[0].value; if (typeof x === 'number') { return x; } return await api.evaluate(x); }", true);
  assert.equal(format(body), 'Let($x2, Quote($x), If(Identical(TypeOf($x2), "number"), $x2, Evaluate($x2)))');
});

test("a body that falls through answers undefined, and early returns become If", async () => {
  const body = lowered("F($x)", '(args) => { if (args[0].value === 1) { return "one"; } if (args[0].value === 2) { return "two"; } }');
  assert.equal(await run("F", "F($x)", body, "F(2)"), '"two"');
  assert.equal(await run("F", "F($x)", body, "F(3)"), "Undefined()");
});
