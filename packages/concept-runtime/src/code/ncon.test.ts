import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { format, parse, parseMany } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { ConceptStore } from "../store/store.js";
import { formatPack, loadPacks, parsePack, seedPacks } from "./ncon.js";

const dir = (files: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), "ncon-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text);
  return d;
};

test("the IR syntax takes comments and raw strings", () => {
  assert.deepEqual(parseMany('// a comment\nA() // trailing\nB("x")'), [parse("A()"), parse('B("x")')]);
  assert.deepEqual(parse('Code(source="""line "one"\nline two""")'), parse('Code(source="line \\"one\\"\\nline two")'));
  assert.equal(format(parse('X("""a\nb""")')), 'X("a\\nb")');
});

test("a pack reads as the units it seeds, and writes back as the same units", () => {
  const text = `
    // A pack.
    Requires(Core())
    Concept(Game(), IsA(Category()), Relation(IsA(Sport()), context=Chess()))
    Concept(Double(),
      Realization(Double($x), context=Execution(), evaluateArguments=false, properties=List(Compile()), body=Multiply($x, 2)),
      Realization(Twice($x), body=Code(source="""(args) => {
        return 2;
      }""")))
  `;
  const pack = parsePack(text, "demo");
  assert.deepEqual(pack.requires, ["core"]);
  const game = pack.units.find((u) => u.identity === "Game")!;
  assert.equal(format(game.relations[1].claim), "IsA(Sport())");
  assert.equal(format(game.relations[1].context!), "Chess()");
  const double = pack.units.find((u) => u.identity === "Double")!.realizations[0];
  assert.equal(double.evaluateArguments, false);
  assert.equal(format(double.properties[0]), "Compile()");
  const again = parsePack(formatPack(pack.units, { requires: pack.requires }), "demo");
  assert.deepEqual(again, pack);
});

test("language rules load as realizations in the language's contexts", () => {
  const pack = parsePack(`Language(JavaScript())\nCompiled(Map($xs, $f), "L($xs)")\nFrom(JsIdentifier(text=$n), Variable($n))`, "js");
  const map = pack.units.find((u) => u.identity === "Map")!.realizations[0];
  assert.equal(format(map.context!), "Context(JavaScript(), Compiled())");
  assert.equal(format(map.body), 'Text("L(", $xs, ")")');
  const read = pack.units.find((u) => u.identity === "JsIdentifier")!.realizations[0];
  assert.equal(format(read.context!), "Context(JavaScript(), Reading())");
  assert.throws(() => parsePack(`Compiled(Map($xs), "x")`, "bad"), /needs a Language/);
});

test("packs load after what they require, and a missing requirement is named", () => {
  const d = dir({ "b.ncon": "Requires(A())\nConcept(B())", "a.ncon": "Concept(A())", "c.ncon": "Requires(B())" });
  assert.deepEqual(loadPacks([d]).map((p) => p.name), ["a", "b", "c"]);
  assert.throws(() => loadPacks([dir({ "x.ncon": "Requires(Nope())" })]), /x\.ncon: requires nope/);
  // A user's pack sits in a second directory and may require a built-in one.
  assert.deepEqual(loadPacks([d, dir({ "economic.ncon": "Requires(A())\nConcept(Money())" })]).map((p) => p.name), ["a", "b", "c", "economic"]);
});

test("reloading an edited pack takes back what it dropped and nothing anyone else added", () => {
  const store = new ConceptStore();
  seedPacks(store, [parsePack("Concept(Bird(), IsA(Animal()), CanFly(), Realization(Sing($x), body=1))", "birds")]);
  store.addRelation("Bird", parse("Lovely()"));
  store.addRealization("Bird", realization({ pattern: "Hop($x)", body: 2 }));
  const report = seedPacks(store, [parsePack("Concept(Bird(), IsA(Animal()))", "birds")]);
  assert.deepEqual([report.retired, report.removed], [1, 1]);
  const bird = store.get("Bird")!;
  assert.deepEqual(bird.relations.map((r) => format(r.claim)), ["IsA(Animal())", "Lovely()"]);
  assert.deepEqual(bird.realizations.filter((r) => !r.retired).map((r) => format(r.pattern)), ["Hop($x)"]);
});

test("a copy an older seed left is owned by the pack that seeds it now", () => {
  const store = new ConceptStore();
  store.seed(concept("Fish", { realizations: [realization({ pattern: "Swim()", body: 1 })] }), { authoritative: true });
  seedPacks(store, [parsePack("Concept(Fish(), Realization(Swim(), body=1))", "sea")]);
  seedPacks(store, [parsePack("Concept(Fish())", "sea")]);
  assert.ok(store.get("Fish")!.realizations.every((r) => r.retired));
});

test("a saved graph remembers which pack seeded what", async () => {
  const { save, load } = await import("../store/persist.js");
  const store = new ConceptStore();
  seedPacks(store, [parsePack("Concept(Bird(), IsA(Animal()), Realization(Sing($x), body=1))", "birds")]);
  const path = join(mkdtempSync(join(tmpdir(), "ncon-")), "graph.json");
  save(store, path);
  const loaded = new ConceptStore();
  load(loaded, path);
  const bird = loaded.get("Bird")!;
  assert.equal(bird.realizations[0].seededFrom, "birds");
  assert.equal(bird.relations[0].stamps![0].pack, "birds");
});
