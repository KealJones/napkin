import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { ConversationRepository } from "../memory/conversations.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

/** A conversation on a store of its own, recording what was said the way the studio does. */
const conversation = () => {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const r = await turn(runtime, text, c("Execution"), { backend: "rules", learn: false, speak: false, conversation: id });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
    return { rendered: String(r.rendered), gaps: r.gaps.map((g) => g.expression) };
  };
  return { store, say };
};

test("what was said is found by its shape when asked after, with nothing written for names", async () => {
  const { say } = conversation();
  assert.match((await say("my name is Keal")).rendered, /^Noted\(/, "a statement is kept, not run");
  assert.equal((await say("what is my name?")).rendered, "Answer(Keal())");
  await say("my dog's name is Bolt");
  assert.equal((await say("what is my dog's name?")).rendered, "Answer(Bolt())");
  await say("the capital of france is paris");
  assert.equal((await say("what is the capital of france?")).rendered, "Answer(Paris())");
});

test("the newest statement wins, a question asserts nothing, and what was never said stays unknown", async () => {
  const { say } = conversation();
  await say("my favorite color is green");
  await say("is my favorite color blue?");
  await say("my favorite color is red");
  assert.equal((await say("what is my favorite color?")).rendered, "Answer(Red())");
  const cat = await say("what is my cat's name?");
  assert.doesNotMatch(cat.rendered, /^Answer/);
  assert.ok(cat.gaps.length, "an unanswered question is still something to learn");
});

test("an answer found another way leaves no gap behind", async () => {
  const { say } = conversation();
  await say("my name is Keal");
  assert.deepEqual((await say("what is my name?")).gaps, []);
});

test("Extends answers with what the stored expression says beyond the goal, or False", async () => {
  const store = new ConceptStore();
  seed(store);
  const run = async (e: string) => format(await new Runtime(store).evaluate(parse(e), c("Execution")));
  assert.equal(await run("Extends(My(Name(Is(Keal()))), My(Name()))"), "List(Is(Keal()))");
  assert.equal(await run("Extends(Capital(Of(France()), Is(Paris())), Capital(Of(France())))"), "List(Is(Paris()))");
  assert.equal(await run("Extends(My(Dog()), My(Name()))"), "False()");
});
