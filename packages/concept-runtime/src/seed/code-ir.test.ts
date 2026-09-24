import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, declares, realization } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { ConceptStore } from "../store/store.js";
import { seed } from "./seed.js";

const store = new ConceptStore();
seed(store);
const run = async (e: string) => format(await new Runtime(store).evaluate(parse(e), c("Execution")));

test("the code IR runs: lambdas, lists, logic and expressions as data", async () => {
  assert.equal(await run("Reduce(List(1, 2, 3, 4), Lambda(List($a, $b), Add($a, $b)), 0)"), "10");
  assert.equal(await run("Map(List(1, 2, 3), Lambda(List($x), Multiply($x, 2)))"), "List(2, 4, 6)");
  assert.equal(await run("Filter(List(1, 5, 9), Lambda(List($x), GreaterThan($x, 3)))"), "List(5, 9)");
  assert.equal(await run("Call(Lambda(List($x, $y), Subtract($x, $y)), 10, 4)"), "6");
  assert.equal(await run("And(Equals(1, 1), Not(False()))"), "True()");
  assert.equal(await run("Head(Likes(Cats()))"), '"Likes"');
  assert.equal(await run("Arg(Likes(Cats()), 0)"), "Cats()");
  assert.equal(await run('MakeCall("Likes", List(Dogs()))'), "Likes(Dogs())");
});

test("a realization written in the IR reads the graph", async () => {
  store.seed(concept("Robin", { relations: ["IsA(Bird())"] }));
  store.seed(concept("Songbird", { relations: ["SubclassOf(Bird())"] }));
  store.seed(concept("Wren", { relations: ["SubclassOf(Songbird())"] }));
  store.seed(concept("Descendants", { realizations: [realization({ pattern: "Descendants($k)", context: "Execution()", evaluateArguments: false,
    body: parse('Concat(Subjects("IsA", $k), FlatMap(Subjects("SubclassOf", $k), Lambda(List($s), Concat(List($s), Descendants($s)))))') })] }));
  assert.equal(await run("Descendants(Bird())"), "List(Robin(), Songbird(), Wren())");
});

test("the words a message says are left alone when they are not logic", async () => {
  assert.equal(await run("Not(Tell(Me(), Time()))").then((r) => r.startsWith("Not(")), true);
});

test("a body declared Compile() compiles to one function and answers exactly as interpreted", async () => {
  const { compileRealization } = await import("../runtime/compile.js");
  const bodies = [
    "Reduce(List(1, 2, 3, 4), Lambda(List($a, $b), Add($a, $b)), 0)",
    "Map(List(1, 2, 3), Lambda(List($x), Multiply($x, 2)))",
    "Filter(List(1, 5, 9), Lambda(List($x), GreaterThan($x, 3)))",
    "If(And(Equals(1, 1), Not(False())), Concat(List(1), List(2, 3)), 0)",
    'MakeCall(Head(Likes(Cats())), List(Arg(Likes(Cats()), 0)))',
    "Let($n, Add(2, 3), Multiply($n, $n))",
    'Length(Subjects("IsA", Bird()))',
    "Unique(List(1, 2, 1, Cats(), Cats()))",
    'Filter(List("User_1", "Game"), Lambda(List($x), Matches($x, "_[0-9]+$")))',
  ];
  for (const [i, body] of bodies.entries()) {
    const interpreted = `Interpreted${i}`;
    const fast = `Fast${i}`;
    store.seed(concept(interpreted, { realizations: [realization({ pattern: `${interpreted}()`, context: "Execution()", body: parse(body) })] }));
    store.seed(concept(fast, { realizations: [realization({ pattern: `${fast}()`, context: "Execution()", properties: ["Compile()"], body: parse(body) })] }));
    assert.ok(compileRealization(store, store.get(fast)!.realizations[0]), `compiles: ${body}`);
    assert.equal(await run(`${fast}()`), await run(`${interpreted}()`), body);
  }
});

test("a compiled body still reaches Concepts it has no template for, and is not traced step by step", async () => {
  store.seed(concept("Twice", { realizations: [realization({ pattern: "Twice($x)", context: "Execution()", properties: ["Compile()"], body: parse("Map(List($x, $x), Lambda(List($y), Double($y)))") })] }));
  const rt = new Runtime(store);
  assert.equal(format(await rt.evaluate(parse("Twice(4)"), c("Execution"))), "List(8, 8)");
  const heads = rt.trace.all().map((e) => e.concept);
  assert.ok(heads.includes("Double"), "the Concept it calls is still evaluated as one");
  assert.ok(!heads.includes("Map") && !heads.includes("Lambda"), "the compiled parts are not");
});

test("Members is written in the IR and compiled, and hands on values without evaluating them again", async () => {
  const members = store.get("Members")!.realizations.find((r) => !r.retired)!;
  assert.ok(declares(members, "Compile"));
  const rt = new Runtime(store);
  assert.equal(format(await rt.evaluate(parse("Members(Birds())"), c("Execution"))), "List(Robin(), Songbird(), Wren())");
  const heads = rt.trace.all().map((e) => e.concept);
  assert.ok(!heads.includes("Robin") && !heads.includes("List"), "a member found is a value, not re-selected");
});
