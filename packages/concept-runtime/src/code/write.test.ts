import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { type Expr, call, format, isCall, parse } from "../concept/expression.js";
import { importTypeScript, writeJavaScript, writeSource } from "./import.js";

const write = (source: string) => writeJavaScript(importTypeScript(source).expression).text;
const writeTs = (source: string) => writeSource(importTypeScript(source).expression, "TypeScript").text;
/** Concepts without the types declarations say, as JavaScript, which writes none, reads back. */
const untyped = (e: Expr): Expr =>
  !isCall(e) ? e : call(e.head, e.args.filter((a) => a.name === undefined || !["Bind", "Var", "Func", "Lambda"].includes(e.head)).map((a) => ({ ...a, value: untyped(a.value) })));

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
  assert.equal(format(importTypeScript("const f = () => { g(); };").expression), "Module(Bind($f, Lambda(List(), Sequence(Call($g), Undefined()))))");
  assert.equal(write("const f = () => { g(); };"), "const f = () => { g() }");
});

test("a type is written back by TypeScript, and not by JavaScript", () => {
  assert.equal(writeTs("function sum(a: number, b: number): number { return a + b; }"), "function sum(a: number, b: number): number { return (a + b) }");
  assert.equal(write("function sum(a: number, b: number): number { return a + b; }"), "function sum(a, b) { return (a + b) }");
  assert.equal(writeTs("const x: number = 1;"), "const x: number = 1");
  assert.equal(write("const x: number = 1;"), "const x = 1");
  assert.equal(writeTs("let xs: number[] = [];"), "let xs: number[] = []");
  assert.equal(writeTs("const t: [string, ...number[]] = [];"), "const t: [string, ...number[]] = []");
  assert.equal(writeTs("const u: (number | string)[] = [];"), "const u: (number | string)[] = []");
  assert.equal(writeTs("const p: Point = q;"), "const p: Point = q");
  // An array is ListOf(T) or, spelled out, List(Rest(T)); both are written T[].
  assert.equal(writeSource(parse("Bind($x, $y, type=List(Rest(Number())))"), "TypeScript").text, "const x: number[] = y");
  assert.equal(writeSource(parse("Bind($x, $y, type=List(String(), Rest(ListOf(Number()))))"), "TypeScript").text, "const x: [string, ...number[][]] = y");
  // An untyped parameter beside a typed one, a default, and an arrow's own return type.
  assert.equal(writeTs("function f(a, b: string) { return a; }"), "function f(a, b: string) { return a }");
  assert.equal(writeTs("const g = (a: number, b = 2): number => a + b;"), "const g = (a: number, b = 2): number => ((a + b))");
  assert.equal(write("const g = (a: number, b = 2): number => a + b;"), "const g = (a, b = 2) => ((a + b))");
  // Generics: <T> on the function, T where it is used, Foo<X> for a type applied.
  assert.equal(writeTs("function first<T>(xs: T[]): T { return xs[0]; }"), "function first<T>(xs: T[]): T { return xs[0] }");
  assert.equal(write("function first<T>(xs: T[]): T { return xs[0]; }"), "function first(xs) { return xs[0] }");
  assert.equal(writeTs("const m: Map<string, Promise<number>> = x;"), "const m: Map<string, Promise<number>> = x");
  // Wrapped, the function is still written with its types.
  assert.equal(writeTs("export async function h(a: number) { return a; }"), "export async function h(a: number) { return a }");
});

test("typed code round trips: TypeScript to Concepts and back, and JavaScript through TypeScript", () => {
  for (const source of [
    "function sum(a: number, b: number): number { return a + b; }",
    "const xs: Array<string> = [];",
    "let u: number | boolean = 1;",
    "const f = (a: [number, number]): number => a[0];",
    "function first<T>(xs: T[]): T { return xs[0]; }",
    "function keys<K extends string, V>(m: Map<K, V>): K[] { return []; }",
    "async function later<T>(x: T): Promise<Map<string, Set<T>[]>> { return x; }",
    "const g = <T,>(x: T): Promise<T[]> => x;",
  ]) {
    const ir = importTypeScript(source).expression;
    assert.equal(format(importTypeScript(writeTs(source)).expression), format(ir), source);
    // Written as JavaScript, it reads back as the same Concepts without their types, and so
    // does that JavaScript written as TypeScript.
    const js = write(source);
    assert.equal(format(importTypeScript(js).expression), format(untyped(ir)), source);
    assert.equal(writeTs(js), js);
  }
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
    assert.equal(format(importTypeScript(written.text, file).expression), format(untyped(first)), file);
    // TypeScript keeps the types: written as TypeScript, the file reads back exactly.
    const typed = writeSource(first, "TypeScript");
    assert.deepEqual(typed.unwritable, [], file);
    const parsedTs = ts.createSourceFile("out.ts", typed.text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS) as unknown as { parseDiagnostics: unknown[] };
    assert.equal(parsedTs.parseDiagnostics.length, 0, `${file} writes TypeScript that parses`);
    assert.equal(format(importTypeScript(typed.text, file).expression), format(first), `${file} as TypeScript`);
  }
});
