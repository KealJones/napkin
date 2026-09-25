import assert from "node:assert/strict";
import { test } from "node:test";
import { c, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

const store = new ConceptStore();
seed(store);
const say = async (e: string) => new Runtime(store).evaluate(parse(`RenderResponse(${e})`), c("Execution"));

test("results say themselves in English, with names kept and my turned to your", async () => {
  assert.equal(await say("Answer(Berlin())"), "Berlin.");
  assert.equal(await say("Answer(My(Coworker()))"), "Your coworker.");
  assert.equal(await say("Unknown(My(Cat(Name())))"), "I don't know your cat's name yet.");
  assert.equal(await say("Answer(15)"), "15.");
  assert.equal(await say("Answer(Hello())"), "Hello!");
});

test("a rule is said with its operation's English word", async () => {
  assert.equal(await say("Answer(Predicted(32, Multiply(Previous(), 2)))"), "32: each one is the one before times 2.");
  assert.equal(await say("Answer(Predicted(13, Add(BeforePrevious(), Previous())))"), "13: each one is the one two back plus the one before.");
});

test("what is known of Self is said in the first person", async () => {
  assert.equal(await say('Describes(Self(), List(Named("Napkin"), IsA(AI()), IsA(WorkInProgress())))'), "I'm Napkin, an AI, a work in progress.");
});

test("a result with no English wording is left to the host, not guessed at", async () => {
  const r = await say("SomethingNew(1)");
  assert.notEqual(typeof r, "string");
});
