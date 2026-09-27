import assert from "node:assert/strict";
import { test } from "node:test";
import { patchText } from "./patch.js";

// code/patch.ts: a change between two writings of code made in the text it was read from.
test("a repair is made in place, and the rest of the text keeps its layout", () => {
  const original = 'function check(x) {\n  if (x = 5) { return "five" }\n  return "other"\n}\n';
  const before = 'function check(x) { if ((x = 5)) { return "five" }; return "other" }';
  const after = 'function check(x) { if ((x === 5)) { return "five" }; return "other" }';
  assert.equal(patchText(original, before, after), 'function check(x) {\n  if (x === 5) { return "five" }\n  return "other"\n}\n');
});

test("a statement removed takes its line with it", () => {
  const original = "function f() {\n  return 1;\n  console.log(2);\n}\n";
  assert.equal(patchText(original, "function f() { return 1; console.log(2) }", "function f() { return 1 }"), "function f() {\n  return 1;\n}\n");
});
