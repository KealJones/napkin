import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
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
