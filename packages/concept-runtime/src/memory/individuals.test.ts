/**
 * memory-spec build step 3: minting, `Named`, and resolving a proper-name head to an
 * individual (design/memory-spec.md Part 3.2, Part 6, Part 8.3; reading-spec.md R18).
 *
 * Only the machinery is tested here, not the minting POLICY (when something earns an
 * identity) -- that is the next wave, and these tests mint by hand the way a future
 * `Believe` realization would, rather than by saying something to a runtime.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { createRuntime } from "../index.js";
import { findNamed, resolveNames } from "../runtime/individuals.js";
import { ConceptStore } from "../store/store.js";
import { load, save } from "../store/persist.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const withTemp = (fn: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-individuals-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/* ---------------- the allocator ---------------- */

test("mint allocates distinct ids and never collides with what is already there", () => {
  const store = new ConceptStore();
  assert.equal(store.mint("Greg"), "Greg_1");
  assert.equal(store.mint("Greg"), "Greg_2");
  // A base already sitting in the graph, minted by nobody, is never collided with, even
  // though the in-memory counter does not know about it until it actually gets in the way.
  store.seed({ identity: "Greg_3", relations: [], realizations: [] });
  const next = store.mint("Greg");
  assert.notEqual(next, "Greg_3");
  assert.equal(store.has(next), true);
});

test("mint allocates distinct ids across a restart", () =>
  withTemp((dir) => {
    const path = join(dir, "graph.json");
    const before = new ConceptStore();
    const first = before.mint("Greg");
    const second = before.mint("Greg");
    save(before, path);

    const after = new ConceptStore();
    load(after, path);
    const third = after.mint("Greg");
    assert.notEqual(third, first);
    assert.notEqual(third, second);
    assert.equal(third, "Greg_3");
  }));

/* ---------------- Mint, as a Concept ---------------- */

test("Mint via evaluation creates a unit with stamped IsA/Named sourced from the cause", async () => {
  const runtime = createRuntime();
  runtime.trace.said(41); // stand in for a Said's stamp, the cause every belief points at.

  const minted = await runtime.evaluate(c("Mint", parse('"Greg"')));
  const identity = format(minted).replace(/\(\)$/, "");
  assert.equal(identity, "Greg_1");

  // Mint only allocates (memory-spec Part 3.2: "exactly as unprivileged as Cell"). Its
  // first relations are added the way any relation is, sourced from the same cause.
  runtime.store.addRelation(identity, parse("IsA(Person())"), undefined, runtime.trace.cause);
  runtime.store.addRelation(identity, parse('Named("Greg")'), undefined, runtime.trace.cause);

  const unit = runtime.store.get(identity)!;
  const isA = unit.relations.find((r) => format(r.claim) === "IsA(Person())");
  const named = unit.relations.find((r) => format(r.claim) === 'Named("Greg")');
  assert.equal(isA?.stamps?.[0]?.source, 41);
  assert.equal(named?.stamps?.[0]?.source, 41);
});

test("minting again for the same base gives a fresh identity, not a second unit for the first", async () => {
  const runtime = createRuntime();
  const a = format(await runtime.evaluate(c("Mint", parse('"Greg"'))));
  const b = format(await runtime.evaluate(c("Mint", parse('"Greg"'))));
  assert.notEqual(a, b);
  assert.equal(a, "Greg_1()");
  assert.equal(b, "Greg_2()");
});

/* ---------------- Named, and finding by it ---------------- */

test("two Gregs coexist, distinguished by what they hold rather than by identity", () => {
  const store = new ConceptStore();
  store.seed({
    identity: "Greg_1",
    relations: [{ claim: parse("IsA(Person())") }, { claim: parse('Named("Greg")') }, { claim: parse("CoworkerOf(Me())") }],
    realizations: [],
  });
  store.seed({
    identity: "Greg_2",
    relations: [{ claim: parse("IsA(Person())") }, { claim: parse('Named("Greg")') }, { claim: parse("CousinOf(Me())") }],
    realizations: [],
  });
  assert.deepEqual(findNamed(store, "Greg").sort(), ["Greg_1", "Greg_2"]);
});

