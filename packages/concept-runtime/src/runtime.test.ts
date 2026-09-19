import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntime } from "./index.js";
import { ConceptStore } from "./store/store.js";
import { Relations } from "./store/relations.js";
import { concept, realization } from "./concept/unit.js";
import { parse, format, c } from "./concept/expression.js";
import { match, substitute } from "./concept/match.js";
import { seed } from "./seed/seed.js";
import { Runtime } from "./runtime/evaluator.js";

const EXEC = c("Execution");
const run = async (source: string) => {
  const rt = createRuntime();
  return format(await rt.evaluate(parse(source), EXEC));
};

/* ---------------- grammar ---------------- */

test("the grammar rejects what the spec says it has no syntax for", () => {
  assert.throws(() => parse("List([1, 2])"), /Unexpected/);
  assert.throws(() => parse("Object({a: 1})"), /Unexpected/);
  assert.throws(() => parse("Finish(this)"), /Bare identifier/);
  assert.throws(() => parse("multiply(2, 3)"), /must start with a capital letter/);
});

test("named arguments are the keyed-collection syntax", () => {
  const e = parse('Object(action="search", limit=10)');
  assert.equal(format(e), 'Object(action="search", limit=10)');
});

/* ---------------- matching ---------------- */

test("Rest binds any number of remaining arguments", () => {
  const b = new Map();
  assert.ok(match(parse("Sequence(Rest($steps))"), parse("Sequence(A(), B(), C())"), b));
  assert.equal(format(b.get("steps")!), "List(A(), B(), C())");
});

test("Rest after fixed arguments", () => {
  const b = new Map();
  assert.ok(match(parse("Qualify($thing, Rest($quals))"), parse("Qualify(X(), A(), B())"), b));
  assert.equal(format(b.get("thing")!), "X()");
  assert.equal(format(b.get("quals")!), "List(A(), B())");
});

test("$_ is anonymous: each occurrence is independent, $x is the same hole", () => {
  assert.ok(match(parse("Equals($_, $_)"), parse("Equals(A(), B())"), new Map()));
  assert.ok(!match(parse("Equals($x, $x)"), parse("Equals(A(), B())"), new Map()));
  assert.ok(match(parse("Equals($x, $x)"), parse("Equals(A(), A())"), new Map()));
});

test("a positional pattern accepts a named call", () => {
  const b = new Map();
  assert.ok(match(parse("Multiply($left, $right)"), parse("Multiply(left=2, right=3)"), b));
  assert.equal(b.get("left"), 2);
});

/* ---------------- residual ---------------- */

test("an absent Concept is a residual, not an error", async () => {
  assert.equal(await run("Wibble(Wobble())"), "Wibble(Wobble())");
});

test("a Concept with no applicable realization is a residual", async () => {
  assert.equal(await run("Aside(\"it was crazy.\")"), 'Aside("it was crazy.")');
});

test("invention is never fatal, so the learning path has something to collect", async () => {
  const rt = createRuntime();
  await rt.evaluate(parse("GreaterThan(Frobnicate(3), 2)"), EXEC);
  assert.ok(rt.trace.residuals().some((e) => e.concept === "Frobnicate"));
});

/* ---------------- evaluation ---------------- */

test("the first end-to-end turn computes something real", async () => {
  assert.equal(await run('What(Multiply(5, Number("three")))'), "Answer(15)");
});

test("source form is preserved, not normalized", async () => {
  const rt = createRuntime();
  const parsed = parse('Multiply(5, Number("three"))');
  assert.equal(format(parsed), 'Multiply(5, Number("three"))');
  assert.equal(format(await rt.evaluate(parsed, EXEC)), "15");
});

test("Sequence is variadic and returns its last step", async () => {
  assert.equal(await run("Sequence(Add(1, 1), Add(2, 2), Add(3, 3))"), "6");
});

test("Let binds for its body", async () => {
  assert.equal(await run("Let($x, Add(2, 3), Multiply($x, 10))"), "50");
});

test("If evaluates exactly one branch", async () => {
  assert.equal(await run("If(GreaterThan(3, 2), Add(1, 1), Frobnicate())"), "2");
});

test("failures are Concepts and Try recovers in Concepts", async () => {
  assert.equal(await run("Try(Get(NotACell()), Catch($e, Add(1, 1)))"), "2");
});

test("cells hold state without breaking single assignment", async () => {
  assert.equal(await run("Let($c, Cell(1), Sequence(Set($c, Add(Get($c), 41)), Get($c)))"), "42");
});

test("budgets stop runaway evaluation", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Loop", { realizations: [realization({ pattern: "Loop()", body: parse("Loop()") })] }));
  const rt = new Runtime(store, { maximumDepth: 20 });
  await assert.rejects(() => rt.evaluate(parse("Loop()"), EXEC), /BudgetExceeded|budget/i);
});

