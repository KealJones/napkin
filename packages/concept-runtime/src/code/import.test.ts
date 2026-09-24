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

test("source held in a string literal is translated, not carried as text", () => {
  // The seed keeps 27 realization bodies as `code(`...`)`. Left as strings they make the
  // import look complete while 350 lines of real behaviour pass through untranslated.
  const out = ir('const r = code(`(args) => args[0].value + 1`);');
  assert.match(out, /Embedded\(/);
  assert.match(out, /Lambda\(List\(\$args\)/);
  assert.ok(!out.includes('"(args) =>'));
});

test("a string that is not source stays a string", () => {
  assert.equal(ir('const r = notCode(`(args) => 1`);'), 'Let($r, Call($notCode, "(args) => 1"))');
});

test("failures inside embedded source are reported with the outer file's", () => {
  const result = importTypeScript("const r = code(`with (x) { y; }`);");
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0]!.kind, "WithStatement");
});

test("the seed imports with no opaque source left in it", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const result = importTypeScript(readFileSync(`${here}../../src/seed/seed.ts`, "utf8"));
  assert.deepEqual(result.unsupported, []);
  let opaque = 0;
  for (const node of walk(result.expression)) {
    if (!isCall(node) || node.head !== "Call") continue;
    const callee = node.args[0]?.value;
    const isCode = typeof callee === "object" && callee !== null && "variable" in callee && callee.variable === "code";
    if (isCode && typeof node.args[1]?.value === "string") opaque += 1;
  }
  assert.equal(opaque, 0);
});

test("array methods the IR runs import as its primitives, so the result runs and compiles", () => {
  assert.equal(ir("xs.map((x) => x * 2);"), "Map($xs, Lambda(List($x), Multiply($x, 2)))");
  assert.equal(ir("xs.filter((x) => x > 1);"), "Filter($xs, Lambda(List($x), GreaterThan($x, 1)))");
  assert.equal(ir("xs.reduce((a, b) => a + b, 0);"), "Reduce($xs, Lambda(List($a, $b), Add($a, $b)), 0)");
  assert.equal(ir("xs.includes(y);"), "Includes($xs, $y)");
  assert.equal(ir("xs.length;"), "Length($xs)");
  assert.equal(ir("[...a, x, ...b];"), "Concat($a, List($x), $b)");
  assert.equal(ir("a - b;"), "Subtract($a, $b)");
  // A callback that reads the index, or a written length, stays what the source said.
  assert.equal(ir("xs.map((x, i) => i);"), 'Call(Member($xs, "map"), Lambda(List($x, $i), $i))');
  assert.equal(ir("xs.length = 0;"), 'Assign(Member($xs, "length"), 0)');
});

test("an imported function body runs as the code IR, interpreted and compiled alike", async () => {
  const { ConceptStore } = await import("../store/store.js");
  const { seed } = await import("../seed/seed.js");
  const { Runtime } = await import("../runtime/evaluator.js");
  const { concept, realization } = await import("../concept/unit.js");
  const { c } = await import("../concept/expression.js");
  const store = new ConceptStore();
  seed(store);
  const module = importTypeScript("[...xs, 10].filter((x) => x > 2).map((x) => x * x).reduce((a, b) => a + b, 0);").expression;
  assert.ok(isCall(module));
  const body = module.args[0]!.value;
  for (const [name, properties] of [["SquaresI", []], ["SquaresC", ["Compile()"]]] as const) {
    store.seed(concept(name, { realizations: [realization({ pattern: `${name}($xs)`, context: "Execution()", properties: [...properties], body })] }));
  }
  const run = async (e: string) => format(await new Runtime(store).evaluate((await import("../concept/expression.js")).parse(e), c("Execution")));
  assert.equal(await run("SquaresI(List(1, 2, 3, 4))"), "125");
  assert.equal(await run("SquaresC(List(1, 2, 3, 4))"), "125");
});

test("how source reads is the packs' From rules: a rule added to a store changes what imports", async () => {
  const { ConceptStore } = await import("../store/store.js");
  const { loadPacks, parsePack, seedPacks, BUILT_IN_PACKS } = await import("./ncon.js");
  const store = new ConceptStore();
  seedPacks(store, loadPacks([BUILT_IN_PACKS]).filter((p) => ["core", "code", "javascript", "typescript"].includes(p.name)));
  assert.equal(format(importTypeScript("x ** 2;", "a.ts", { store }).expression), "Module(Power($x, 2))");
  // Taught: squaring is its own Concept.
  seedPacks(store, [parsePack("Language(JavaScript())\nFrom(JsBinaryExpression(left=$x, operatorToken=JsAsteriskAsteriskToken(), right=2), Square($x))", "mine")]);
  assert.equal(format(importTypeScript("x ** 2;", "a.ts", { store }).expression), "Module(Square($x))");
});

test("types are erased by the TypeScript pack, not the JavaScript one", async () => {
  const { ConceptStore } = await import("../store/store.js");
  const { loadPacks, seedPacks, BUILT_IN_PACKS } = await import("./ncon.js");
  const { readingRules, readWith } = await import("./rewrite.js");
  const store = new ConceptStore();
  seedPacks(store, loadPacks([BUILT_IN_PACKS]).filter((p) => ["core", "code", "javascript", "typescript"].includes(p.name)));
  const asJs = readWith(readingRules(store, "JavaScript"), "interface A {}\nconst x = 1;");
  assert.equal(asJs.unsupported[0]?.kind, "InterfaceDeclaration");
  const asTs = readWith(readingRules(store, "TypeScript"), "interface A {}\nconst x = 1;");
  assert.equal(format(asTs.expression), "Module(Let($x, 1))");
});

test("an object key that is not a name keeps Pair, even an identifier like $", () => {
  assert.equal(ir('const m = { $: "Dollars", a: 1 };'), 'Let($m, Object(Pair("$", "Dollars"), a=1))');
});
