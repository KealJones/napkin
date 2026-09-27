import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { c } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";

// packs/coding.ncon (sources/coding): code a message shows or names, explained, checked, fixed,
// run, converted and saved, through a whole turn, as the studio asks.
const store = new ConceptStore();
seed(store);
const ask = async (text: string, history: { message: string; result: string }[] = []) => {
  const r = await turn(new Runtime(store), text, c("Execution"), { learn: false, history });
  return { result: String(r.rendered), said: r.spoken };
};

test("code shown is explained in words, however it is asked about", async () => {
  assert.equal((await ask("explain this code: `function add(a, b) { return a + b }`")).said, "Here's what it does: a function add that takes a and b, and gives back a plus b.");
  assert.match((await ask("what does this do? `const total = [1, 2, 3].reduce((a, b) => a + b, 0)`")).said, /combined one by one through a function of a and b giving a plus b, starting from 0/);
});

test("a file named is read from the workspace and said as what it is made of", async () => {
  const { said } = await ask("explain src/code/tree.ts");
  assert.match(said, /it defines functions parserFor\(grammar\) and readTree\(text, grammar, prefix\)/);
  assert.match(said, /it gives out readTree/);
  assert.match((await ask("explain src/no/such/file.ts")).said, /I couldn't read src\/no\/such\/file\.ts/);
});

test("what looks wrong is found the same way for any code, and what has a plain repair is fixed", async () => {
  const checked = await ask("whats wrong with `if (x = 5) { go() }`");
  assert.match(checked.said, /`x = 5` in the condition sets x instead of comparing it; you probably meant `x === 5`/);
  assert.match((await ask("check `function f() { return 1; console.log(2) }`")).said, /never runs/);
  assert.equal((await ask("check `const y = 2; console.log(y)`")).said, "Nothing in it looks wrong to me.");
  const fixed = await ask("fix this `if (x = 5) { go() }`");
  assert.match(fixed.said, /^Fixed: `x = 5` compares now: `x === 5`\./);
  assert.match(fixed.said, /```typescript\nif \(x === 5\) \{ go\(\) \}\n```/);
});

test("code is run apart from the host, with the values said beside it", async () => {
  assert.equal((await ask("run `function f(n) { return n * 2 }` with 21")).said, "It gives 42.");
  assert.match((await ask("run `function f() { return process.exit(1) }`")).said, /^Running it failed: process is not defined/);
});

test("code is written in another language, and saved where it is asked to be", async () => {
  const converted = await ask("convert this to javascript ```python\ndef add(a, b):\n    return a + b\n```");
  assert.equal(converted.said, "In JavaScript:\n\n```javascript\nfunction add(a, b) { return (a + b) }\n```");
  const path = "dist/coding-test-saved.js";
  rmSync(path, { force: true });
  const saved = await ask(`save it to ${path}`, [{ message: "convert this", result: converted.result }]);
  assert.equal(saved.said, `Saved to ${path}.`);
  assert.equal(readFileSync(path, "utf8"), "function add(a, b) { return (a + b) }");
  rmSync(path, { force: true });
  assert.ok(!existsSync(path));
});

test("a function is found from examples of what it gives, the simplest rule that fits them all", async () => {
  const f = await ask("write a function where f(1) is 2, f(2) is 4 and f(3) is 6");
  assert.equal(f.said, "Here's f, which gives back every example you gave:\n\n```javascript\nfunction f(x) { return (x * 2) }\n```");
  assert.match((await ask("make g so that g(2) = 5, g(3) = 7, g(10) = 21")).said, /function g\(x\) \{ return \(\(x \* 2\) \+ 1\) \}/);
  assert.match((await ask("write avg where avg(2, 4) is 3, avg(10, 20) is 15")).said, /function avg\(a, b\) \{ return \(\(a \+ b\) \* 0\.5\) \}/);
  assert.match((await ask("what function gives f(1) = 1, f(2) = 4, f(3) = 9?")).said, /return \(x \*\* 2\)/);
  assert.match((await ask("write f where f(1) is 7, f(2) is 1, f(3) is 100")).said, /^I couldn't find one rule for f/);
  assert.equal((await ask("run it with 21", [{ message: "write", result: f.result }])).said, "It gives 42.");
});

test("code is written as Python, in lines, and reads back as the same Concepts", async () => {
  const { importTypeScript, writeSource } = await import("./import.js");
  const { readCode } = await import("../ears/code-reading.js");
  const { format } = await import("../concept/expression.js");
  const js = "function f(x, ys) { if (x > 1 && !done) { return true } else { for (const y of ys) { print(y) } } return ys.length }";
  const ir = importTypeScript(js).expression;
  const py = writeSource(ir, "Python");
  assert.deepEqual(py.unwritable, []);
  assert.equal(py.text, "def f(x, ys):\n    if ((x > 1) and (not done)):\n        return True\n    else:\n        for y in ys:\n            print(y)\n    return len(ys)");
  const back = await readCode(py.text + "\n", "python");
  assert.equal(format(writeSource(back!.ir, "JavaScript").text), format(writeSource(ir, "JavaScript").text));
  assert.match((await ask("write a python function where h(1) is 3, h(2) is 5, h(4) is 9")).said, /```python\ndef h\(x\):\n    return \(\(x \* 2\) \+ 1\)\n```/);
  assert.equal((await ask("translate `let a = 1` into python")).said, "In Python:\n\n```python\na = 1\n```");
});

test("a file is fixed in place and saved back where it came from, keeping its layout", async () => {
  const path = "dist/coding-test-fix.js";
  writeFileSync(path, 'function check(x) {\n  if (x = 5) { return "five" }\n  return "other"\n}\n');
  const fixed = await ask(`fix ${path}`);
  assert.match(fixed.said, /```typescript\nfunction check\(x\) \{\n  if \(x === 5\) \{ return "five" \}\n  return "other"\n\}\n```/);
  assert.equal((await ask("save it", [{ message: "fix", result: fixed.result }])).said, `Saved to ${path}.`);
  assert.equal(readFileSync(path, "utf8"), 'function check(x) {\n  if (x === 5) { return "five" }\n  return "other"\n}\n');
  rmSync(path, { force: true });
  const ran = await ask("run `function f(n) { return n * 2 }` with 21");
  assert.match((await ask("convert it to python", [{ message: "run", result: ran.result }])).said, /def f\(n\):\n    return \(n \* 2\)/);
});

test("a function is written for what a doing names, in the language asked for", async () => {
  assert.equal((await ask("write a function that adds two numbers")).said, "Here's add:\n\n```javascript\nfunction add(a, b) { return (a + b) }\n```");
  assert.match((await ask("write a python function that multiplies two numbers")).said, /```python\ndef multiply\(a, b\):\n    return \(a \* b\)\n```/);
});

test("what code shown gives is what running it gives, however it is asked", async () => {
  assert.equal((await ask("what does `[1,2,3].filter(n => n > 1)` give")).said, "It gives `[2, 3]`.");
  assert.equal((await ask("what does `2 ** 8` return")).said, "It gives 256.");
  assert.equal((await ask("what's the output of `'ab'.repeat(3)`")).said, 'It gives "ababab".');
});
