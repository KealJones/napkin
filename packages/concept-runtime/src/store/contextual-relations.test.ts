import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, relation } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { Relations } from "./relations.js";
import { ConceptStore } from "./store.js";
import { load, save } from "./persist.js";

/** Moment is a stretch of time and also a band, and both are true. */
const polysemous = (): ConceptStore => {
  const store = new ConceptStore();
  seed(store);
  store.seed(
    concept("Moment", {
      relations: [
        relation("IsA(Instant())", "Time()"),
        relation("SynonymOf(Instant())", "Time()"),
        relation("IsA(MusicSingle())", "Music()"),
        relation("IsA(Word())"),
      ],
    }),
  );
  return store;
};

test("asking without a context sees every sense, which is what it always did", () => {
  const rel = new Relations(polysemous());
  const all = rel.of("Moment").map((t) => format(t.expr));
  assert.ok(all.includes("IsA(Instant())"));
  assert.ok(all.includes("IsA(MusicSingle())"));
  assert.ok(all.includes("IsA(Word())"));
});

test("asking in a context sees that sense, and the claims that hold anywhere", () => {
  const rel = new Relations(polysemous());
  const musical = rel.of("Moment", { context: c("Music") }).map((t) => format(t.expr));
  assert.ok(musical.includes("IsA(MusicSingle())"));
  assert.ok(musical.includes("IsA(Word())"), "a contextless claim holds everywhere");
  assert.ok(!musical.includes("IsA(Instant())"), "the wrong sense is not reported");
});

test("truth is three-valued per context, not globally", () => {
  const rel = new Relations(polysemous());
  assert.equal(rel.truth("Moment", "IsA", c("MusicSingle"), c("Music")), "true");
  // Not false — the graph has no claim that a moment is a single when talking about time.
  assert.equal(rel.truth("Moment", "IsA", c("MusicSingle"), c("Time")), "unknown");
});

test("a derived relation inherits the context of the claim it came from", () => {
  const store = polysemous();
  const rel = new Relations(store);
  // SynonymOf is symmetric, so Instant should find Moment -- but only under Time().
  assert.ok(rel.of("Instant", { context: c("Time") }).some((t) => format(t.expr) === "SynonymOf(Moment())"));
  assert.ok(!rel.of("Instant", { context: c("Music") }).some((t) => format(t.expr) === "SynonymOf(Moment())"));
});

test("the same claim in two contexts is two relations, not a duplicate", () => {
  const store = new ConceptStore();
  store.addRelation("Bat", parse("IsA(Animal())"), c("Zoology"));
  store.addRelation("Bat", parse("IsA(Animal())"), c("Cricket"));
  store.addRelation("Bat", parse("IsA(Animal())"), c("Zoology"));
  assert.equal(store.get("Bat")!.relations.length, 2, "same context twice is a duplicate");
});

test("describing reports every sense and says which is which", async () => {
  const rt = new Runtime(polysemous());
  const described = format(await rt.evaluate(parse("Relations(Moment())"), c("Describe")));
  // Nothing is dropped for want of a context, and nothing is stated as unconditional
  // when it is not: a music single is not a stretch of time.
  assert.match(described, /In\(IsA\(MusicSingle\(\)\), Music\(\)\)/);
  assert.match(described, /In\(IsA\(Instant\(\)\), Time\(\)\)/);
  // SynonymOf stays out of a summary by its own Incidental default, context or not.
  assert.ok(!described.includes("SynonymOf"));
  assert.match(described, /IsA\(Word\(\)\)/);
});

test("a graph written before contexts existed still loads and means the same", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "cnocept-"));
  const path = join(dir, "graph.json");
  // The old shape: relations are bare strings.
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      units: [{ identity: "Dog", relations: ["IsA(Animal())"], realizations: [] }],
    }),
  );
  const store = new ConceptStore();
  load(store, path);
  assert.equal(format(store.get("Dog")!.relations[0]!.claim), "IsA(Animal())");
  assert.equal(store.get("Dog")!.relations[0]!.context, undefined);

  // And a contextual one round-trips.
  store.addRelation("Bat", parse("IsA(Animal())"), c("Zoology"));
  save(store, path);
  const reloaded = new ConceptStore();
  load(reloaded, path);
  const bat = reloaded.get("Bat")!.relations[0]!;
  assert.equal(format(bat.claim), "IsA(Animal())");
  assert.equal(format(bat.context!), "Zoology()");
});

test("a declaration can say which sense a relation belongs to", async () => {
  const store = new ConceptStore();
  seed(store);
  const rt = new Runtime(store);
  await rt.evaluate(
    parse(
      'Concept(identity="Bat", relations=List(IsA(Animal()), In(IsA(SportsEquipment()), Cricket())))',
    ),
    c("Execution"),
  );
  const unit = store.get("Bat")!;
  const animal = unit.relations.find((r) => format(r.claim) === "IsA(Animal())")!;
  const equipment = unit.relations.find((r) => format(r.claim) === "IsA(SportsEquipment())")!;
  assert.equal(animal.context, undefined, "the everyday sense is unqualified");
  assert.equal(format(equipment.context!), "Cricket()");
  // In is where the claim holds, not part of what it says.
  assert.ok(!unit.relations.some((r) => format(r.claim).startsWith("In(")));
});