/* ---------------- resolving a mention ---------------- */

test("a mention resolves to the only individual holding that name", () => {
  const store = new ConceptStore();
  store.seed({ identity: "Greg_1", relations: [{ claim: parse('Named("Greg")') }], realizations: [] });
  const ambiguities: string[] = [];
  const { expression, resolved } = resolveNames(store, parse("Greg(Called())"), ambiguities);
  assert.equal(format(expression), "Greg(Called(), resolvedTo=Greg_1())");
  assert.deepEqual(resolved, [{ name: "Greg", to: "Greg_1" }]);
  assert.deepEqual(ambiguities, []);
});

test("two matches is surfaced as an ambiguity and nothing is guessed", () => {
  const store = new ConceptStore();
  store.seed({ identity: "Greg_1", relations: [{ claim: parse('Named("Greg")') }], realizations: [] });
  store.seed({ identity: "Greg_2", relations: [{ claim: parse('Named("Greg")') }], realizations: [] });
  const ambiguities: string[] = [];
  const { expression, resolved } = resolveNames(store, parse("Greg(Called())"), ambiguities);
  // Left as said: the head is untouched, no resolvedTo added, nothing picked.
  assert.equal(format(expression), "Greg(Called())");
  assert.deepEqual(resolved, []);
  assert.equal(ambiguities.length, 1);
  assert.match(ambiguities[0], /Greg.*matched 2/);
});

test("an explicit description disambiguates the two Gregs", () => {
  const store = new ConceptStore();
  store.seed({
    identity: "Greg_1",
    relations: [{ claim: parse('Named("Greg")') }, { claim: parse("CoworkerOf(Me())") }],
    realizations: [],
  });
  store.seed({
    identity: "Greg_2",
    relations: [{ claim: parse('Named("Greg")') }, { claim: parse("CousinOf(Me())") }],
    realizations: [],
  });
  // The message itself carries the description: "my coworker Greg". Nothing in the
  // resolver has to guess, because the ambiguity is broken by what is asked for, not by
  // preference (concept-spec Part 9.4, memory-spec Part 8.2 step 1) -- here, simply
  // finding the one match whose relations include what was said about him.
  const candidates = ["Greg_1", "Greg_2"].filter((id) =>
    store.get(id)!.relations.some((r) => format(r.claim) === "CoworkerOf(Me())"),
  );
  assert.deepEqual(candidates, ["Greg_1"]);
});

test("a name nobody holds is left as said, not minted", () => {
  const store = new ConceptStore();
  const ambiguities: string[] = [];
  const { expression, resolved } = resolveNames(store, parse("Greg(Called())"), ambiguities);
  assert.equal(format(expression), "Greg(Called())");
  assert.deepEqual(resolved, []);
  assert.equal(store.has("Greg_1"), false);
});

/* ---------------- reading never mints ---------------- */

test("a question about Greg mints nothing", async () => {
  const runtime = createRuntime();
  runtime.store.seed({ identity: "Greg_1", relations: [{ claim: parse('Named("Greg")') }], realizations: [] });
  const before = runtime.store.size();
  const { expression } = resolveNames(runtime.store, parse("WhoIs(Greg())"), runtime.ambiguities);
  assert.equal(format(expression), "WhoIs(Greg(resolvedTo=Greg_1()))");
  assert.equal(runtime.store.size(), before);
});

/* ---------------- DistinctFrom, seeded but inert ---------------- */

test("DistinctFrom is seeded and symmetric, with no repair automation behind it", () => {
  const runtime = createRuntime();
  const unit = runtime.store.get("DistinctFrom");
  assert.ok(unit, "DistinctFrom should be seeded");
  assert.ok(unit!.relations.some((r) => format(r.claim) === "Symmetric()"));
  assert.equal(unit!.realizations.length, 0);
});
