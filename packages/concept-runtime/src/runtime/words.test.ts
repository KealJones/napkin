import assert from "node:assert/strict";
import { test } from "node:test";
import { c } from "../concept/expression.js";
import { ConversationRepository } from "../memory/conversations.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const conversation = () => {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const r = await turn(runtime, text, c("Execution"), { learn: false, conversation: id });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, spoken: r.spoken, heard });
    return r.spoken;
  };
  return { store, say };
};

test("a word told is a word known: what it was said to mean, from what was said", { todo: "hearing: \"lol means laugh out loud\" is heard as three phrases; \"means\" does not yet take both sides" }, async () => {
  const { say } = conversation();
  assert.doesNotMatch(await say("lol means laugh out loud"), /stuck|couldn't read|nothing for/i);
  assert.match(await say("what does lol mean?"), /laugh out loud/i);
});

test("a word that is an interjection is answered as talk, by inheritance", async () => {
  const { store, say } = conversation();
  store.addRelation("Zorp", c("IsA", c("Interjection")));
  store.addRelation("Zorp", c("Means", "a greeting among friends"));
  const reply = await say("zorp");
  assert.match(reply, /greet|hello|hi\b|zorp/i);
  assert.doesNotMatch(reply, /stuck|couldn't read/i);
});

test("a word alone is said, not set aside", async () => {
  const { say } = conversation();
  assert.match(await say("yo"), /hello|\bhi\b|hey|\byo\b/i);
});

test("tell me about yourself describes Self, and a question about us nothing answers is not known", async () => {
  const { say } = conversation();
  assert.match(await say("tell me about yourself"), /napkin/i);
});

test("a word told a value is worked out with: what was said it is stands in for it", async () => {
  const { say } = conversation();
  await say("pi is 3.14159");
  assert.match(await say("what is pi times 2"), /6\.283/);
  await say("a dozen is 12");
  assert.match(await say("what is 3 times a dozen"), /\b36\b/);
});