/* ---------------- context ---------------- */

test("a default is a lower-arity realization, and Today is deictic", async () => {
  const bare = await run("Date()");
  const today = await run("Date(Today())");
  assert.match(bare, /^Date\(year=\d+/);
  assert.equal(bare, today);
});

test("three nearby date questions stay distinct", () => {
  for (const s of ["What(Date(Today()))", "What(Date())", "What(Today())"]) {
    assert.equal(format(parse(s)), s);
  }
});

test("rendering wraps its subject rather than parameterising it", async () => {
  const out = await run('Format(Date(Today()), "MM-DD-YYYY")');
  // A rendering is a FIELD of the value, never a replacement for it. Returning the bare
  // string cost the next turn its arithmetic: the reference resolved to text, and the
  // Concept that had been a Date was gone.
  assert.match(out, /^Date\(/);
  assert.match(out, /spoken="\d{2}-\d{2}-\d{4}"/);
  assert.match(out, /year=\d{4}/);
});

test("a formatted time stays a time, so the next turn can still compute with it", async () => {
  const formatted = await run('Format(Time(hour=10, minute=15), "24 hour")');
  assert.match(formatted, /^Time\(/);
  assert.match(formatted, /spoken="10:15"/);
  // The whole point: arithmetic still works on the thing that was rendered.
  assert.match(await run('ShiftHours(Format(Time(hour=10, minute=15), "24 hour"), 5)'), /hour=15/);
});

test("clock arithmetic wraps around midnight", async () => {
  assert.match(await run("ShiftHours(Time(hour=22, minute=30), 5)"), /hour=3/);
  assert.match(await run("ShiftHours(Time(hour=1, minute=0), -3)"), /hour=22/);
});

test("a marker projects under Execution and survives under Describe", async () => {
  const rt = createRuntime();
  const e = parse('Correction(Field("weights"), Field("scores"))');
  assert.equal(format(await rt.evaluate(e, c("Execution"))), 'Field("scores")');
  // Describe suppresses Lossy, so the correction stays visible in its own description.
  assert.equal(format(await rt.evaluate(e, c("Describe"))), 'Correction(Field("weights"), Field("scores"))');
});

test("facets compose additively and are matched by subset", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(
    concept("Fetch", {
      realizations: [
        realization({ pattern: "Fetch()", context: "Execution()", body: parse("Http()") }),
        realization({ pattern: "Fetch()", context: "Walking(Dog())", body: parse("Activity()") }),
        realization({
          pattern: "Fetch()",
          context: "Context(Describe(), Walking(Dog()))",
          body: parse("Text_ThrowAndRetrieve()"),
        }),
      ],
    }),
  );
  const rt = new Runtime(store);
  assert.equal(format(await rt.evaluate(parse("Fetch()"), c("Execution"))), "Http()");
  assert.equal(format(await rt.evaluate(parse("Fetch()"), parse("Walking(Dog())"))), "Activity()");
  // Two facets beat one.
  assert.equal(
    format(await rt.evaluate(parse("Fetch()"), parse("Context(Describe(), Walking(Dog()))"))),
    "Text_ThrowAndRetrieve()",
  );
});

/* ---------------- selection ---------------- */

test("a local realization beats an inherited one", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Bird", { realizations: [realization({ pattern: "$x", context: "Describe()", body: parse("BirdSays()") })] }));
  store.seed(concept("Parakeet", { relations: ["IsA(Bird())"], realizations: [realization({ pattern: "Parakeet()", body: parse("Chirp()") })] }));
  const rt = new Runtime(store);
  assert.equal(format(await rt.evaluate(parse("Parakeet()"), c("Describe"))), "Chirp()");
});

test("a newer realization shadows one with the same pattern and context", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Greet", { realizations: [realization({ pattern: "Greet()", body: parse("Old()") })] }));
  store.addRealization("Greet", realization({ pattern: "Greet()", body: parse("New()") }));
  const rt = new Runtime(store);
  assert.equal(format(await rt.evaluate(parse("Greet()"))), "New()");
  // The older one is retained, not deleted.
  assert.equal(store.get("Greet")!.realizations.length, 2);
});

/* ---------------- relations ---------------- */

const related = () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("IsMarriedTo", { relations: ["Symmetric()"] }));
  store.seed(concept("IsOlderThan", { relations: ["Asymmetric()", "Transitive()", "InverseOf(IsYoungerThan())"] }));
  store.seed(concept("IsYoungerThan"));
  store.seed(concept("Keal", { relations: ["IsMarriedTo(Emmy())", "IsOlderThan(Greg())"] }));
  store.seed(concept("Emmy"));
  store.seed(concept("Greg", { relations: ["IsOlderThan(Sam())"] }));
  store.seed(concept("Sam"));
  return new Relations(store);
};

