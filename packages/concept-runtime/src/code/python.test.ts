import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../concept/expression.js";
import { importSource, importTypeScript, writeJavaScript } from "./import.js";

const py = async (source: string) => format((await importSource(source, "Python"))!.expression);

test("Python reads, through tree-sitter and the python pack, into the Concepts JavaScript reads as", async () => {
  assert.equal(await py("def add(a, b):\n    return a + b\n"), format(importTypeScript("function add(a, b) { return a + b; }").expression));
  assert.equal(await py("for a in items:\n    print(a)\n"), format(importTypeScript("for (const a of items) { print(a); }").expression));
  assert.equal(await py("if a > 2:\n    print(a.name)\nelse:\n    print('small')\n"), 'Module(If(GreaterThan($a, 2), Call($print, Member($a, "name")), Call($print, "small")))');
});

test("a comment is kept where it was written, and Python written back as JavaScript keeps it", async () => {
  const read = (await importSource("def whatever(args):\n    # loop over args here\n    pass\n", "Python"))!;
  assert.equal(format(read.expression), 'Module(Func($whatever, List($args), Sequence(Comment("loop over args here"), Undefined())))');
  assert.equal(writeJavaScript(read.expression).text, "function whatever(args) { /* loop over args here */ }");
});
