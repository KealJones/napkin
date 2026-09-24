import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
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
  const { store, say } = chat();
  await say("i like pizza");
  assert.equal((await say("what do i like")).rendered, "Answer(Pizza())");
  await say("greg works at google");
  assert.equal((await say("where does greg work")).rendered, "Answer(Google())");
  // An apple the graph already knows by one name, so the reading does not wait on Wikidata.
  store.seed(concept("GrannySmith", { relations: ["IsA(Apple())"] }));
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
  assert.equal((await say("when is my birthday")).rendered, "Answer(Date(month=June(), day=5))");
});

test("he points at the person just talked about, and a role can be asked about", async () => {
  const { say } = chat();
  await say("greg is my coworker");
  assert.equal((await say("is he my coworker")).rendered, "Answer(True())");
  assert.equal((await say("is greg my coworker?")).rendered, "Answer(True())");
  await say("greg likes cats");
  assert.equal((await say("what does he like")).rendered, "Answer(Cats())");
});

test("a subject question finds who holds the relation, believed or said", async () => {
  const { say } = chat();
  await say("greg likes cats");
  await say("emmy likes cats");
  assert.match((await say("who likes cats")).rendered, /^Answer\(List\((Emmy|Greg)_\d+\(\), (Emmy|Greg)_\d+\(\)\)\)$/);
  await say("greg sent me a funny meme");
  assert.match((await say("who sent me a meme")).rendered, /^Answer\(Greg\(Sent\(Me\(\), Funny\(Meme\(\)\)\)/);
  assert.equal((await say("what is 2 plus 2")).rendered, "Answer(4)", "a computation is still computed");
});

test("forgetting what was said about something removes the words and every belief they caused", async () => {
  const { store, say } = chat();
  await say("my favorite color is blue");
  await say("greg likes money");
  await say("i spent too much money yesterday");
  const user = store.asObject("User").find((t) => t.predicate === "IsA")!.subject;
  const before = (store.get(user)?.relations ?? []).length;

  assert.match((await say("forget what i said about money")).rendered, /^Answer\(Forgotten\(Money\(\), 2, said="money"\)\)$/);
  // Only the request itself still mentions money: it names the topic, not what was said.
  const mentions = store.mentioning(c("Money")).filter((m) => format(m.relation.claim).startsWith("Said(Me()"));
  assert.deepEqual(mentions.map((m) => format(m.relation.claim)).filter((t) => !t.includes("Forget(")), [], "the words are gone");
  const greg = store.asObject(format("Greg")).find((t) => t.predicate === "Named")?.subject;
  assert.ok(!greg || !holds(store, greg).includes("Likes(Money())"), "the belief sourced from them is gone");
  // What was not about money stays.
  assert.equal((await say("what is my favorite color")).rendered, "Answer(Blue())");
  assert.equal((store.get(user)?.relations ?? []).length, before);
});

test("an appositive names a person and the role they hold", async () => {
  const { store, say } = chat();
  assert.match((await say("my sister emmy is a nurse")).rendered, /^Believed\(Emmy\(\), List\(SisterOf\(User_\d+\(\)\), IsA\(Nurse\(\)\)\)\)$/);
  const emmy = store.asObject(format("Emmy")).find((t) => t.predicate === "Named")!.subject;
  assert.match((await say("who is my sister")).rendered, new RegExp(`^Answer\\(${emmy}\\(\\)\\)$`));
  await say("emmy loves pizza");
  assert.equal((await say("what does she love")).rendered, "Answer(Pizza())");
});

test("what did i do finds any happening, and each claim in a message is confirmed", async () => {
  const { say } = chat();
  assert.match((await say("my name is keal and i like hiking")).rendered, /^Sequence\(Believed\(Me\(\), List\(Named\("Keal"\)\)\), Believed\(/);
  await say("i went to the dentist today");
  await say("i ate pancakes today");
  assert.match((await say("what did i do today")).rendered, /^Answer\(List\(/);
});

test("what do you know about me is what is held about the user", async () => {
  const { say } = chat();
  await say("my favorite color is green");
  assert.match((await say("what do you know about me")).rendered, /FavoriteColor\(Green\(\)\)/);
});

test("what does she do is what she was said to be", async () => {
  const { say } = chat();
  await say("my sister emmy is a nurse");
  assert.equal((await say("what does she do")).rendered, "Answer(Nurse())");
});

test("two claims joined by and my are two claims, and a run-together reading is not a name", async () => {
  const { store, say } = chat();
  await say("my name is keal and my sister emmy is a nurse");
  const user = store.asObject("User").find((t) => t.predicate === "IsA")!.subject;
  assert.ok(holds(store, user).includes('Named("Keal")'), holds(store, user).join(" "));
  assert.ok(!holds(store, user).some((r) => r.startsWith("Name(")), "no run-together Name attribute");
  const emmy = store.asObject(format("Emmy")).find((t) => t.predicate === "Named")!.subject;
  assert.ok(holds(store, emmy).includes(`SisterOf(${user}())`));
});

test("a second line keeps what its names resolved to", async () => {
  const { store, say } = chat();
  await say("emmy loves pizza");
  await say("my name is keal and my sister emmy is a nurse");
  const emmys = store.asObject(format("Emmy")).filter((t) => t.predicate === "Named").map((t) => t.subject);
  assert.equal(emmys.length, 1, "the same Emmy, not a second one");
  assert.ok(holds(store, emmys[0]).includes("IsA(Nurse())"));
});

test("closing an isolated conversation drops its words and keeps what they taught, sourced from Isolated", async () => {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create(false);
  const runtime = new Runtime(store);
  const heard = conversations.receive();
  runtime.trace.said(heard.seq);
  const r = await turn(runtime, "greg likes cats", c("Execution"), { backend: "rules", learn: false, speak: false });
  conversations.record(id, { message: "greg likes cats", ...(r.expression ? { parsed: r.expression } : {}), heard });
  const greg = store.asObject(format("Greg")).find((t) => t.predicate === "Named")!.subject;

  assert.ok(conversations.closeIsolated(id));
  assert.ok(!store.has(id), "the words are gone");
  const likes = store.get(greg)!.relations.find((x) => format(x.claim) === "Likes(Cats())")!;
  const source = store.findStamp(likes.stamps![0].source!);
  assert.equal(source?.identity, "Isolated", "learned in an isolated conversation");
});

test("a relative time is anchored to when it was said, and said back as true now", async () => {
  const { store, say } = chat();
  const { parse } = await import("../concept/expression.js");
  // Said yesterday: "i ate pancakes today".
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const conversation = store.all().find((u) => u.identity.startsWith("Conversation_"))!.identity;
  store.addRelation(conversation, parse('Said(Me(), Mood(Declarative(), Me(Ate(Pancakes(), Today()))), text="i ate pancakes today")'), undefined, { ...store.reserve(), recordedAt: yesterday });
  await say("i ate soup today");
  assert.equal((await say("what did i eat yesterday")).rendered, "Answer(Me(Ate(Pancakes(), Yesterday())))");
  assert.match((await say("what did i eat today")).rendered, /^Answer\(Me\(Ate\(Soup\(.*Today\(\)/);
});

test("two people with one name are asked about, and the answer picks one", async () => {
  const { store, say } = chat();
  await say("my coworker greg lives in denver");
  // A second Greg, minted apart from the first (memory-spec Part 6.5).
  const user = store.asObject("User").find((t) => t.predicate === "IsA")!.subject;
  const greg2 = store.mint("Greg");
  store.addRelation(greg2, c("Named", "Greg"));
  store.addRelation(greg2, c("CousinOf", c(user)));

  const asked = (await say("greg likes cats")).rendered;
  assert.match(asked, /^Which\(Greg\(\), List\(Greg_\d+\(\), Greg_\d+\(\)\), described=List\("your coworker", "your cousin"\)/);
  const { say: sayIt } = await import("../ears/say.js");
  const { parse } = await import("../concept/expression.js");
  assert.equal(await sayIt("greg likes cats", parse(asked)), "Which Greg do you mean: your coworker, or your cousin?");
  assert.ok(!holds(store, greg2).includes("Likes(Cats())"), "nothing believed yet");

  await say("the cousin");
  assert.ok(holds(store, greg2).includes("Likes(Cats())"), "the picked Greg holds it");
});

test("an explicit date is when it happened, asked for by day or by month", async () => {
  const { store, say } = chat();
  store.seed(concept("GrannySmith", { relations: ["IsA(Apple())"] }));
  await say("i ate a sweet granny smith on october 15th 2024");
  await say("i ate soup today");
  assert.match((await say("what did i eat in october 2024")).rendered, /^Answer\(Me\(Ate\(Sweet\(GrannySmith\(\)\), On\(Date\(year=2024, month=October\(\), day=15\)\)\)\)\)$/);
  assert.match((await say("what did i eat on october 15")).rendered, /GrannySmith/);
  assert.doesNotMatch((await say("what did i eat in october 2024")).rendered, /Soup/);
});

test("a lasting fact that contradicts one held is asked about, and yes replaces it", async () => {
  const { store, say } = chat();
  await say("greg lives in denver");
  const greg = store.asObject(format("Greg")).find((t) => t.predicate === "Named")!.subject;
  assert.match((await say("greg lives in boston")).rendered, /^Conflict\(Greg\(\), List\(LivesIn\(Denver\(\)\)\), List\(LivesIn\(Boston\(\)\)\)/);
  assert.ok(!holds(store, greg).includes("LivesIn(Boston())"), "nothing changed by asking");
  await say("yes he moved");
  assert.equal((await say("where does greg live")).rendered, "Answer(Boston())");
  // Retracted, not deleted: the record of Denver stays, with its stamps.
  assert.ok(holds(store, greg).includes("LivesIn(Denver())"));
});

test("an attribute's new value is asked about the same way", async () => {
  const { say } = chat();
  await say("my favorite color is blue");
  assert.match((await say("my favorite color is red")).rendered, /^Conflict\(/);
  await say("yes");
  assert.equal((await say("what is my favorite color")).rendered, "Answer(Red())");
});
