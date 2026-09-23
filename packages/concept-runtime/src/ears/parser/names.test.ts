import assert from "node:assert/strict";
import { test } from "node:test";
import { concept } from "../../concept/unit.js";
import { ConceptStore } from "../../store/store.js";
import { namesOneThing, takeWanted, useGraph } from "./names.js";
import { parseRules } from "./rules.js";

test("a phrase the graph already knows is one thing, and nobody is asked", () => {
  const store = new ConceptStore();
  store.seed(concept("CoverLetter", { relations: ['SameAs(Wikidata("Q569410"))'] }));
  useGraph(store);
  takeWanted();
  assert.equal(namesOneThing("cover letters"), true);
  assert.deepEqual(takeWanted(), []);
  assert.match(parseRules("write me a cover letter").reading!.lines.join("\n"), /CoverLetter\(\)/);
  useGraph(undefined);
});

test("a phrase nobody has answered composes, and is wanted", () => {
  useGraph(new ConceptStore());
  takeWanted();
  assert.equal(namesOneThing("barista job"), undefined);
  assert.deepEqual(takeWanted(), ["barista job"]);
  useGraph(undefined);
});
