import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
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

test("a declaration missing realizations still saves its relations", async () => {
  const rt = fresh();
  // What salvage leaves when a Teacher runs out of tokens mid-list.
  const saved = await rt.evaluate(
    parse('Concept(identity="Cash", relations=List(IsA(Money())))'),
    EXEC,
  );
  assert.match(format(saved), /Saved\(Cash\(\)/);
  assert.equal(rt.store.get("Cash")!.relations.length, 1);
});

test("a declaration with nothing but an identity is still a Concept", async () => {
  const rt = fresh();
  await rt.evaluate(parse('Concept(identity="Thing")'), EXEC);
  assert.ok(rt.store.has("Thing"));
});

test("Text joins its parts, so a taught body can lay out syntax", async () => {
  const rt = fresh();
  assert.equal(
    format(await rt.evaluate(parse('Text("if (", "x > 1", ") { ", "go()", " }")'), EXEC)),
    '"if (x > 1) { go() }"',
  );
});

test("expressing in a context is offered for anything in the graph", async () => {
  const { study } = await import("./study.js");
  const rt = fresh();
  rt.store.seed(concept("Chess", { relations: [] }));
  // Rust: If already knows how to be written in JavaScript (packs/javascript.ncon).
  const result = await study(rt, ["if", "chess"], { as: "Rust", teacher: false });
  // Requiring existing behaviour was wrong: Function, Write and Says do nothing in any
  // context and are exactly the constructs a language needs a rendering for. Whether
  // something HAS a sensible rendering is the Teacher's judgement, and CONTEXT_SYSTEM
  // rule 7 tells it to answer realizations=List() when the answer is no.
  assert.ok(result.steps.some((s) => s.identity === "If" && s.detail === "no Teacher"));
  assert.ok(result.steps.some((s) => s.identity === "Chess" && s.detail === "no Teacher"));
  // Something absent from the graph entirely is still not the job.
  const missing = await study(rt, ["nonesuch"], { as: "Rust", teacher: false });
  assert.ok(missing.steps.some((s) => /not in the graph/.test(s.detail)));
});

test("a Concept that already speaks the context is left alone, and TypeScript is spoken as JavaScript", async () => {
  const { study } = await import("./study.js");
  const rt = fresh();
  await rt.evaluate(
    parse('Concept(identity="If", realizations=List(Realization(pattern=If($c, $t, $e), context=JavaScript(), body=Text("x"))))'),
    EXEC,
  );
  const result = await study(rt, ["if"], { as: "TypeScript", teacher: false });
  assert.ok(result.steps.some((s) => s.identity === "If" && s.how === "known"));
});

test("a declaration cannot flood the graph with free association", async () => {
  const rt = fresh();
  // What a runaway Teacher produces: Quantity once came back with two hundred relations,
  // ending "Jerk Snap Crackle Pop". Every one would become a topic the crawl studies.
  const many = Array.from({ length: 40 }, (_, i) => `IsA(Thing${i}())`).join(", ");
  const saved = await rt.evaluate(
    parse(`Concept(identity="Flood", relations=List(${many}))`),
    EXEC,
  );
  assert.equal(rt.store.get("Flood")!.relations.length, 12);
  assert.match(format(saved), /TooMany\(28\)/);
});

test("a reasonable declaration is not capped", async () => {
  const rt = fresh();
  const saved = await rt.evaluate(
    parse('Concept(identity="Modest", relations=List(IsA(Category()), SynonymOf(Thing())))'),
    EXEC,
  );
  assert.equal(rt.store.get("Modest")!.relations.length, 2);
  assert.ok(!format(saved).includes("TooMany"));
});

test("a Teacher that times out costs one topic, not the run", async () => {
  const { study } = await import("./study.js");
  const rt = fresh();
  // An endpoint that is not there fails the same way a timeout does.
  const result = await study(rt, ["chess", "backgammon"], {
    research: false,
    endpoint: "http://127.0.0.1:9",
    timeoutMs: 200,
  });
  assert.equal(result.visited, 2);
  assert.ok(result.steps.every((s) => s.how === "failed"));
});

test("repeating one relation does not spend the cap on it", async () => {
  const rt = fresh();
  // A Teacher that loses the thread repeats itself; "hi" came back with the same relation
  // six times. Counted against the cap, the copies crowd out the real claims.
  const repeated = Array(20).fill("IsA(Greeting())").join(", ");
  const rest = Array.from({ length: 5 }, (_, i) => `SynonymOf(Word${i}())`).join(", ");
  await rt.evaluate(parse(`Concept(identity="Hi", relations=List(${repeated}, ${rest}))`), EXEC);
  const stored = rt.store.get("Hi")!.relations.map((r) => format(r.claim));
  assert.equal(stored.filter((r) => r === "IsA(Greeting())").length, 1);
  assert.equal(stored.length, 6, "one greeting plus five distinct claims, none crowded out");
});

test("a turn that learns nothing reads the message once", async () => {
  const { turn } = await import("../runtime/turn.js");
  const rt = fresh();
  // No Teacher and no network: learn() returns no steps, so Part 8.3's loop has nothing
  // new to read against and must not spend a second model call proving it.
  const out = await turn(rt, "", c("Execution"), {
    learn: true,
    speak: false,
    teacher: false,
    research: false,
  });
  assert.equal(out.rereads, 0);
});

test("a Result wrapper is what the system produces, never something to learn", async () => {
  const rt = fresh();
  // Describes, Answer and Saved take arguments and realize nothing, which is the exact
  // shape of missing behaviour. Teaching one a realization would make the wrapper evaluate
  // away and destroy the answer it carries.
  await rt.evaluate(parse('Describes(Thing(), List(IsA(Stuff())))'), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  const gaps = learnable(rt, collectGaps(rt, undefined));
  assert.ok(!gaps.some((g) => g.identity === "Describes"));
});

test("learning is on unless a caller turns it off", async () => {
  const { turn } = await import("../runtime/turn.js");
  const rt = fresh();
  // The default lives in turn(), not in each entry point. The CLI had it off and the
  // studio had it on, so the same question answered differently depending on where it
  // was asked.
  const off = await turn(rt, "", c("Execution"), { learn: false, speak: false });
  assert.equal(off.learned.length, 0);
  const on = await turn(rt, "", c("Execution"), { speak: false, teacher: false, research: false });
  assert.equal(on.rereads, 0, "nothing to learn, so nothing is re-read");
});

test("a synonym forward may not point at something that only forwards back", async () => {
  const { forwardSynonym } = await import("../seed/seed.js");
  const rt = fresh();
  rt.store.seed(concept("Glorp", { relations: [] }));
  rt.store.seed(concept("Florp", { relations: [] }));

  // Nothing can do anything yet, so neither may lend behaviour to the other.
  assert.equal(forwardSynonym(rt.store, "Florp", "Glorp"), false);
  assert.equal(rt.store.get("Florp")!.realizations.length, 0);

  // Give Hello something real, and the forward becomes worth making.
  rt.store.addRealization("Glorp", realization({ pattern: "Glorp()", body: parse('"hi there"') }));
  assert.equal(forwardSynonym(rt.store, "Florp", "Glorp"), true);
  assert.equal(format(await rt.evaluate(parse("Florp()"), EXEC)), '"hi there"');

  // And the arrow back is refused, because Florp has nothing of its own -- SynonymOf is
  // symmetric, so both arrows get derived from one assertion if nothing stops them.
  assert.equal(forwardSynonym(rt.store, "Glorp", "Florp"), false);
});

test("a Concept never forwards to itself", async () => {
  const { forwardSynonym } = await import("../seed/seed.js");
  const rt = fresh();
  assert.equal(forwardSynonym(rt.store, "Multiply", "Multiply"), false);
});

test("an answer that never ran is never spoken as one", async () => {
  const { turn } = await import("../runtime/turn.js");
  const rt = fresh();
  // Nothing here evaluates: Wibble is unknown, so Multiply is residual because its
  // argument is. Innermost attribution blames Wibble, and if Wibble were exempt from
  // learning there would be no gap at all -- which is how an unevaluated comparison got
  // handed to the model, and answered from the model's own knowledge.
  const out = await turn(rt, "", c("Execution"), {
    learn: false,
    speak: false,
    teacher: false,
    research: false,
  });
  assert.equal(out.rereads, 0);

  const { holdsResidual } = await import("../runtime/turn.js");
  rt.reset();
  const result = await rt.evaluate(parse("Multiply(Wibble(), 2)"), EXEC);
  assert.ok(holdsResidual(rt, result), "the result still contains what never ran");
});

test("a computed answer is not mistaken for an uncomputed one", async () => {
  const { holdsResidual } = await import("../runtime/turn.js");
  const rt = fresh();
  const result = await rt.evaluate(parse("Multiply(6, 7)"), EXEC);
  assert.equal(format(result), "42");
  assert.ok(!holdsResidual(rt, result));
});

test("a modifier is structure, not behaviour waiting to be taught", async () => {
  const rt = fresh();
  // "dont tell me the time, tell me the date" answered "I do not know how to Not".
  await rt.evaluate(parse("Not(Time())"), EXEC);
  const { collectGaps, learnable } = await import("../runtime/turn.js");
  assert.ok(!learnable(rt, collectGaps(rt, undefined)).some((g) => g.identity === "Not"));
});
