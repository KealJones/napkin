import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, format, isCall, type Expr } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "../runtime/evaluator.js";
import { importSource, importTypeScript, writeJavaScript } from "./import.js";

// SPIKE (spike/hear-code-words, packs/code-hearing.ncon): code heard word by word, as a message
// is, in the language's context, then read as the code IR by the heard words' realizations.
const store = new ConceptStore();
seed(store);
const heard = async (text: string, language: string): Promise<Expr> =>
  new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(language))));
const read = async (text: string, language: string): Promise<Expr> =>
  new Runtime(store).evaluate(await heard(text, language), c("Context", c("Code", c(language)), c("Reading")));
/** The words as heard, without how many rounds it took. */
const hear = async (text: string, language: string) => {
  const e = await heard(text, language);
  return format(isCall(e) ? { head: e.head, args: e.args.filter((a) => a.name !== "rounds") } : e);
};
const both = async (ts: string, py: string) => {
  const [a, b] = [format(await read(ts, "TypeScript")), format(await read(py, "Python"))];
  assert.equal(a, b);
  return a;
};

test("operators: each word takes what is either side of it, as tightly as it binds, in either language", async () => {
  for (const language of ["TypeScript", "Python"]) {
    assert.equal(await hear("a + b * c", language), "Phrases(Plus(A(), Times(B(), C())))");
    assert.equal(await hear("f(x).y", language), "Phrases(Dot(F(X()), Y()))");
    assert.equal(await hear("a - b - c", language), "Phrases(Minus(Minus(A(), B()), C()))");
  }
  assert.equal(await hear("(a + b) * c", "TypeScript"), "Phrases(Times(Plus(A(), B()), C()))");
  assert.equal(await hear("-a + b * -c", "TypeScript"), "Phrases(Plus(Minus(A()), Times(B(), Minus(C()))))");
  for (const text of ["a + b * c", "f(x).y", "a - b - c", "(a + b) * c", "-a + b * -c", "x = f(a, b + 1).go(2)"]) {
    assert.equal(format(await read(text, "TypeScript")), format(importTypeScript(text).expression));
  }
});

test("a loop is the same words in both languages, and reads as what the TypeScript reader reads", async () => {
  assert.equal(await hear("for (const element of object) { print(element) }", "TypeScript"), "Phrases(For(Of(Const(Element()), Object()), Print(Element())))");
  assert.equal(await hear("for element in object:\n    print(element)\n", "Python"), "Phrases(For(In(Element(), Object()), Print(Element())))");
  const ir = await both("for (const element of object) { print(element) }", "for element in object:\n    print(element)\n");
  assert.equal(ir, format(importTypeScript("for (const element of object) { print(element) }").expression));
});

test("the programs python.test.ts reads through tree-sitter read the same heard, and write back", async () => {
  const pairs: [string, string][] = [
    ["function add(a, b) { return a + b; }", "def add(a, b):\n    return a + b\n"],
    ["for (const a of items) { print(a); }", "for a in items:\n    print(a)\n"],
    ["if (a > 2) { print(a.name) } else { print('small') }", "if a > 2:\n    print(a.name)\nelse:\n    print('small')\n"],
    ["function whatever(args) { // loop over args here\n}", "def whatever(args):\n    # loop over args here\n    pass\n"],
    ["function f(a) { if (a > 2) { return a } else { return 0 } }", "def f(a):\n    if a > 2:\n        return a\n    else:\n        return 0\n"],
  ];
  for (const [ts, py] of pairs) {
    const ir = await both(ts, py);
    assert.equal(ir, format(importTypeScript(ts).expression));
    assert.equal(ir, format((await importSource(py, "Python"))!.expression));
  }
  assert.equal(writeJavaScript(await read("def whatever(args):\n    # loop over args here\n    pass\n", "Python")).text, "function whatever(args) { /* loop over args here */ }");
});

test("what a number's writing states is kept for a language that must choose a type", async () => {
  assert.equal(format(await read("const x = 1.5; let y = 2; var z = 3n; const w = 2.0", "TypeScript")), 'Module(Sequence(Bind($x, 1.5), Var($y, 2), Var($z, BigInt("3")), Bind($w, Float(2))))');
  assert.equal(format(await read("w = 2.0\n", "Python")), "Module(Var($w, Float(2)))");
});

test("known gaps", { todo: "an empty call is heard as the name alone; else-if, subscripts, types, lambdas" }, async () => {
  assert.equal(format(await read("print()", "TypeScript")), "Module(Call($print))");
});
