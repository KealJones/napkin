import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { c, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "../runtime/evaluator.js";
import { toHost } from "../runtime/host.js";
import { runIsolated } from "../platform/node.js";
import { writeSource } from "./import.js";

// Every primitive every language has does the same thing three ways: its host implementation,
// the JavaScript its To rules write (run in the VM), and the Python (run when python3 is here).
const store = new ConceptStore();
seed(store);
const rt = new Runtime(store);
const CASES = `AddValues(2, 3); SubtractValues(7, 2); MultiplyValues(4, 5); DivideValues(9, 3); RemainderOf(7, 3); NegateValue(4); RaiseToPower(2, 10); Above(3, 2); Below(3, 2); AbsoluteValue(-4); SquareRootOf(16); RoundDown(2.7); RoundDown(-2.5); RoundUp(2.1); RoundNearest(2.5); RoundNearest(-2.5); RoundTo(3.14159, 2); Largest(List(3, 9, 2)); Smallest(List(3, 9, 2)); ToText(42); Sort(List(3, 1, 2)); Sort(List(10, 9, 1)); Sort(List("b", "a")); Reverse(List(1, 2, 3)); Reverse("abc"); Unique(List(1, 2, 1, 3)); First(List(4, 5)); Last(List(4, 5)); Slice(List(1, 2, 3, 4), 1); Slice(List(1, 2, 3, 4), 1, 3); AtPosition(List(4, 5, 6), 1); IndexOf(List(4, 5, 6), 5); Join(List("a", "b"), "-"); Split("a,b,c", ","); Lowercase("HeLLo"); Uppercase("hello"); Trim("  hi  "); StartsWith("hello", "he"); EndsWith("hello", "lo"); Includes("hello", "ell"); Replace("a-b-c", "-", "+"); Repeat("ab", 3); PadStart("7", 3, "0"); Append(List(1, 2), 3); Prepend(List(1, 2), 0); InsertAt(List(1, 3), 1, 2); Without(List(1, 2, 1, 3), 1); Range(2, 5); Zip(List(1, 2, 3), List("a", "b")); Traverse(List(1, 2, 3), Direction(Last(), First())); Half(10); Average(List(2, 4, 9)); Sum(List(1, 2, 3)); Percent(15, 80)`.split("; ");

const python = (() => {
  try {
    execFileSync("python3", ["-c", "print(1)"]);
    return true;
  } catch {
    return false;
  }
})();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

test("each primitive gives the same in the host, in the JavaScript written for it, and in the Python", async () => {
  const meaning = (e: Parameters<typeof rt.meaning>[0]) => rt.meaning(e, c("Execution"));
  for (const text of CASES) {
    const e = parse(text);
    // The graph's truths (True(), False()) are a language's booleans.
    const truth = (v: unknown): unknown => (v !== null && typeof v === "object" && "head" in v && ["True", "False"].includes(String(v.head)) ? v.head === "True" : v);
    const host = truth(toHost(await rt.evaluate(e, c("Execution"))));
    const js = writeSource(e, "JavaScript", { meaning });
    assert.deepEqual(js.unwritable, [], `${text} in JavaScript`);
    const ran = runIsolated(`JSON.stringify(${js.text})`);
    assert.ok(same(JSON.parse(String(ran.value)), host), `${text}: host ${JSON.stringify(host)}, JavaScript ${js.text} gives ${ran.value ?? ran.error}`);
    const py = writeSource(e, "Python", { meaning });
    assert.deepEqual(py.unwritable, [], `${text} in Python`);
    if (!python) continue;
    const got = JSON.parse(execFileSync("python3", ["-c", `import json; print(json.dumps(${py.text}))`]).toString());
    assert.ok(same(got, host), `${text}: host ${JSON.stringify(host)}, Python ${py.text} gives ${JSON.stringify(got)}`);
  }
});
