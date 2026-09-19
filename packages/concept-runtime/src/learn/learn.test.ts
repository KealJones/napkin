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
  assert.equal(format(out), "Saved(Chess())");
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
