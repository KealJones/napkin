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

test("core holds every Concept the host names, and names nothing it does not hold", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { heads } = await import("../concept/expression.js");
  const { BUILT_IN_PACKS } = await import("./ncon.js");
  const src = fileURLToPath(new URL("../../src/", import.meta.url));
  const packs = loadPacks([BUILT_IN_PACKS]);
  const core = new Set(packs.find((p) => p.name === "core")!.units.map((u) => u.identity));
  const anywhere = new Set(packs.flatMap((p) => p.units.map((u) => u.identity)));
  // The kernel: the evaluator, selection, the compiler, the store and the turn.
  const kernel = ["runtime/evaluator.ts", "runtime/select.ts", "runtime/compile.ts", "runtime/turn.ts", "store/store.ts", "store/relations.ts", "store/persist.ts", "concept/unit.ts", "concept/match.ts", "concept/expression.ts"];
  const named = new Set(kernel.flatMap((f) => [...readFileSync(src + f, "utf8").matchAll(/"([A-Z][A-Za-z0-9]*)"/g)].map((m) => m[1])));
  assert.deepEqual([...named].filter((h) => anywhere.has(h) && !core.has(h)), [], "a Concept the host names lives outside core");
  const held = packs.find((p) => p.name === "core")!.units.flatMap((u) => u.relations.flatMap((r) => [...heads(r.claim)]));
  assert.deepEqual([...new Set(held)].filter((h) => !core.has(h)), [], "core describes itself with Concepts it does not hold");
});

test("without a language pack a Compile() body is interpreted, and answers the same", async () => {
  const { BUILT_IN_PACKS } = await import("./ncon.js");
  const { Runtime } = await import("../runtime/evaluator.js");
  const { c } = await import("../concept/expression.js");
  const all = loadPacks([BUILT_IN_PACKS]);
  const answer = async (packs: typeof all) => {
    const store = new ConceptStore();
    seedPacks(store, packs);
    store.seed(concept("Robin", { relations: ["IsA(Bird())"] }));
    const rt = new Runtime(store);
    const out = format(await rt.evaluate(parse("Members(Birds())"), c("Execution")));
    return { out, traced: rt.trace.all().map((e) => e.concept) };
  };
  const compiled = await answer(all);
  const interpreted = await answer(all.filter((p) => p.name !== "javascript"));
  assert.equal(interpreted.out, compiled.out);
  assert.equal(compiled.out, "List(Robin())");
  assert.ok(interpreted.traced.includes("Filter") && !compiled.traced.includes("Filter"));
});

test("no pack holds JavaScript as text: every program is Concepts", async () => {
  const { BUILT_IN_PACKS } = await import("./ncon.js");
  const { isCall } = await import("../concept/expression.js");
  const text: string[] = [];
  let programs = 0;
  for (const pack of loadPacks([BUILT_IN_PACKS])) {
    for (const u of pack.units) {
      for (const r of u.realizations) {
        if (!isCall(r.body) || r.body.head !== "Code") continue;
        if (r.body.args.some((a) => a.name === "source")) text.push(`${pack.name}: ${u.identity}`);
        else programs += 1;
      }
    }
  }
  assert.deepEqual(text, []);
  assert.ok(programs > 200);
});
