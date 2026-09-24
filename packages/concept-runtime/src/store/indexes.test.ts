import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, isCall, parse } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "./store.js";

test("the mention index finds a Concept head three levels deep", () => {
  const store = new ConceptStore();
  store.addRelation(
    "Conversation_1",
    parse("Said(Me(), Mood(Declarative(), Me(Ate(Sweet(GrannySmith())))), text=\"I ate a sweet granny smith\")"),
  );
  const found = store.mentioning(c("GrannySmith"));
  assert.equal(found.length, 1);
  assert.equal(found[0].identity, "Conversation_1");
  assert.ok(format(found[0].relation.claim).includes("GrannySmith()"));
});

test("the mention index finds a literal at any depth, string and number alike", () => {
  const store = new ConceptStore();
  store.addRelation("Conversation_1", parse("Said(Me(), Ate(Me(), Apple(), On(Date(2024, 10, 15))), text=\"t\")"));
  store.addRelation("Greg", parse('Named("Greg")'));

  const byYear = store.mentioning(2024);
  assert.equal(byYear.length, 1);
  assert.ok(format(byYear[0].relation.claim).includes("Date(2024"));

  const byName = store.mentioning("Greg");
  assert.equal(byName.length, 1);
  assert.equal(byName[0].identity, "Greg");
});

test("a relation with no context is not a mention of anything in a context", () => {
  const store = new ConceptStore();
  store.addRelation("Chess", parse("IsA(Sport())"));
  // A boolean, null, or a variable is not a mention key: nothing to look up by.
  assert.equal(store.mentioning(true).length, 0);
  assert.equal(store.mentioning(null).length, 0);
});

test("the time index answers a recordedAt range without scanning every unit", () => {
  const store = new ConceptStore();
  store.seed(
    concept("Old", {
      relations: [{ claim: parse("Said(Me(), Hi())"), stamps: [{ seq: 100, recordedAt: "2020-01-01T00:00:00.000Z" }] }],
    }),
  );
  store.seed(
    concept("Middle", {
      relations: [{ claim: parse("Said(Me(), Bye())"), stamps: [{ seq: 101, recordedAt: "2024-10-15T12:00:00.000Z" }] }],
    }),
  );
  store.seed(
    concept("New", {
      relations: [{ claim: parse("Said(Me(), Yo())"), stamps: [{ seq: 102, recordedAt: "2026-01-01T00:00:00.000Z" }] }],
    }),
  );

  const inOctober = store.between("2024-10-01T00:00:00.000Z", "2024-10-31T23:59:59.999Z");
  assert.deepEqual(inOctober.map((e) => e.identity), ["Middle"]);
  assert.deepEqual(
    store.between("2020-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z").map((e) => e.identity).sort(),
    ["Middle", "New", "Old"],
  );
});

test("a stamp is found by its seq in O(1), replacing the old scan", () => {
  const store = new ConceptStore();
  const s1 = store.addRelation("Greg", parse("CoworkerOf(Me())"));
  const s2 = store.addRelation("Chess", parse("IsA(Sport())"));
  assert.equal(store.findStamp(s1.seq)?.identity, "Greg");
  assert.equal(store.findStamp(s2.seq)?.identity, "Chess");
  assert.equal(store.findStamp(999999), undefined);
});

test("a re-asserted relation is found by either of its two stamps, both pointing at it", () => {
  const store = new ConceptStore();
  const first = store.addRelation("Game_7", parse("Moved(White(), Knight(), F3())"));
  const again = store.addRelation("Game_7", parse("Moved(White(), Knight(), F3())"), undefined, first.seq);
  const byFirst = store.findStamp(first.seq);
  const bySecond = store.findStamp(again.seq);
  assert.equal(byFirst?.relation, bySecond?.relation);
  assert.deepEqual(byFirst?.relation.stamps?.map((s) => s.seq), [first.seq, again.seq]);
});

