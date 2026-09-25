import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, format } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

const store = new ConceptStore();
seed(store);
const hear = async (text: string) => format(await new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Execution")));

test("a message is heard as its words, each its Concept, in the order said", async () => {
  assert.equal(await hear("my old car"), "Phrases(My(), Old(), Car())");
  assert.equal(await hear("a 1999 film"), "Phrases(A(), 1999, Film())");
});

test("under Hearing a word only hears: nothing it does elsewhere runs", async () => {
  // Add and Delete have behaviour; heard, they are words.
  assert.equal(await hear("add 2 and 3 then delete everything"), "Phrases(Add(), 2, And(), 3, Then(), Delete(), Everything())");
});
