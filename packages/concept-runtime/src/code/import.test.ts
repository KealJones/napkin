import assert from "node:assert/strict";
import { test } from "node:test";
import { format, isCall, walk } from "../concept/expression.js";
import { importTypeScript } from "./import.js";

/** The appendix is the specification, so the test is the appendix. */
const ir = (source: string): string => format(importTypeScript(source).expression).replace(/^Module\(|\)$/g, "");

test("a function translates exactly as the appendix has it", () => {
  assert.equal(
    ir(`function raise(head, fields, message) {
      const error = new Error(message);
      whatever();
      error.value = expression(head, fields);
      throw error;
    }`),
    'Func($raise, List($head, $fields, $message), Sequence(Let($error, New($Error, $message)), ' +
      'Call($whatever), Assign(Member($error, "value"), Call($expression, $head, $fields)), Throw($error)))',
  );
});

test("an identifier key is a named argument; the rest keep Pair", () => {
  // ir-spec Part 3.3: the named-argument form is preferred where the key is known.
  assert.equal(ir("const x = { head, args: 1 };"), "Let($x, Object(head=$head, args=1))");
  assert.equal(ir("const x = { [k]: 1 };"), 'Let($x, Object(Pair($k, 1)))');
});

test("a concise arrow body is the value, not a return statement", () => {
  assert.equal(ir("const f = (a) => a + 1;"), "Let($f, Lambda(List($a), Add($a, 1)))");
  assert.equal(ir("const f = (a) => { return a + 1; };"), "Let($f, Lambda(List($a), Return(Add($a, 1))))");
});

test("async and generator wrap the function rather than its parameters", () => {
  assert.equal(ir("const f = async (a) => a;"), "Let($f, Async(Lambda(List($a), $a)))");
  assert.match(ir("function* g() { yield 1; }"), /^Generator\(Func\(\$g/);
});

test("const binds and let may be reassigned, and the IR keeps the difference", () => {
  assert.equal(ir("const a = 1;"), "Let($a, 1)");
  assert.equal(ir("let a = 1;"), "Var($a, 1)");
});

test("types are erased, because a type is a claim and not a step", () => {
  assert.equal(ir("interface Foo { a: string }\nconst x: number = 1;"), "Let($x, 1)");
  assert.equal(ir("const x = y as string;"), "Let($x, $y)");
  assert.equal(ir("type A = B;\nconst x = 1;"), "Let($x, 1)");
});

test("a class keeps its members, with modifiers wrapping what they modify", () => {
  const out = ir("class A extends B { readonly x = 1; private go(n) { return n; } }");
  assert.match(out, /^Class\(\$A, Extends\(\$B\), List\(/);
  assert.match(out, /Readonly\(Field\("x", 1\)\)/);
  assert.match(out, /Private\(Method\("go", List\(\$n\), Return\(\$n\)\)\)/);
});

test("postfix increment is not an assignment, because it yields the old value", () => {
  assert.equal(ir("i++;"), "PostIncrement($i)");
  assert.equal(ir("++i;"), "PreIncrement($i)");
});

test("a template literal is concatenation", () => {
  assert.equal(ir("const s = `a${b}c`;"), 'Let($s, Add(Add("a", $b), "c"))');
});

test("anything unmapped is reported rather than dropped", () => {
  const result = importTypeScript("with (x) { y; }");
  assert.equal(result.unsupported.length, 1);
  assert.ok([...walk(result.expression)].some((n) => isCall(n) && n.head === "Unsupported"));
});

test("the runtime's own grammar module imports with nothing unmapped", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  // dist/code/ -> the built sibling of the module this translates.
  const source = readFileSync(`${here}../../src/concept/expression.ts`, "utf8");
  const result = importTypeScript(source);
  assert.deepEqual(result.unsupported, []);
});