test("the mention and time indexes stay correct after addRelation, re-seed, forgetConcept and replaceRealizations", () => {
  const store = new ConceptStore();
  store.seed(concept("Greg", { relations: ["IsA(Person())"] }));
  store.addRelation("Greg", parse("Likes(Cats())"));
  assert.equal(store.mentioning(c("Cats")).length, 1);
  assert.equal(store.mentioning(c("Person")).length, 1);

  // Re-seeding with an already-held relation changes nothing about what is findable.
  store.seed(concept("Greg", { relations: ["IsA(Person())"] }));
  assert.equal(store.mentioning(c("Person")).length, 1);

  // Forgetting removes every mention and every stamp it held, and nothing else's.
  store.addRelation("Emmy", parse("Likes(Cats())"));
  assert.equal(store.mentioning(c("Cats")).length, 2);
  const gregStamps = (store.get("Greg")?.relations ?? []).flatMap((r) => r.stamps?.map((s) => s.seq) ?? []);
  store.forgetConcept("Greg");
  assert.equal(store.mentioning(c("Cats")).length, 1);
  assert.equal(store.mentioning(c("Cats"))[0].identity, "Emmy");
  assert.equal(store.mentioning(c("Person")).length, 0);
  for (const seq of gregStamps) assert.equal(store.findStamp(seq), undefined);

  // replaceRealizations only touches realizations, so relations, mentions and stamps survive.
  store.addRealization("Emmy", {
    pattern: parse("Foo()"),
    body: parse("Bar()"),
    properties: [],
    evaluateArguments: true,
    evaluateResult: false,
  });
  store.replaceRealizations("Emmy", []);
  assert.equal(store.mentioning(c("Cats")).length, 1);
  assert.equal(store.get("Emmy")?.realizations.length, 0);
});

test("what was eaten in October 2024 is found through the mention index, not by scanning conversations", () => {
  const store = new ConceptStore();
  // Several conversations, only one of which mentions eating anything.
  store.addRelation("Conversation_1", parse('Said(Me(), Hi(), text="hi")'));
  store.addRelation(
    "Conversation_2",
    parse('Said(Me(), Ate(Me(), GrannySmith(Sweet()), On(Date(2024, 10, 15))), text="I ate a very sweet granny smith on october 15th 2024")'),
  );
  store.addRelation("Conversation_3", parse('Said(Me(), What(Plus(2, 2)), text="what is 2 plus 2")'));

  // The done-criterion for memory-spec build step 2 (Part 18): find it through the index,
  // without iterating every conversation's relations by hand.
  const found = store.mentioning(c("Ate"));
  assert.equal(found.length, 1);
  const claim = found[0].relation.claim;
  assert.ok(format(claim).includes("GrannySmith"));
  // The apple itself is reachable the same way, from a smaller and more specific key.
  assert.equal(store.mentioning(c("GrannySmith"))[0].identity, "Conversation_2");
});

test("Mentioning, Between, Stamps, RecordedAt and SourceOf are ordinary Concepts reading the store", async () => {
  const store = new ConceptStore();
  seed(store);
  const runtime = new Runtime(store);
  const heard = store.addRelation(
    "Conversation_1",
    parse('Said(Me(), Ate(Me(), GrannySmith()), text="I ate a granny smith")'),
  );
  const believed = store.addRelation("Greg", parse("Likes(Cats())"), undefined, heard.seq);

  const mentioned = await runtime.evaluate(c("Mentioning", c("GrannySmith")));
  assert.equal(format(mentioned), 'List(Said(Me(), Ate(Me(), GrannySmith()), text="I ate a granny smith"))');

  const recordedAt = await runtime.evaluate(parse(`RecordedAt(${heard.seq})`));
  assert.equal(recordedAt, heard.recordedAt);

  const source = await runtime.evaluate(parse(`SourceOf(${believed.seq})`));
  assert.equal(source, heard.seq);

  const noSource = await runtime.evaluate(parse(`SourceOf(${heard.seq})`));
  assert.equal(format(noSource), "Unknown()");

  const unknownSeq = await runtime.evaluate(parse("Stamps(999999)"));
  assert.equal(format(unknownSeq), "Stamps(999999)");

  const stamped = await runtime.evaluate(parse(`Stamps(${heard.seq})`));
  assert.ok(isCall(stamped) && stamped.head === "Stamp");

  const inRange = await runtime.evaluate(
    parse(`Between("${new Date(Date.now() - 60000).toISOString()}", "${new Date(Date.now() + 60000).toISOString()}")`),
  );
  assert.ok(format(inRange).includes("GrannySmith"));
});