test("a symmetric relation is found from the end that does not store it", () => {
  const r = related();
  const emmy = r.of("Emmy").map((t) => format(t.expr));
  assert.ok(emmy.includes("IsMarriedTo(Keal())"), emmy.join(", "));
});

test("an inverse relation is derived, never materialized", () => {
  const r = related();
  assert.ok(r.of("Greg").some((t) => t.predicate === "IsYoungerThan"));
});

test("transitivity chains", () => {
  const r = related();
  assert.equal(r.truth("Keal", "IsOlderThan", c("Sam")), "true");
});

test("truth is three-valued over an open world", () => {
  const r = related();
  assert.equal(r.truth("Keal", "IsMarriedTo", c("Emmy")), "true");
  assert.equal(r.truth("Keal", "IsMarriedTo", c("Sam")), "unknown"); // absence is not falsity
  assert.equal(r.truth("Greg", "IsOlderThan", c("Keal")), "false"); // asymmetric contradiction
});

test("search returns the cluster, not the node", () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Multiplication", { relations: ["SynonymOf(Multiply())"] }));
  const cluster = new Relations(store).cluster("Times").map((x) => x.identity);
  assert.ok(cluster.includes("Multiply"), cluster.join(", "));
});

test("a synonym forwards computation without sharing context", async () => {
  assert.equal(await run("Times(6, 7)"), "42");
});

/* ---------------- seeding ---------------- */

test("seeding is idempotent and additive", () => {
  const store = new ConceptStore();
  const first = seed(store);
  const size = store.size();
  const second = seed(store);
  assert.ok(first.created > 0);
  assert.equal(second.created, 0);
  assert.equal(second.realizations, 0);
  assert.equal(store.size(), size);
});

test("seeding never overwrites what has since been learned", () => {
  const store = new ConceptStore();
  seed(store);
  store.addRealization("Multiply", realization({ pattern: "Multiply($a, $b)", body: parse("Learned()") }));
  const before = store.get("Multiply")!.realizations.length;
  seed(store);
  assert.equal(store.get("Multiply")!.realizations.length, before);
});

/* ---------------- the harness knows six identities ---------------- */

test("the evaluator names only structural Concepts, never semantic ones", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./runtime/evaluator.ts", import.meta.url).pathname.replace("/dist/", "/src/"), "utf8"),
  );
  for (const semantic of ["Multiply", "Describe", "Execution", "Today", "Correction", "Sequence"]) {
    assert.ok(!new RegExp(`"${semantic}"`).test(source), `evaluator must not name ${semantic}`);
  }
});

/* ---------------- description ---------------- */

test("relations describe a Concept that is not a computation", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("BoardGame"));
  store.seed(concept("Sport"));
  store.seed(
    concept("Chess", {
      relations: ["IsA(BoardGame())", "IsA(Sport())", "MinimumNumberOfPlayers(2)"],
    }),
  );
  const rt = new Runtime(store);
  const out = format(await rt.evaluate(parse("What(Chess())"), EXEC));
  assert.match(out, /IsA\(BoardGame\(\)\)/);
  assert.match(out, /MinimumNumberOfPlayers\(2\)/);
});

test("machinery relations are not led with in a summary", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Chess", { relations: ["IsA(BoardGame())", "SynonymOf(Draughts())"] }));
  const out = format(await new Runtime(store).evaluate(parse("What(Chess())"), EXEC));
  assert.match(out, /IsA\(BoardGame\(\)\)/);
  assert.ok(!/SynonymOf/.test(out), "SynonymOf is Incidental and should not lead");
});

test("describing expands a composition and stops at what it cannot run", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Double", { realizations: [realization({ pattern: "Double($x)", body: parse("Multiply($x, 2)") })] }));
  const rt = new Runtime(store);
  // Under Describe the arithmetic body is reached but Multiply is Execution-only, so the
  // composition survives as structure rather than collapsing to a number.
  const out = format(await rt.evaluate(parse("Double(21)"), c("Describe")));
  assert.equal(out, "Multiply(21, 2)");
});

test("a question wanting a value and one wanting a definition use the same node", async () => {
  const rt = createRuntime();
  assert.match(format(await rt.evaluate(parse("What(Today())"), EXEC)), /^Answer\(Date\(/);
  assert.match(format(await rt.evaluate(parse("What(Wibble())"), EXEC)), /NoDescription/);
});

test("the answer is placed in time by the Concepts asked for, not the English", async () => {
  const { tense } = await import("./ears/say.js");
  assert.equal(tense(parse("What(Time())")), "is");
  assert.equal(tense(parse("What(ShiftHours(Time(), 5))")), "will be");
  assert.equal(tense(parse("What(ShiftHours(Time(), -5))")), "was");
  assert.equal(tense(parse("What(HourBefore(Time()))")), "was");
  assert.equal(tense(parse("What(Tomorrow())")), "will be");
  assert.equal(tense(undefined), "is");
});
