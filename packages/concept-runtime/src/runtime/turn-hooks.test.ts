import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { c, call, parse, type Expr } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { holdsResidual, turn } from "./turn.js";

const EXEC = c("Execution");
const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);
const fresh = (): Runtime => {
  const seeded = new ConceptStore();
  seed(seeded);
  const store = new ConceptStore();
  for (const unit of seeded.all()) {
    if (unit.identity !== "RenderResponse") store.seed(unit);
  }
  return new Runtime(store);
};

function model(t: TestContext, respond: (system: string, prompt: string) => string): string[] {
  const systems: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as { system: string; prompt: string };
    systems.push(request.system);
    return new Response(JSON.stringify({ response: respond(request.system, request.prompt) }));
  });
  return systems;
}

function hook(rt: Runtime, identity: string, body: Expr): void {
  rt.store.seed(concept(identity, {
    realizations: [realization({ pattern: `${identity}($input)`, context: "Execution()", body, evaluateArguments: false })],
  }));
}

test("ordinary Concepts render a computed nested result without a model call", async (t) => {
  const rt = fresh();
  rt.store.seed(concept("FixtureRecord", { relations: ["IsA(Data())"] }));
  rt.store.seed(concept("FixtureResult", { relations: ["IsA(Result())"] }));
  rt.store.seed(concept("FixtureCalculation", { realizations: [realization({
    pattern: "FixtureCalculation($value)", body: parse("Answer(FixtureResult(List(FixtureRecord(value=$value))))"),
  })] }));
  rt.store.seed(concept("RenderResponse", { realizations: [realization({
    pattern: "RenderResponse(Answer(FixtureResult(List(FixtureRecord(value=$value)))))",
    body: code('(args, bindings) => "Computed value: " + bindings.get("value")'),
    evaluateArguments: false,
  })] }));
  const requests = model(t, () => { throw new Error("No model should be called"); });
  const result = await turn(rt, "FixtureCalculation(Multiply(6, 7))", EXEC, { inputMode: "expression", learn: false });
  assert.equal(result.spoken, "Computed value: 42");
  assert.equal(result.heard.attempts, 0);
  assert.equal(requests.length, 0);
  assert.equal(holdsResidual(rt, result.result), false);
});

test("data wrappers never conceal unresolved comparisons or references", async (t) => {
  const rt = fresh();
  hook(rt, "RenderResponse", "must not be rendered");
  rt.store.seed(concept("FixtureRecord", { relations: ["IsA(Data())"] }));
  const requests = model(t, () => { throw new Error("Uncomputed results must not reach a model"); });
  const result = await turn(rt, 'What(GreaterThan(Size(Ref("a mouse")), Size(Ref("an elephant"))))', EXEC, {
    inputMode: "expression", learn: false,
  });
  assert.equal(holdsResidual(rt, result.result), true);
  assert.match(result.spoken, /^I could not work that out\./);
  assert.equal(requests.length, 0);
});

test("a data Concept with behavior is still residual when its inputs cannot be handled", async () => {
  const rt = fresh();
  rt.store.seed(concept("FixtureNumber", { relations: ["IsA(Data())"], realizations: [realization({
    pattern: "FixtureNumber(1)", body: 1,
  })] }));
  const result = await rt.evaluate(parse("FixtureNumber(2)"), EXEC);
  assert.equal(holdsResidual(rt, result), true);
});

test("residual renderers fall back to the existing mouth", async (t) => {
  const rt = fresh();
  hook(rt, "RenderResponse", c("MissingRenderer"));
  const requests = model(t, () => "The result is 42.");
  const result = await turn(rt, "Multiply(6, 7)", EXEC, { inputMode: "expression", learn: false });
  assert.equal(result.spoken, "The result is 42.");
  assert.equal(requests.length, 1);
});

test("expression mode is strict and preserves false and zero results", async (t) => {
  const rt = fresh();
  const requests = model(t, () => { throw new Error("Expression input must not use the parser model"); });
  for (const input of ["false", "0", '""', "null"]) {
    const result = await turn(rt, input, EXEC, { inputMode: "expression", learn: false, speak: false });
    assert.equal(result.parsed, input);
    assert.equal(result.rendered, input);
  }
  const invalid = await turn(rt, "Multiply(6, 7", EXEC, { inputMode: "expression", learn: false });
  assert.equal(invalid.parsed, undefined);
  assert.ok(invalid.failed);
  assert.equal(requests.length, 0);
});
