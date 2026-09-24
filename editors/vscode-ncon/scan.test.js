// node scan.test.js: the scanner against hand cases and every built-in pack.
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { scan, variableAt } = require("./scan.js");

const kinds = (text) => scan(text).marks.map((m) => `${m.kind}:${text.slice(m.start, m.end)}@${m.depth}`);

test("heads and parentheses carry their depth", () => {
  assert.deepEqual(kinds("A(B(C()))").filter((k) => k.startsWith("head")), ["head:A@0", "head:B@1", "head:C@2"]);
  assert.deepEqual(kinds("A(B())").filter((k) => /open|close/.test(k)), ["open:(@0", "open:(@1", "close:)@1", "close:)@0"]);
});

test("a pack form is a form only at the start of a line and at depth 0", () => {
  assert.deepEqual(kinds("Concept(Game(), Concept())").filter((k) => /head|form/.test(k)), ["form:Concept@0", "head:Game@1", "head:Concept@1"]);
});

test("a form's parentheses belong to the form", () => {
  const parens = scan("Concept(Game(), IsA(X()))").marks.filter((m) => m.kind === "open" || m.kind === "close");
  assert.deepEqual(parens.map((m) => !!m.form), [true, false, false, false, false, false, false, true]);
});

test("a comma knows whose arguments it separates", () => {
  const commas = scan("And(Equals($a, 1), $b)").marks.filter((m) => m.kind === "comma").map((m) => m.of);
  assert.deepEqual(commas, ["Equals", "And"]);
});

test("nothing inside a string, raw string or comment is nesting", () => {
  const { marks, unbalanced } = scan('A("(", """ ) ( """) // B(\nC()');
  assert.deepEqual(unbalanced, []);
  assert.deepEqual(marks.filter((m) => m.kind === "head").map((m) => m.depth), [0, 0]);
});

test("variables, names, numbers and constants are told apart", () => {
  const found = kinds('X($a, $_, name=true, -1.5, null, "a\\nb")').filter((k) => !/open|close|comma|head/.test(k));
  assert.deepEqual(found, ["variable:$a@1", "anonymous:$_@1", "name:name@1", "equals:=@1", "constant:true@1", "number:-1.5@1", "constant:null@1", "escape:\\n@1", 'string:"a\\nb"@1']);
});

test("a variable a Bind names is local in its body, not in its value or outside", () => {
  const text = "F($x, Bind($x, G($x), H($x, $y)), $x)";
  const vars = scan(text).marks.filter((m) => m.kind === "variable" || m.kind === "local").map((m) => `${m.kind}@${m.start}`);
  // $x in F's arguments, and in Bind's value, is the pattern's; the binder and its use in the body are local.
  assert.deepEqual(vars, ["variable@2", "local@11", "variable@17", "local@24", "variable@28", "variable@34"]);
});

test("a two-argument Bind in a Sequence is local in the steps after it", () => {
  const text = "Sequence($v, Bind($v, F($v)), G($v)), $v";
  const vars = scan(text).marks.filter((m) => m.kind === "variable" || m.kind === "local").map((m) => m.kind);
  assert.deepEqual(vars, ["variable", "local", "variable", "local", "variable"]);
});

test("named arguments are names, and a comment before a binder's variable does not hide it", () => {
  assert.equal(scan("Bind(// the list\n $xs, 1, $xs)").marks.filter((m) => m.kind === "local").length, 2);
  assert.equal(scan("X(context=Y())").marks.find((m) => m.kind === "name")?.kind, "name");
});

test("a raw string after source= or Prelude( is code, and other raw strings are text", () => {
  assert.deepEqual(scan('Code(source="""x""")').marks.find((m) => m.kind === "code" || m.kind === "raw")?.kind, "code");
  assert.deepEqual(scan('Prelude("""x""")').marks.find((m) => m.kind === "code" || m.kind === "raw")?.kind, "code");
  assert.deepEqual(scan('Text("""x""")').marks.find((m) => m.kind === "code" || m.kind === "raw")?.kind, "raw");
});

test("an unbalanced parenthesis is found", () => {
  assert.deepEqual(scan("A(B()").unbalanced, [1]);
  assert.deepEqual(scan("A())").unbalanced, [3]);
});

test("every built-in pack scans balanced", () => {
  const dir = join(__dirname, "../../packages/concept-runtime/packs");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ncon"))) {
    assert.deepEqual(scan(readFileSync(join(dir, f), "utf8")).unbalanced, [], f);
  }
});

test("a variable under the cursor is its local's value, or the pattern or Lambda that binds it", () => {
  const t = 'Realization(Slot($record), body=Sequence(Bind($v, Map($record, Lambda(List($a), $a))), If($v, 1)))';
  const at = (needle) => variableAt(t, t.indexOf(needle) + needle.indexOf("$") + 1, scan(t));
  assert.equal(at("If($v").value, "Map($record, Lambda(List($a), $a))");
  assert.deepEqual(at("Lambda(List($a), $a)").kind, "parameter");
  assert.deepEqual(at("Slot($record)"), { kind: "pattern", where: "Slot($record)", at: t.indexOf("$record") });
});
