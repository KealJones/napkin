import { importTypeScript } from "../dist/code/import.js";
import { format } from "../dist/concept/expression.js";
const cases = process.argv.slice(2).length ? process.argv.slice(2) : [
  'import { a, b as c } from "x"', 'import x from "y"', 'import * as ns from "z"', 'import type { T } from "t"', 'import "side"',
  'export function f() {}', 'export const x = 1', 'export { a, b as c }', 'export { a } from "x"', 'export * from "x"', 'export default x', 'export type T = number', 'export interface I { a: number }',
  'const o = { a: 1, b, [k]: 2, ...r, m() { return 1 }, "s": 3 }', 'const [a, ...b] = x', 'const { a, b: c } = x',
  'const f = (a, b) => a + b', 'const g = async (x: number): Promise<void> => { await x }', 'x => x',
  'a[0]', 'a?.b', 'a?.[0]', 'f?.(x)', 'a ? b : c', 'a ?? b', 'x += 1', 'x++', '--x', 'new Foo(1)', 'typeof x', 'a instanceof B', 'x as T', 'x!',
  '`a${b}c`', '`${b}`', '`plain`', 'class A extends B { x = 1; constructor(a) { super(a) } m(): void {} static s() {} get g() { return 1 } }',
  'try { a } catch (e) { b } finally { c }', 'throw new Error("x")', 'while (a) { b }', 'do { a } while (b)', 'switch (x) { case 1: a; break; default: b }',
  'if (a) b; else if (c) d; else e', 'for (let i = 0; i < n; i++) { f(i) }', 'async function f() {}', 'function* g() { yield 1 }', 'label: for (;;) { break label }',
  'const x: number = 1', 'let y', 'function f(a: number = 1, ...r: string[]): void {}', 'f<T>(x)', 'delete a.b', 'void 0', 'a = b ? c : d', '/re/g.test(x)', 'x = { a }', 'enum E { A, B }', 'declare const x: number', 'namespace N {}',
];
for (const c of cases) console.log(c.padEnd(60), format(importTypeScript(c).expression));
