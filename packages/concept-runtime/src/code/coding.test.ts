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
type Asked = { message: string; result: string; said: string };
// What Napkin says to a message; `before` are the earlier answers of the same conversation.
const ask = async (text: string, before: Asked[] = []): Promise<Asked> => {
  const history = before.map((b) => ({ message: b.message, result: b.result, spoken: b.said }));
  const r = await turn(new Runtime(store), text, c("Execution"), { learn: false, history });
  return { message: text, result: String(r.rendered), said: r.spoken ?? "" };
};
// The code in the first fenced block of a reply.
const fenced = (said: string, language = "(?:javascript|js|typescript)"): string => {
  const m = new RegExp("```" + language + "\\n([\\s\\S]*?)\\n?```").exec(said);
  assert.ok(m, `no ${language} code in: ${said}`);
  return m[1]!;
};
// The first function written in a reply, ready to call: what it gives is the behaviour, not how it is spelled.
const written = (said: string): ((...args: unknown[]) => unknown) => {
  const code = fenced(said);
  const name = /function\s+(\w+)/.exec(code)?.[1];
  assert.ok(name, `no function in: ${code}`);
  return new Function(`${code}\nreturn ${name};`)() as (...args: unknown[]) => unknown;
};

test("code shown is explained in words, however it is asked about", async () => {
  const add = (await ask("explain this code: `function add(a, b) { return a + b }`")).said;
  assert.match(add, /\badd\b/);
  assert.match(add, /a plus b|a \+ b|sum/i);
  const total = (await ask("what does this do? `const total = [1, 2, 3].reduce((a, b) => a + b, 0)`")).said;
  assert.match(total, /reduce|combin|sum|add/i);
  assert.match(total, /0/);
});

