import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { format } from "../concept/expression.js";
import { importTypeScript, writeJavaScript } from "./import.js";

const write = (source: string) => writeJavaScript(importTypeScript(source).expression).text;

test("an expression rule is used only where each part can be an expression", () => {
  assert.equal(write("const f = (a) => a + 1;"), "const f = (a) => ((a + 1))");
  assert.equal(write("const f = (a) => { return a + 1; };"), "const f = (a) => { return (a + 1) }");
  assert.equal(write("const y = x ? 1 : 2;"), "const y = (x ? 1 : 2)");
  // Standing as a statement, the statement form comes first; both read as If(x, 1, 2).
  assert.equal(write("x ? 1 : 2;"), "if (x) { 1 } else { 2 }");
  assert.equal(write("if (x) { return 1; }"), "if (x) { return 1 }");
  assert.equal(write("[...a, x, y, ...b];"), "[...a, x, y, ...b]");
  assert.equal(write('const o = { a, "b c": 2 };'), 'const o = { a: a, ["b c"]: 2 }');
});

test("a body that ends in an expression statement returns nothing, read and written", () => {
  assert.equal(format(importTypeScript("const f = () => { g(); };").expression), "Module(Let($f, Lambda(List(), Sequence(Call($g), Undefined()))))");
  assert.equal(write("const f = () => { g(); };"), "const f = () => { g() }");
});

test("every source file here reads, writes and reads back as the same Concepts", () => {
  const src = fileURLToPath(new URL("../../src/", import.meta.url));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  };
  walk(src);
  assert.ok(files.length > 50);
  for (const file of files) {
    const first = importTypeScript(readFileSync(file, "utf8"), file).expression;
    const written = writeJavaScript(first);
    assert.deepEqual(written.unwritable, [], file);
    const parsed = ts.createSourceFile("out.js", written.text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS) as unknown as { parseDiagnostics: unknown[] };
    assert.equal(parsed.parseDiagnostics.length, 0, `${file} writes JavaScript that parses`);
    assert.equal(format(importTypeScript(written.text, file).expression), format(first), file);
  }
});
