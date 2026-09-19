import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { learn } from "./learn.js";
import { nearby } from "./teacher.js";

const EXEC = c("Execution");
const fresh = () => {
  const store = new ConceptStore();
  seed(store);
  return new Runtime(store);
};

test("a declaration saves relations into the graph", async () => {
  const rt = fresh();
  const out = await rt.evaluate(
    parse('Concept(identity="Chess", relations=List(IsA(BoardGame()), MinimumNumberOfPlayers(2)), realizations=List())'),
    EXEC,
  );
  assert.match(format(out), /^Saved\(Chess\(\)/);
  assert.equal(rt.store.get("Chess")!.relations.length, 2);
});

test("a malformed declaration is rejected rather than half-saved", async () => {
  const rt = fresh();
  const out = await rt.evaluate(
    parse('Concept(identity="lowercase", relations=List(), realizations=List())'),
    EXEC,
  );
  assert.match(format(out), /InvalidDeclaration/);
  assert.ok(!rt.store.has("lowercase"));
});

test("learning closes a gap from the graph before reaching for a model", async () => {
  const rt = fresh();
  // Multiplication is a known synonym cluster member; nothing should need teaching.
  rt.store.seed(concept("Multiplication", { relations: ["SynonymOf(Multiply())"] }));
  const out = await learn(rt, "multiply", parse("Multiplication(6, 7)"), EXEC, { teacher: false });
  assert.ok(out.steps.some((s) => s.how === "graph"), JSON.stringify(out.steps));
});

test("an unclosable gap stays a residual rather than being fabricated", async () => {
  const rt = fresh();
  const out = await learn(rt, "x", parse("Frobnicate(3)"), EXEC, { teacher: false });
  assert.equal(format(out.result!), "Frobnicate(3)");
  assert.ok(out.remaining.some((g) => g.identity === "Frobnicate"));
});

test("the loop is bounded when nothing new can be learned", async () => {
  const rt = fresh();
  const out = await learn(rt, "x", parse("Frobnicate(3)"), EXEC, { teacher: false, maxPasses: 5 });
  assert.equal(out.passes, 1, "it should stop as soon as a pass learns nothing");
});

test("the Teacher is offered what already exists nearby, not the whole library", () => {
  const rt = fresh();
  const text = nearby(rt.store, "Times");
  assert.match(text, /Multiply/);
});

test("a declaration saves realizations, not just relations", async () => {
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="Triple", relations=List(), realizations=List(Realization(pattern=Triple($x), body=Multiply($x, 3))))'),
    EXEC,
  );
  assert.equal(format(await rt.evaluate(parse("Triple(7)"), EXEC)), "21");
});

test("a taught body may not name a Concept the graph has never heard of", async () => {
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="Bogus", relations=List(), realizations=List(Realization(pattern=Bogus($x), body=Frobnicate($x))))'),
    EXEC,
  );
  // Rejected rather than saved: a body that names nothing real is not behaviour.
  assert.equal(rt.store.get("Bogus")!.realizations.length, 0);
});

test("a taught body may not be code", async () => {
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="Sneaky", relations=List(), realizations=List(Realization(pattern=Sneaky(), body=Code(source="() => 1"))))'),
    EXEC,
  );
  assert.equal(rt.store.get("Sneaky")!.realizations.length, 0);
});

test("missing behaviour is a learning target, not a normal outcome", async () => {
  const rt = fresh();
  // Format exists and realizes, but nothing handles this shape. Its arguments are fine,
  // so Format itself is the innermost thing that could not be worked out.
  await rt.evaluate(parse('Format(42, "x")'), EXEC);
  const { collectGaps } = await import("../runtime/turn.js");
  const gaps = collectGaps(rt, undefined);
  assert.ok(gaps.some((g) => g.identity === "Format" && g.kind === "inert"));
});

test("a residual caused by a residual argument is not a gap of its own", async () => {
  const rt = fresh();
  // Wibble is unknown, so Format goes residual only because its argument did. Blaming
  // Format sent the Teacher after a Concept that was working perfectly well.
  await rt.evaluate(parse('Format(Wibble(), "x")'), EXEC);
  const { collectGaps } = await import("../runtime/turn.js");
  const gaps = collectGaps(rt, undefined);
  assert.ok(gaps.some((g) => g.identity === "Wibble" && g.kind === "unknown"));
  assert.ok(!gaps.some((g) => g.identity === "Format"));
});

test("a marker is meant to stay residual, so it is never taught behaviour", async () => {
  const rt = fresh();
  await rt.evaluate(parse('Ref("the math")'), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  const gaps = learnable(rt, collectGaps(rt, undefined));
  assert.ok(!gaps.some((g) => g.identity === "Ref"));
});

test("a taught body may not name the Concept it defines", async () => {
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="Loopy", relations=List(), realizations=List(Realization(pattern=Loopy($x), body=Loopy($x))))'),
    EXEC,
  );
  assert.equal(rt.store.get("Loopy")!.realizations.length, 0);
});

