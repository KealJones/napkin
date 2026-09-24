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
  assert.equal(format(neg), 'If(Identical(TypeOf($x), "number"), NegateValue($x), MakeCall("Neg", List($x)))');
  assert.equal(await run("Neg", "Neg($x)", neg, "Neg(4)"), "-4");
  assert.equal(await run("Neg", "Neg($x)", neg, "Neg(Cats())"), "Neg(Cats())");
});

test("truthiness is the IR's: every value is true but false, False(), nothing, 0, NaN and empty text", async () => {
  const body = lowered("T($x)", '(args) => args[0].value ? "yes" : "no"');
  assert.equal(await run("T", "T($x)", body, "T(Dog())"), '"yes"');
  assert.equal(await run("T", "T($x)", body, "T(False())"), '"no"');
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
  assert.equal(format(body), 'Bind($x2, Quote($x), If(Identical(TypeOf($x2), "number"), $x2, Evaluate($x2)))');
});

test("a body that falls through answers undefined, and early returns become If", async () => {
  const body = lowered("F($x)", '(args) => { if (args[0].value === 1) { return "one"; } if (args[0].value === 2) { return "two"; } }');
  assert.equal(await run("F", "F($x)", body, "F(2)"), '"two"');
  assert.equal(await run("F", "F($x)", body, "F(3)"), "Undefined()");
});

/** As run, but the lowered body declared a program and reached outside Execution(). */
const runProgram = async (identity: string, pattern: string, body: Expr, call: string) => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept(identity, { realizations: [realization({ pattern, properties: ["Program()"], body })] }));
  return format(await new Runtime(store).evaluate(parse(call), c("Conversation")));
};

test("loops, their signals, and a helper declared after what calls it", async () => {
  const body = lowered(
    "Firsts($xs)",
    `(args) => {
      const firsts = (xs) => pick(xs);
      const pick = (xs) => { const seen = []; for (const x of xs) { if (x < 0) continue; if (x > 9) break; if (x === 5) return "five"; seen.push(x); } return seen.length; };
      return firsts(args[0].value.args.map((a) => a.value));
    }`,
  );
  assert.equal(await runProgram("Firsts", "Firsts($xs)", body, "Firsts(List(1, -1, 2, 10, 5))"), "2");
  assert.equal(await runProgram("Firsts", "Firsts($xs)", body, "Firsts(List(1, 5, 2))"), '"five"');
});

test("recursion, destructuring with a default and a rest, and a spread set", async () => {
  const body = lowered(
    "Shape($xs)",
    `(args) => {
      const depth = (e) => (e && e.head === "List" ? 1 + Math.max(0, ...e.args.map((a) => depth(a.value))) : 0);
      const [first, second = 7, ...rest] = args[0].value.args.map((a) => a.value);
      const kinds = new Set([typeof first, typeof second]);
      return [depth(args[0].value), second, rest.length, [...kinds].join("+")];
    }`,
  );
  assert.equal(await runProgram("Shape", "Shape($xs)", body, "Shape(List(List(1), 2, 3, 4))"), 'List(2, 2, 2, "object+number")');
  assert.equal(await runProgram("Shape", "Shape($xs)", body, "Shape(List(1))"), 'List(1, 7, 0, "number")');
});

test("an element set on a local array, dates and text through their operations", async () => {
  const body = lowered(
    "Stamp($y)",
    `(args) => {
      const cells = [".", ".", "."];
      cells[1] = "x";
      const d = new Date(args[0].value, 0, 31);
      return cells.join("") + " " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getDate() + " " + "Ab".toLowerCase();
    }`,
  );
  assert.equal(await runProgram("Stamp", "Stamp($y)", body, "Stamp(2026)"), '".x. 2026-01-31 ab"');
});

test("every lowered body is made of the IR's operations, and none is JavaScript's", () => {
  const store = new ConceptStore();
  seed(store);
  const operations = new Set(store.asObject("CodePrimitive").map((t) => t.subject));
  const lowered = store.all().filter((u) => u.realizations.some((r) => r.properties.some((p) => isCall(p) && p.head === "Program")));
  assert.ok(lowered.length >= 100, `${lowered.length} lowered`);
  const shaped: string[] = [];
  for (const u of lowered) {
    for (const r of u.realizations) {
      const walk = (e: Expr): void => {
        if (!isCall(e) || e.head === "Quote") return;
        if (/^Js[A-Z]/.test(e.head) || e.head === "Host") shaped.push(`${u.identity}: ${e.head}`);
        for (const a of e.args) walk(a.value);
      };
      walk(r.body);
    }
  }
  assert.deepEqual(shaped, []);
  // What code.ncon lists as operations is what lowering reaches for.
  for (const head of ["AddValues", "FirstSatisfying", "LoopOver", "LocalInstant", "NewSet", "ClaimsWithObject", "Truthy", "Steps", "Bind"]) {
    assert.ok(operations.has(head), head);
  }
});
