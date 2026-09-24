import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { ConversationRepository } from "./conversations.js";

/** A conversation run the way the studio runs one, with the rules reader and no model. */
function chat() {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const history = conversations.turns(id).map((t) => ({ message: t.message, result: t.result, spoken: t.spoken }));
    const r = await turn(runtime, text, c("Execution"), { backend: "rules", learn: false, speak: false, history });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
    return { rendered: r.rendered, heard };
  };
  return { store, say };
}

const holds = (store: ConceptStore, identity: string) => (store.get(identity)?.relations ?? []).map((r) => format(r.claim));

test("a kind said with an article is believed on the kind, with its describing words as properties", async () => {
  const { store, say } = chat();
  const told = await say("a blorp is a small dog");
  assert.match(told.rendered, /^Believed\(/);
  assert.ok(holds(store, "Blorp").includes("IsA(Dog())"));
  assert.ok(holds(store, "Blorp").includes("Small()"));
  // Sourced from what was said.
  const isA = store.get("Blorp")!.relations.find((r) => format(r.claim) === "IsA(Dog())")!;
  assert.equal(isA.stamps?.[0].source, told.heard.seq);

  assert.match((await say("what is a blorp")).rendered, /Describes\(Blorp\(\), List\(IsA\(Dog\(\)\), Small\(\)\)\)/);
  assert.equal((await say("is a blorp a dog?")).rendered, "Answer(True())");
  assert.equal((await say("is a blorp a cat?")).rendered, "Answer(UnknownTruth())");
});

test("the user's name is Named on the user individual, and asking for it answers it", async () => {
  const { say } = chat();
  await say("my name is keal");
  assert.equal((await say("what is my name")).rendered, 'Answer("Keal")');
});

test("a person earns an identity from a lasting claim, and a role lands on them", async () => {
  const { store, say } = chat();
  await say("greg is my coworker");
  const [greg] = store.asObject(format("Greg")).filter((t) => t.predicate === "Named").map((t) => t.subject);
  assert.ok(greg?.startsWith("Greg_"));
  assert.ok(holds(store, greg).some((r) => /^CoworkerOf\(User_\d+\(\)\)$/.test(r)));

  await say("greg likes cats");
  assert.ok(holds(store, greg).includes("Likes(Cats())"), "the second claim resolves to the same Greg");
  assert.equal((await say("does greg like cats?")).rendered, "Answer(True())");
  assert.equal((await say("who is my coworker")).rendered, `Answer(${greg}())`);
});

test("person agreement: what i like and what greg likes are one relation", async () => {
  const { say } = chat();
  await say("i like pizza");
  assert.equal((await say("do i like pizza?")).rendered, "Answer(True())");
});

test("a happening stays in what was said and mints nothing", async () => {
  const { store, say } = chat();
  const before = store.size();
  assert.match((await say("i ate a sweet granny smith yesterday")).rendered, /^Noted\(/);
  assert.ok(!store.has("GrannySmith_1"));
  // Only the user individual may have appeared; nothing about the apple.
  assert.ok(store.size() - before <= 1);
});

test("asking about someone never mints them", async () => {
  const { store, say } = chat();
  const before = store.size();
  await say("who is greg");
  assert.equal(store.size(), before);
});

test("an object question reads beliefs, and a past one reads what was said", async () => {
  const { say } = chat();
  await say("i like pizza");
  assert.equal((await say("what do i like")).rendered, "Answer(Pizza())");
  await say("greg works at google");
  assert.equal((await say("where does greg work")).rendered, "Answer(Google())");
  await say("i ate a sweet granny smith yesterday");
  assert.equal((await say("what did i eat")).rendered, "Answer(Me(Ate(Sweet(GrannySmith()), Yesterday())))");
  await say("i went to the store");
  assert.equal((await say("where did i go")).rendered, "Answer(Me(Went(To(Store()))))");
});

test("what was told about someone is what was claimed, not what was asked", async () => {
  const { say } = chat();
  await say("greg is my coworker");
  await say("who is greg");
  await say("greg sent me a funny meme");
  const told = (await say("what did i tell you about greg")).rendered;
  assert.match(told, /Sent\(Me\(\), Funny\(Meme\(\)\)\)/);
  assert.ok(!told.includes("Interrogative"), told);
  assert.match((await say("tell me about greg")).rendered, /Said\(List\(/);
});

test("an attribute of the user is kept under its whole name and read back", async () => {
  const { say } = chat();
  assert.equal((await say("what is my favorite color")).rendered, "Answer(Unknown(My(Favorite(Color()))))");
  await say("my favorite color is blue");
  assert.equal((await say("what is my favorite color")).rendered, "Answer(Blue())");
  await say("my birthday is june 5");
  assert.equal((await say("when is my birthday")).rendered, "Answer(Birthday(June(), 5))");
});

test("he points at the person just talked about, and a role can be asked about", async () => {
  const { say } = chat();
  await say("greg is my coworker");
  assert.equal((await say("is he my coworker")).rendered, "Answer(True())");
  assert.equal((await say("is greg my coworker?")).rendered, "Answer(True())");
  await say("greg likes cats");
  assert.equal((await say("what does he like")).rendered, "Answer(Cats())");
});