test("a record of named primitives is data, not missing behaviour", async () => {
  const rt = fresh();
  await rt.evaluate(parse('Time(hour=10, minute=36, spoken="10:36 AM")'), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  const gaps = learnable(rt, collectGaps(rt, undefined));
  assert.ok(!gaps.some((g) => g.identity === "Time"));
});

test("an anonymous unknown is a missing input, not missing behaviour", async () => {
  const rt = fresh();
  await rt.evaluate(parse("Multiply($_, $_)"), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  const gaps = learnable(rt, collectGaps(rt, undefined));
  assert.ok(!gaps.some((g) => g.identity === "Multiply"));
});

test("a taught body must reduce to something that can actually run", async () => {
  const rt = fresh();
  // Chooser is realized as Picker, and Picker realizes nothing. Asked to realize Choose,
  // the Teacher wrote Select, then realized Select as Choose: a rename in both directions
  // and behaviour in neither.
  await rt.evaluate(
    parse('Concept(identity="Picker", relations=List(IsA(Decision())), realizations=List())'),
    EXEC,
  );
  await rt.evaluate(
    parse('Concept(identity="Chooser", relations=List(), realizations=List(Realization(pattern=Chooser($a), body=Picker($a))))'),
    EXEC,
  );
  assert.equal(rt.store.get("Chooser")!.realizations.length, 0);
});

test("a body naming an inert Concept says which one to learn first", async () => {
  const rt = fresh();
  await rt.evaluate(parse('Concept(identity="Picker", relations=List(), realizations=List())'), EXEC);
  const saved = await rt.evaluate(
    parse('Concept(identity="Chooser", relations=List(), realizations=List(Realization(pattern=Chooser($a), body=Picker($a))))'),
    EXEC,
  );
  assert.match(format(saved), /NeedsFirst\(List\(Picker\(\)\)\)/);
});

test("a body composing Concepts that work is still saved", async () => {
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="Quadruple", relations=List(), realizations=List(Realization(pattern=Quadruple($x), body=Multiply($x, 4))))'),
    EXEC,
  );
  assert.equal(format(await rt.evaluate(parse("Quadruple(5)"), EXEC)), "20");
});

test("a Concept with no realization at all still wants behaviour when asked to do something", async () => {
  const rt = fresh();
  rt.store.seed({ identity: "Weigh", relations: [], realizations: [] });
  await rt.evaluate(parse("Weigh(1, 2)"), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  const gaps = learnable(rt, collectGaps(rt, undefined));
  assert.ok(gaps.some((g) => g.identity === "Weigh"));
});

test("a topic becomes an identity", async () => {
  const { identityFor } = await import("./study.js");
  assert.equal(identityFor("money"), "Money");
  assert.equal(identityFor("medium of exchange"), "MediumOfExchange");
  assert.equal(identityFor("return value"), "ReturnValue");
  assert.equal(identityFor("garbage collection"), "GarbageCollection");
  // Already an identity: left alone rather than mangled to Isa.
  assert.equal(identityFor("IsA"), "IsA");
});

test("the frontier is what a Concept names but does not explain", async () => {
  const { frontierFrom } = await import("./study.js");
  const found = frontierFrom([
    parse("IsA(MediumOfExchange())"),
    parse("Symmetric()"),
    parse("MinimumNumberOfPlayers(2)"),
    parse("InverseOf(Credit())"),
  ]);
  // Objects, not predicates: IsA and InverseOf are how it is said, not what it names.
  assert.deepEqual(found.sort(), ["Credit", "MediumOfExchange"]);
});

test("studying without a Teacher still crawls what is already known", async () => {
  const { study } = await import("./study.js");
  const rt = fresh();
  // Tomorrow is seeded and names Date, Deictic and Yesterday in its relations.
  const result = await study(rt, ["tomorrow"], { research: false, teacher: false });
  assert.equal(result.taught, 0);
  assert.ok(result.steps.some((s) => s.identity === "Tomorrow" && s.how === "known"));
  // The crawl followed the relations rather than stopping at the topic.
  assert.ok(result.visited > 1);
});

test("a curriculum track puts foundations before what leans on them", async () => {
  const { curriculum } = await import("./curriculum.js");
  const all = curriculum("all");
  assert.ok(all.indexOf("thing") < all.indexOf("money"));
  assert.ok(all.indexOf("value") < all.indexOf("debt"));
  assert.ok(curriculum("economics").includes("medium of exchange"));
  assert.throws(() => curriculum("nonsense"), /Unknown track/);
});
