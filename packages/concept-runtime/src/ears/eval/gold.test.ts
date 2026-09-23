import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGold, parseGold } from "./gold.js";

const GOLD = join(dirname(fileURLToPath(import.meta.url)), "../../../eval/ears/gold.md");

test("every gold reading is valid IR and every id is unique", () => {
  const cases = loadGold(GOLD);
  assert.ok(cases.length >= 40, `expected at least 40 gold cases, found ${cases.length}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) assert.ok(c.why, `${c.id} says why`);
});

test("a message may hold markdown headings and fences of its own", () => {
  const [c] = parseGold([
    "## fenced", "category: code", "",
    "````message", "## Task", "fix this:", "```", "boom", "```", "````", "",
    "```reading", 'Do(Fix("boom"))', "```", "", "Why: because.",
  ].join("\n"));
  assert.equal(c.id, "fenced");
  assert.equal(c.message, "## Task\nfix this:\n```\nboom\n```");
  assert.equal(c.why, "because.");
});