test("a file named is read from the workspace and said as what it is made of", async () => {
  const { said } = await ask("explain src/code/tree.ts");
  assert.match(said, /parserFor/);
  assert.match(said, /readTree/);
  assert.match((await ask("explain src/no/such/file.ts")).said, /I couldn't read src\/no\/such\/file\.ts/);
});

test("what looks wrong is found the same way for any code, and what has a plain repair is fixed", async () => {
  const checked = await ask("whats wrong with `if (x = 5) { go() }`");
  assert.match(checked.said, /x = 5/);
  assert.match(checked.said, /assign|sets|instead of compar|===/i);
  assert.match((await ask("check `function f() { return 1; console.log(2) }`")).said, /never runs/);
  assert.match((await ask("check `const y = 2; console.log(y)`")).said, /nothing|no problem|looks fine/i);
  const fixed = await ask("fix this `if (x = 5) { go() }`");
  assert.match(fixed.said, /fixed|x === 5/i);
  assert.match(fenced(fixed.said), /if \(x === 5\) \{ go\(\) \}/);
});

test("code is run apart from the host, with the values said beside it", async () => {
  assert.equal((await ask("run `function f(n) { return n * 2 }` with 21")).said, "It gives 42.");
  assert.match((await ask("run `function f() { return process.exit(1) }`")).said, /^Running it failed: process is not defined/);
});

test("code is written in another language, and saved where it is asked to be", async () => {
  const converted = await ask("convert this to javascript ```python\ndef add(a, b):\n    return a + b\n```");
  assert.equal(written(converted.said)(2, 3), 5);
  const path = "dist/coding-test-saved.js";
  rmSync(path, { force: true });
  const saved = await ask(`save it to ${path}`, [converted]);
  assert.match(saved.said, /saved/i);
  assert.ok(saved.said.includes(path), saved.said);
  const text = readFileSync(path, "utf8");
  assert.equal(new Function(`${text}\nreturn add;`)()(2, 3), 5);
  rmSync(path, { force: true });
  assert.ok(!existsSync(path));
});

test("a function is found from examples of what it gives, the simplest rule that fits them all", async () => {
  const f = await ask("write a function where f(1) is 2, f(2) is 4 and f(3) is 6");
  const double = written(f.said);
  assert.deepEqual([1, 2, 3].map((n) => double(n)), [2, 4, 6]);
  assert.equal(double(10), 20); // the simplest rule that fits, so a point not given is right too
  const g = written((await ask("make g so that g(2) = 5, g(3) = 7, g(10) = 21")).said);
  assert.deepEqual([2, 3, 10].map((n) => g(n)), [5, 7, 21]);
  assert.equal(g(4), 9);
  const avg = written((await ask("write avg where avg(2, 4) is 3, avg(10, 20) is 15")).said);
  assert.deepEqual([avg(2, 4), avg(10, 20), avg(6, 8)], [3, 15, 7]);
  const square = written((await ask("what function gives f(1) = 1, f(2) = 4, f(3) = 9?")).said);
  assert.deepEqual([1, 2, 3, 5].map((n) => square(n)), [1, 4, 9, 25]);
  assert.match((await ask("write f where f(1) is 7, f(2) is 1, f(3) is 100")).said, /couldn't find|no rule/i);
  assert.match((await ask("run it with 21", [f])).said, /\b42\b/);
});

test("code is written as Python, in lines, and reads back as the same Concepts", async () => {
  const { importTypeScript, writeSource } = await import("./import.js");
  const { readCode } = await import("../ears/code-reading.js");
  const { format } = await import("../concept/expression.js");
  const js = "function f(x, ys) { if (x > 1 && !done) { return true } else { for (const y of ys) { print(y) } } return ys.length }";
  const ir = importTypeScript(js).expression;
  const py = writeSource(ir, "Python");
  assert.deepEqual(py.unwritable, []);
  assert.match(py.text, /^def f\(x, ys\):\n/);
  const back = await readCode(py.text + "\n", "python");
  assert.equal(format(writeSource(back!.ir, "JavaScript").text), format(writeSource(ir, "JavaScript").text));
  // The Python written for examples reads back as a function that gives them.
  const h = (await ask("write a python function where h(1) is 3, h(2) is 5, h(4) is 9")).said;
  assert.match(h, /```python\ndef h\(/);
  const hBack = await readCode(fenced(h, "python") + "\n", "python");
  const hJs = writeSource(hBack!.ir, "JavaScript").text;
  const hFn = new Function(`${hJs}\nreturn h;`)();
  assert.deepEqual([1, 2, 4, 10].map((n) => hFn(n)), [3, 5, 9, 21]);
  const a = (await ask("translate `let a = 1` into python")).said;
  assert.match(a, /```python\n\s*a = 1\s*\n```/);
});

test("a file is fixed in place and saved back where it came from, keeping its layout", async () => {
  const path = "dist/coding-test-fix.js";
  writeFileSync(path, 'function check(x) {\n  if (x = 5) { return "five" }\n  return "other"\n}\n');
  const fixed = await ask(`fix ${path}`);
  assert.match(fixed.said, /```(javascript|js|typescript)\n/);
  assert.match(fixed.said, /x === 5/);
  const saved = await ask("save it", [fixed]);
  assert.match(saved.said, /saved/i);
  assert.ok(saved.said.includes(path), saved.said);
  assert.equal(readFileSync(path, "utf8"), 'function check(x) {\n  if (x === 5) { return "five" }\n  return "other"\n}\n');
  rmSync(path, { force: true });
  const ran = await ask("run `function f(n) { return n * 2 }` with 21");
  assert.match((await ask("convert it to python", [ran])).said, /def f\(n\):\s*\n\s+return \(?n \* 2\)?/);
});

test("a function is written for what a doing names, in the language asked for", async () => {
  assert.equal(written((await ask("write a function that adds two numbers")).said)(2, 3), 5);
  const py = (await ask("write a python function that multiplies two numbers")).said;
  assert.match(py, /```python\ndef \w+\(\w+, \w+\):/);
  assert.match(py, /\*/);
});

test("what code shown gives is what running it gives, however it is asked", async () => {
  assert.match((await ask("what does `[1,2,3].filter(n => n > 1)` give")).said, /\[2, ?3\]/);
  assert.match((await ask("what does `2 ** 8` return")).said, /\b256\b/);
  assert.match((await ask("what's the output of `'ab'.repeat(3)`")).said, /ababab/);
});

test("a doing no rule writes is written from what it does: its examples, in the language's own words", async () => {
  const reversed = await ask("write a function that reverses a string");
  // Grounded from the dictionary when it can be reached, else found from examples: either way it runs.
  assert.match(reversed.said, /function \w+\(\w+\)/);
  assert.equal(written(reversed.said)("napkin"), "nikpan");
  assert.match((await ask('run it with "napkin"', [reversed])).said, /nikpan/);
  const sorts = await ask("write a function that sorts a list");
  assert.match(sorts.said, /function \w+\(\w+\)/);
  assert.deepEqual(written(sorts.said)([3, 1, 2]), [1, 2, 3]);
  const doubles = written((await ask("write a function that doubles a number")).said);
  assert.equal(doubles(4), 8);
});

test("a Concept no rule writes is written as what its realization composes", async () => {
  assert.equal(written((await ask("write a function that halves a number")).said)(10), 5);
  const average = await ask("write a function that averages a list");
  assert.equal(written(average.said)([2, 4, 9]), 5);
  assert.match((await ask("run it with [2, 4, 9]", [average])).said, /\b5\b/);
});

test("a built-in method is explained with what its documentation says, and where that came from", async () => {
  const { sourcesOf } = await import("../store/provenance.js");
  // As MethodDoc keeps a page it has read: the fact, stamped from the page.
  const page = store.addRelation("MDN", c("Imported", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push"));
  store.addRelation("JavaScript", c("Documents", "Array", "push", "adds the specified elements to the end of an array and returns the new length of the array"), undefined, page.seq);
  const r = await turn(new Runtime(store), "explain `names.push('bo')`", c("Execution"), { learn: false });
  assert.equal(r.spoken, 'Here\'s what it does: calls names.push with "bo", which adds the specified elements to the end of an array and returns the new length of the array.');
  assert.deepEqual(sourcesOf(store, r.result, r.expression), [{ label: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push" }]);
});
