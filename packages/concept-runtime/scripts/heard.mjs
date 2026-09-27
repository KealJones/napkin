// Heard trees for a list of snippets: node scripts/heard.mjs [TypeScript|Python] [snippet...]
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { c, call, format, isCall } from "../dist/concept/expression.js";
const store = new ConceptStore();
seed(store);
const [lang = "TypeScript", ...given] = process.argv.slice(2);
const cases = given.length ? given : [
  'import { a, b as c } from "x"', 'import x from "y"', 'import * as ns from "z"', 'import "side"',
  'export function f() {}', 'export const x = 1', 'export { a, b as c }', 'export * from "x"', 'export default x',
  'const o = { a: 1, b, ...r, m() { return 1 } }', 'const [a, ...b] = x', 'const { a, b: c } = x',
  'const f = (a, b) => a + b', 'const g = async (x: number): Promise<void> => { await x }', 'x => x',
  'a[0]', 'a?.b', 'a ? b : c', 'a ?? b', 'x += 1', 'x++', 'new Foo(1)', 'typeof x', 'x as T', 'x!.y', 'f()',
  '`a${b}c`', 'class A extends B { x = 1; constructor(a) { super(a) } m(): void {} }',
  'try { a } catch (e) { b } finally { c }', 'if (a) b; else if (c) d; else e', 'if (a) { b } else if (c) { d } else { e }', 'for (let i = 0; i < n; i++) { f(i) }',
  'const x: number = 1', 'function f(a: number = 1, ...r: string[]): Map<string, number> { return a }', 'f<T>(x)', 'const m = new Map<string, Set<number>>()', '/re/g.test(x)',
];
for (const text of cases) {
  try {
    const rt = new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 });
    const h = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(lang))));
    const shown = isCall(h) ? { head: h.head, args: h.args.filter((a) => a.name !== "rounds") } : h;
    console.log(text.padEnd(50), format(shown));
  } catch (e) {
    console.log(text.padEnd(50), "ERROR", e.message);
  }
}
