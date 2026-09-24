import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { c, format } from "../../concept/expression.js";
import { load, save, verifyRoundTrip } from "../../store/persist.js";
import { Relations } from "../../store/relations.js";
import { ConceptStore } from "../../store/store.js";
import { seed } from "../seed.js";
import { build } from "./build.js";
import { ground, groundAll, type Layer } from "./layer.js";

// Tests run from dist; the fixtures stay in src.
const FIXTURES = fileURLToPath(new URL("../../../src/seed/grounding/fixtures/", import.meta.url));
const FILES = { ngsl: "ngsl.csv", wordnet: "wordnet.xml", conceptnet: "conceptnet.csv" };

const withLayers = async (fn: (dir: string) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-ground-"));
  try {
    await build(FIXTURES, dir, FILES);
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const layer = (dir: string, name: string): Layer => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const claimsOf = (store: ConceptStore, id: string) => store.get(id)?.relations.map((r) => format(r.claim)) ?? [];

test("each source is its own layer file, carrying its own license", async () => {
  await withLayers((dir) => {
    assert.deepEqual(readdirSync(dir).sort(), ["conceptnet.json", "ngsl.json", "oewn.json"]);
    assert.equal(layer(dir, "ngsl").license, "CC BY-SA 4.0");
    assert.equal(layer(dir, "conceptnet").license, "CC BY-SA 4.0");
    // Read from the dump's own Lexicon element, not assumed.
    assert.equal(layer(dir, "oewn").license, "https://creativecommons.org/licenses/by/4.0");
    assert.equal(layer(dir, "oewn").version, "2024");
    // The CC BY layer holds nothing from the share-alike ones.
    const oewn = JSON.stringify(layer(dir, "oewn").units);
    assert.ok(!oewn.includes("Named(") && !oewn.includes("UsedFor("));
  });
});

test("WordNet gives the top sense only, never synonymy, and CILI as a relation", async () => {
  await withLayers((dir) => {
    const dog = layer(dir, "oewn").units.Dog;
    const claims = dog.map((r) => (typeof r === "string" ? r : r.claim));
    assert.ok(claims.includes("IsA(Canine())"));
    // dog's second noun sense (frump) and its verb sense (chase) give no parent.
    assert.ok(!claims.includes("IsA(UnpleasantWoman())"));
    assert.ok(!claims.includes("IsA(Follow())"));
    assert.ok(claims.includes('SameAs(Cili("i46360"))'));
    // "domestic dog" shares the synset, and is still not a synonym.
    assert.ok(!JSON.stringify(layer(dir, "oewn").units).includes("SynonymOf"));
    // Part of speech from every entry, scoped to words.
    assert.deepEqual(
      dog.filter((r) => typeof r !== "string"),
      [
        { claim: "PartOfSpeech(Noun())", context: "Lexical()" },
        { claim: "PartOfSpeech(Verb())", context: "Lexical()" },
      ],
    );
    // OEWN's "in" is a proposed CILI entry, not an id.
    assert.ok(!JSON.stringify(layer(dir, "oewn").units.Money).includes("Cili"));
  });
});

test("part and whole, and antonymy, are stored once", async () => {
  await withLayers((dir) => {
    const units = layer(dir, "oewn").units;
    assert.ok(units.Wheel.includes("PartOf(Car())"));
    assert.ok(!units.Car.includes("HasPart(Wheel())"));
    assert.ok(units.Hot.includes("AntonymOf(Cold())"));
    assert.ok(!(units.Cold ?? []).includes("AntonymOf(Hot())"));

    const store = new ConceptStore();
    seed(store);
    groundAll(store, dir);
    // The inverse and the symmetric reading are derived, not written.
    const relations = new Relations(store);
    assert.equal(relations.truth("Car", "HasPart", c("Wheel")), "true");
    assert.equal(relations.truth("Cold", "AntonymOf", c("Hot")), "true");
  });
});

test("ConceptNet gives only the functional relations, one-word objects, core subjects", async () => {
  await withLayers((dir) => {
    assert.deepEqual(layer(dir, "conceptnet").units, {
      Knife: ["UsedFor(Cut())"],
      Money: ["UsedFor(Buy())"],
      Dog: ["CapableOf(Bark())"],
      Hot: ["Causes(Sweat())"],
    });
  });
});

test("every imported relation is sourced from its layer's import stamp", async () => {
  await withLayers((dir) => {
    const store = new ConceptStore();
    seed(store);
    const reports = groundAll(store, dir);
    for (const r of reports) {
      const origin = store.findStamp(r.importSeq)!;
      assert.equal(origin.identity, r.source);
      assert.equal(format(origin.relation.claim).startsWith("Imported("), true);
    }
    const bySource = new Map(reports.map((r) => [r.importSeq, r.source]));
    const from = (id: string, claim: string) =>
      bySource.get(store.get(id)!.relations.find((r) => format(r.claim) === claim)!.stamps![0].source!);
    assert.equal(from("Dog", "IsA(Canine())"), "OpenEnglishWordNet");
    assert.equal(from("Dog", "CapableOf(Bark())"), "ConceptNet");
    assert.equal(from("Dog", 'Named("dog")'), "Ngsl");
    // A share-alike layer is separable: its relations are exactly those sourced from it.
    const ngsl = reports.find((r) => r.source === "Ngsl")!;
    const sourced = store.all().flatMap((u) => u.relations).filter((r) => r.stamps?.some((s) => s.source === ngsl.importSeq));
    assert.equal(sourced.length, ngsl.added);
  });
});

test("an IsA landing on a Concept with realizations is withheld and reported", async () => {
  await withLayers((dir) => {
    const store = new ConceptStore();
    seed(store);
    const before = store.get("Day")!.realizations.length;
    assert.ok(before > 0);
    const oewn = ground(store, layer(dir, "oewn"));
    assert.deepEqual(oewn.withheld, [{ identity: "Day", claim: "IsA(TimePeriod())", realizations: before }]);
    assert.ok(!claimsOf(store, "Day").includes("IsA(TimePeriod())"));
    // What cannot reorder selection still lands, additively.
    assert.ok(claimsOf(store, "Day").includes('SameAs(Cili("i117776"))'));
  });
});

test("grounding again adds no stamps, and the graph survives a round trip", async () => {
  await withLayers((dir) => {
    const store = new ConceptStore();
    seed(store);
    groundAll(store, dir);
    const stamps = () => store.all().flatMap((u) => u.relations).reduce((n, r) => n + (r.stamps?.length ?? 0), 0);
    const count = stamps();
    const again = groundAll(store, dir);
    assert.equal(stamps(), count);
    assert.ok(again.every((r) => r.added === 0));
    seed(store);
    assert.equal(stamps(), count);

    assert.deepEqual(verifyRoundTrip(store), []);
    const path = join(dir, "out", "graph.json");
    save(store, path);
    const back = new ConceptStore();
    load(back, path);
    seed(back);
    assert.deepEqual(back.get("Dog"), { ...store.get("Dog")!, updatedAt: back.get("Dog")!.updatedAt });
    assert.ok(groundAll(back, dir).every((r) => r.added === 0));
  });
});
