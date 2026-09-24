import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, format, isCall, parse, positional } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
import { agenda, exist } from "../runtime/exist.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { collect } from "../store/collect.js";
import { ConceptStore } from "../store/store.js";

const fresh = () => {
  const store = new ConceptStore();
  seed(store);
  return new Runtime(store);
};

/**
 * Fabricate a `Said` occurrence at a past moment, the way a real turn would record one
 * (`memory/conversations.ts`), but with a stamp the test controls: `addRelation` accepts a
 * pre-made `Stamp` as `cause` and uses it as the relation's own stamp verbatim.
 */
function say(store: ConceptStore, conversation: string, clause: string, whenISO: string): void {
  if (!store.has(conversation)) store.seed(concept(conversation, { relations: ["IsA(Conversation())"] }));
  const content = call("Mood", [{ value: c("Declarative") }, { value: parse(clause) }]);
  const claim = call("Said", [{ value: c("Me") }, { value: content }, { name: "text", value: clause }]);
  const { seq } = store.reserve();
  store.addRelation(conversation, claim, undefined, { seq, recordedAt: whenISO });
}

const holds = (store: ConceptStore, identity: string) =>
  (store.get(identity)?.relations ?? []).map((r) => format(r.claim));

const user = (store: ConceptStore): string | undefined =>
  store.asObject("User").find((t) => t.predicate === "IsA")?.subject;

/* ---------------- evidence thresholds ---------------- */

test("one conversation repeating itself is not enough: consolidation needs distinct conversations and days", async () => {
  const rt = fresh();
  for (let i = 0; i < 4; i += 1) say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));
  assert.equal(user(rt.store), undefined, "no user minted, nothing was believed");
});

test("distinct conversations on the same day are not enough either", async () => {
  const rt = fresh();
  for (const convo of ["Conversation_a", "Conversation_b", "Conversation_c"]) {
    say(rt.store, convo, "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  }
  await rt.evaluate(c("Consolidate"), c("Execution"));
  assert.equal(user(rt.store), undefined);
});

test("distinct conversations AND distinct days consolidates a repeated happening into a lasting fact", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));

  const id = user(rt.store);
  assert.ok(id, "the user is minted from the consolidated claim");
  assert.ok(holds(rt.store, id!).includes("Likes(GrannySmith())"));
});

/* ---------------- provenance ---------------- */

test("the consolidated fact's source is the consolidation stamp, carrying evidence count and span", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));

  const id = user(rt.store)!;
  const unit = rt.store.get(id)!;
  const mark = unit.relations.find((r) => isCall(r.claim) && r.claim.head === "Consolidation")!;
  assert.ok(mark, "a Consolidation relation was recorded");
  const markClaim = mark.claim;
  if (!isCall(markClaim)) throw new Error("expected a call");
  const [, evidence, from, to] = positional(markClaim);
  assert.equal(evidence, 3);
  assert.equal(from, "2026-01-01");
  assert.equal(to, "2026-01-10");

  const likes = unit.relations.find((r) => format(r.claim) === "Likes(GrannySmith())")!;
  assert.equal(likes.stamps?.[0].source, mark.stamps?.[0].seq, "the fact points at the consolidation, not at every occurrence");
});

test("consolidating twice adds nothing", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));
  const id = user(rt.store)!;
  const before = rt.store.get(id)!.relations.length;
  await rt.evaluate(c("Consolidate"), c("Execution"));
  assert.equal(rt.store.get(id)!.relations.length, before);
});

test("a dry run reports without asserting anything", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  rt.context.set("dryRun", "true");
  const out = format(await rt.evaluate(c("Consolidate"), c("Execution")));
  assert.match(out, /Likes\(GrannySmith\(\)\)/);
  assert.equal(user(rt.store), undefined, "nothing committed");
});

/* ---------------- agenda / Exist ---------------- */

test("consolidation is proposed on the agenda once something has been said, and Exist commits it", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");

  assert.ok(agenda(rt, 100).some((i) => i.what === "consolidate"));
  // A generous budget: a fresh seed already carries a few cheap "learn" intents for
  // deliberately incomplete seed Concepts (residual-teaching fixtures), and those are
  // rightly cheaper-first ahead of consolidation in the ordering.
  await exist(rt, { budget: 20 });
  const id = user(rt.store);
  assert.ok(id && holds(rt.store, id).includes("Likes(GrannySmith())"));
});

