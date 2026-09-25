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
    const r = await turn(runtime, text, c("Execution"), { backend: "rules", learn: false, speak: false, conversation: id });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
    return String(r.rendered);
  };
  return { store, say };
};

test("a word told is a word known: what it was said to mean, from what was said", async () => {
  const { say } = conversation();
  assert.match(await say("lol means laugh out loud"), /^Noted\(Lol\(Means\(/);
  assert.equal(await say("what does lol mean?"), 'Answer(Meaning(Lol(), "laugh out loud", as=Unlabelled(), from=Said()))');
});

test("a word that is an interjection is answered as talk, by inheritance", async () => {
  const { store, say } = conversation();
  store.addRelation("Zorp", c("IsA", c("Interjection")));
  store.addRelation("Zorp", c("Means", "a greeting among friends"));
  assert.match(await say("zorp"), /^Noted\(Zorp\(\).*means="a greeting among friends"\)$/);
});

test("a word alone is said, not set aside", async () => {
  const { say } = conversation();
  assert.equal(await say("yo"), "Answer(Hello())");
});

test("tell me about yourself describes Self, and a question about us nothing answers is not known", async () => {
  const { say } = conversation();
  assert.match(await say("tell me about yourself"), /^Describes\(Self\(\), List\(Named\("Napkin"\)/);
});
