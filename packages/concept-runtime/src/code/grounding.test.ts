import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "../runtime/evaluator.js";

// packs/grounding.ncon (sources/grounding): a gloss read on the value a word is done to, into a
// realization of primitives. Glosses are given here, as Senses would fetch them.
const store = new ConceptStore();
seed(store);
const run = async (text: string) => format(await new Runtime(store).evaluate(parse(text), c("Execution")));

test("a sequence runs first to last, its opposite last to first, and traversing it that way reverses it", async () => {
  assert.equal(await run('Opposite(DirectionOf("abc"))'), "Direction(Last(), First())");
  assert.equal(await run("Traverse(List(1, 2, 3), Direction(Last(), First()))"), "List(3, 2, 1)");
  assert.equal(await run('Traverse("napkin", Direction(Last(), First()))'), '"nikpan"');
});

test("a dictionary gloss read on a list grounds to a doing of primitives", async () => {
  const reverse = "To turn something around so that it faces the opposite direction or runs in the opposite sequence.";
  assert.equal(await run(`GroundIn("${reverse}", List(1, 2, 3))`), "Traverse(List(1, 2, 3), Direction(Last(), First()))");
  assert.equal(await run('GroundIn("To place in a contrary order or direction.", List(1, 2, 3))'), "Traverse(List(1, 2, 3), Direction(Last(), First()))");
  assert.equal(await run('GroundIn("To make happy.", List(1, 2, 3))'), 'GroundIn("To make happy.", List(1, 2, 3))');
});