/* ---------------- a specific relation cannot always be named mechanically ---------------- */

test("a multi-argument happening consolidates to the generic Often, not a guessed relation name", async () => {
  const rt = fresh();
  rt.store.seed(concept("Greg", { relations: ["IsA(Person())"] }));
  say(rt.store, "Conversation_a", "Greg(Sent(Me(), Meme()))", "2026-02-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Greg(Sent(Me(), Meme()))", "2026-02-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Greg(Sent(Me(), Meme()))", "2026-02-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));
  assert.ok(holds(rt.store, "Greg").includes("Often(Sent(Me(), Meme()))"));
});

/* ---------------- collection: safety properties (memory-spec Part 10.4) ---------------- */

const DAY = 24 * 60 * 60 * 1000;

test("collected occurrent evidence after consolidation leaves the consolidated fact answerable", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));

  const now = Date.parse("2026-03-01T00:00:00.000Z");
  const gone = collect(rt.store, { now, dormantForMs: 30 * DAY });
  assert.ok(gone.some((g) => g.what === "stamp"), "the raw Said occurrences are collectible");

  const id = user(rt.store)!;
  assert.ok(holds(rt.store, id).includes("Likes(GrannySmith())"), "the consolidated fact still answers");
  assert.ok(!holds(rt.store, "Conversation_a").some((c2) => c2.startsWith("Said(")), "the covered occurrence is gone");
});

test("a belief is never collected by age, even long dormant", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));
  const id = user(rt.store)!;

  const now = Date.parse("2030-01-01T00:00:00.000Z");
  collect(rt.store, { now, dormantForMs: 30 * DAY });
  assert.ok(holds(rt.store, id).includes("Likes(GrannySmith())"), "Enduring relations are never inspected for age collection");
});

test("a provenance link is never collected: the consolidation stamp survives because a live stamp still sources from it", async () => {
  const rt = fresh();
  say(rt.store, "Conversation_a", "Me(Ate(GrannySmith()))", "2026-01-01T00:00:00.000Z");
  say(rt.store, "Conversation_b", "Me(Ate(GrannySmith()))", "2026-01-05T00:00:00.000Z");
  say(rt.store, "Conversation_c", "Me(Ate(GrannySmith()))", "2026-01-10T00:00:00.000Z");
  await rt.evaluate(c("Consolidate"), c("Execution"));
  const id = user(rt.store)!;

  const now = Date.parse("2030-01-01T00:00:00.000Z");
  collect(rt.store, { now, dormantForMs: 30 * DAY });
  assert.ok(
    rt.store.get(id)!.relations.some((r) => isCall(r.claim) && r.claim.head === "Consolidation"),
    "the Consolidation relation is the source of the live Likes stamp, so it is kept",
  );
});

test("a live individual's stamps are kept: an open individual (kind defines an ending, none recorded) is never touched", async () => {
  const rt = fresh();
  rt.store.seed(concept("Match", { relations: ["Ends()"] }));
  rt.store.seed(concept("Match_1", { relations: ["IsA(Match())"] }));
  const oldStamp = { seq: rt.store.reserve().seq, recordedAt: "2020-01-01T00:00:00.000Z" };
  rt.store.addRelation("Match_1", parse("Moved(Knight(), F3())"), undefined, oldStamp);

  // The move is covered by a Consolidation elsewhere so it would otherwise qualify.
  rt.store.addRelation("Match_1", call("Consolidation", [{ value: parse("Moved(Knight(), F3())") }, { value: 3 }, { value: "2020-01-01" }, { value: "2020-01-03" }]));

  const now = Date.parse("2030-01-01T00:00:00.000Z");
  const gone = collect(rt.store, { now, dormantForMs: 30 * DAY });
  assert.ok(!gone.some((g) => g.identity === "Match_1"), "an open individual's relations are left alone");
});

test("a capability is kept: the only realization for a Concept is never touched by collection", async () => {
  const rt = fresh();
  const before = rt.store.get("Multiply")!.realizations.length;
  collect(rt.store, { now: Date.now() + 1000 * DAY, dormantForMs: 0 });
  assert.equal(rt.store.get("Multiply")!.realizations.length, before, "collection never removes realizations at all");
});
