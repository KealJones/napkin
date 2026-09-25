import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const store = new ConceptStore();
seed(store);
const run = async (e: string) => format(await new Runtime(store).evaluate(parse(e), c("Execution")));
const ask = async (text: string) =>
  String((await turn(new Runtime(store), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered);

test("a rule is found among the graph's own operations, and names the one it used", async () => {
  assert.equal(await run("Predict(List(2, 4, 8, 16))"), "Predicted(32, Multiply(Previous(), 2))");
  assert.equal(await run("Predict(List(10, 7, 4))"), "Predicted(1, Add(Previous(), -3))");
  assert.equal(await run("Predict(List(1, 1, 2, 3, 5, 8))"), "Predicted(13, Add(BeforePrevious(), Previous()))");
  assert.equal(await run("Predict(List(1, 4, 9, 16))"), "Predicted(25, RaiseToPower(Position(), 2))");
});

test("a hole in the middle is filled so that it leads on to the item after it", async () => {
  assert.equal(await run("Predict(List(3, What(), 9, 12))"), "Predicted(6, Add(Previous(), 3))");
});

test("no rule found stays as said", async () => {
  assert.equal(await run('Predict(List("a", "b", "c"))'), 'Predict(List("a", "b", "c"))');
});

test("asking what comes next reaches Predict through what the question names", async () => {
  assert.equal(await ask("what comes next: 2, 4, 8, 16"), "Answer(Predicted(32, Multiply(Previous(), 2)))");
  assert.equal(await ask("what comes after 2, 4, 6, 8?"), "Answer(Predicted(10, Add(Previous(), 2)))");
});
