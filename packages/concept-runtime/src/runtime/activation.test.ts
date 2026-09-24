import assert from "node:assert/strict";
import { test } from "node:test";
import { c, parse } from "../concept/expression.js";
import { concept, relation, type Relation } from "../concept/unit.js";
import { ConversationRepository } from "../memory/conversations.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import type { StoredTraceEvent } from "../store/traces.js";
import { activation, activationParameters } from "./activation.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const DAY = 86_400_000;

/** A relation first asserted `ago` milliseconds before now. */
const old = (store: ConceptStore, claim: string, ago: number): Relation => ({
  ...relation(claim),
  stamps: [{ ...store.reserve(), recordedAt: new Date(Date.now() - ago).toISOString() }],
});

const put = (store: ConceptStore, identity: string, ...claims: string[]) => {
  for (const claim of claims) store.addRelation(identity, parse(claim));
};

test("base level decays with time and rises with uses", () => {
  const store = new ConceptStore();
  put(store, "Thing", "IsA(Category())");
  const at = (ms: number) => activation(store, [], { among: ["Thing"], now: Date.now() + ms })[0].base;
  assert.ok(at(3_600_000) > at(DAY), "an hour later is more active than a day later");
  const once = at(DAY);
  put(store, "Thing", "Small()");
  assert.ok(at(DAY) > once, "a second use raises it");
  assert.ok(activation(store, [], { among: ["Thing"], now: Date.now() + 400 * DAY })[0].dormant, "a year unused is dormant");
});

test("spread reaches a neighbour, with the path that reached it", () => {
  const store = new ConceptStore();
  put(store, "Jam", "IsA(Preserve())");
  put(store, "Preserve", "PackagedIn(Jar())");
  put(store, "Jar", "Small()");
  const jar = activation(store, ["Jam"]).find((a) => a.identity === "Jar");
  assert.ok(jar && jar.spread > 0);
  assert.deepEqual(jar.path, ["Jam", "Preserve", "Jar"]);
  assert.deepEqual(jar.via, ["IsA", "PackagedIn"]);
  assert.ok(!activation(store, ["Jam"]).some((a) => a.identity === "Jam"), "a source is not its own result");
});

test("fan-out normalisation keeps a hub from passing activation to everything it touches", () => {
  const store = new ConceptStore();
  put(store, "Source", "Near(Hub())", "Near(Mid())");
  for (let i = 0; i < 20; i++) put(store, "Hub", `Has(Leaf${i}())`), put(store, `Leaf${i}`, "Small()");
  put(store, "Mid", "Has(Target())");
  put(store, "Target", "Small()");
  const ranked = activation(store, ["Source"]);
  const spread = (id: string) => ranked.find((a) => a.identity === id)?.spread ?? 0;
  assert.ok(spread("Target") > 0, "a narrow path passes activation on");
  assert.equal(spread("Leaf0"), 0, "a hub with twenty edges passes none");
});

test("a relation holding only in a context spreads only in that context", () => {
  const store = new ConceptStore();
  store.addRelation("Moment", parse("IsA(Instant())"));
  store.addRelation("Moment", parse("IsA(MusicSingle())"), parse("Music()"));
  put(store, "MusicSingle", "Small()");
  put(store, "Instant", "Small()");
  const reached = (context?: string) =>
    activation(store, ["Moment"], context ? { context: parse(context) } : {}).map((a) => a.identity);
  assert.ok(reached().includes("Instant"));
  assert.ok(!reached().includes("MusicSingle"), "not in no particular context");
  assert.ok(reached("Music()").includes("MusicSingle"), "but in a music context");
});

test("Concepts used in the same successful turn spread to one another", () => {
  const store = new ConceptStore();
  put(store, "Website", "Small()");
  put(store, "ProductPage", "Small()");
  const event = (id: string, concept: string, parent: string | null): StoredTraceEvent => ({
    id, traceId: "t", saidSeq: 7, parentEventId: parent, concept, caller: "", useContext: "Execution()",
    input: `${concept}()`, selectedRealization: null, realizationHash: null, output: null, outcome: "success",
    error: null, startedAt: new Date().toISOString(), durationMs: 1, exchanges: [], candidateCount: 1, tieBroken: false,
  });
  const events = [event("a", "Website", null), event("b", "ProductPage", "a")];
  const page = activation(store, ["Website"], { events }).find((a) => a.identity === "ProductPage");
  assert.deepEqual(page?.via, ["co-used 1x"]);
});

test("a later assertion of a parameter shadows the seeded one", () => {
  const store = new ConceptStore();
  seed(store);
  assert.equal(activationParameters(store).Decay, 0.5);
  store.addRelation("Activation", parse("Decay(0.3)"));
  assert.equal(activationParameters(store).Decay, 0.3);
  seed(store);
  assert.equal(activationParameters(store).Decay, 0.3, "seeding again does not undo the edit");
});

/** memory-spec Part 18 step 7's done-criterion, through a real conversation. */
test("an old, unused individual is no bare-reference candidate, and still answers when named", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(
    concept("Greg_1", {
      relations: [old(store, 'Named("Greg")', 365 * DAY), old(store, "IsA(Person())", 365 * DAY), old(store, "Likes(Cats())", 365 * DAY)],
    }),
  );
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const r = await turn(runtime, text, c("Execution"), { backend: "rules", learn: false, speak: false });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
    return r.rendered;
  };
  assert.notEqual(await say("what does he like"), "Answer(Cats())", "a year unused, he is nobody");
  assert.equal(await say("what does greg like"), "Answer(Cats())", "the name still finds him");
  assert.equal(await say("what does he like"), "Answer(Cats())", "and being asked about woke him up");
});
