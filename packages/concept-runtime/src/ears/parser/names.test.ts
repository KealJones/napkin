import assert from "node:assert/strict";
import { test } from "node:test";
import { nameOf } from "./names.js";
import { parseRules } from "./rules.js";

test("a written form's name keeps its words", () => {
  assert.equal(nameOf("cover letter"), "CoverLetter");
});

test("nouns side by side read as said: the last is the thing, the ones before describe it", () => {
  assert.match(parseRules("write me a cover letter").reading!.lines.join("\n"), /Letter\(Cover\(\)\)/);
  assert.match(parseRules("i like ice cream").reading!.lines.join("\n"), /Cream\(Ice\(\)\)/);
});
