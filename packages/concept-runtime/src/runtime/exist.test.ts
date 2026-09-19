import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { seed } from "../seed/seed.js";
import { forget } from "../store/forget.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { agenda, exist } from "./exist.js";

const fresh = () => {
  const store = new ConceptStore();
  seed(store);
  return new Runtime(store);
};

test("the agenda is read off the graph, not invented", async () => {
  const rt = fresh();
  rt.store.seed(concept("Multiplication", { relations: ["SynonymOf(Multiply())"] }));
  const items = agenda(rt);
  assert.ok(items.some((i) => i.what === "attach" && i.identity === "Multiplication"), JSON.stringify(items.slice(0, 4)));
});

test("a residual from a real turn becomes an intent", async () => {
  const rt = fresh();
  await rt.evaluate(parse("Frobnicate(3)"), c("Execution"));
  assert.ok(agenda(rt).some((i) => i.identity === "Frobnicate" && i.what === "learn"));
});

test("existing repairs what it can without asking a model", async () => {
  const rt = fresh();
  rt.store.seed(concept("Multiplication", { relations: ["SynonymOf(Multiply())"] }));
  const done = await exist(rt, { budget: 2, teacher: false } as never);
  assert.ok(done.length >= 1);
  assert.equal(format(await rt.evaluate(parse("Multiplication(6, 7)"), c("Execution"))), "42");
});

test("unattended work is bounded by a budget", async () => {
  const rt = fresh();
  for (const id of ["A1", "B2", "C3", "D4", "E5"]) rt.store.seed(concept(id));
  const done = await exist(rt, { budget: 2, teacher: false } as never);
  assert.ok(done.length <= 2);
});

/* ---------------- forgetting ---------------- */

test("forgetting loses an alternative, never a capability", () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Greet", { realizations: [realization({ pattern: "Greet()", body: parse("Old()") })] }));
  store.addRealization("Greet", realization({ pattern: "Greet()", body: parse("New()") }));
  const gone = forget(store, { unusedForMs: 0 });
  assert.ok(gone.some((g) => g.identity === "Greet"));
  // One survives: the newer, live one.
  assert.equal(store.get("Greet")!.realizations.length, 1);
  assert.equal(format(store.get("Greet")!.realizations[0].body), "New()");
});

test("the only way to do something is never collected, however old", () => {
  const store = new ConceptStore();
  seed(store);
  const before = store.get("Multiply")!.realizations.length;
  forget(store, { unusedForMs: 0 });
  assert.equal(store.get("Multiply")!.realizations.length, before);
});

test("a recently used realization is not collected", async () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Greet", { realizations: [realization({ pattern: "Greet()", body: parse("Old()") })] }));
  store.addRealization("Greet", realization({ pattern: "Greet()", body: parse("New()") }));
  store.recordSelection("Greet", 0, Date.now());
  assert.equal(forget(store, { unusedForMs: 60_000 }).length, 0);
});

test("a dry run reports without removing", () => {
  const store = new ConceptStore();
  seed(store);
  store.seed(concept("Greet", { realizations: [realization({ pattern: "Greet()", body: parse("Old()") })] }));
  store.addRealization("Greet", realization({ pattern: "Greet()", body: parse("New()") }));
  assert.equal(forget(store, { unusedForMs: 0, dryRun: true }).length, 1);
  assert.equal(store.get("Greet")!.realizations.length, 2);
});

/* ---------------- self and ambiguity ---------------- */

test("Self resolves to the message it is inside", async () => {
  const rt = fresh();
  rt.context.set("message", "use this prompt as a test case");
  const out = format(await rt.evaluate(parse("Self()"), c("Execution")));
  assert.match(out, /use this prompt as a test case/);
});

test("Self stays residual when there is no message to refer to", async () => {
  const rt = fresh();
  assert.equal(format(await rt.evaluate(parse("Self()"), c("Execution"))), "Self()");
});

test("ambiguity resolves to the reading that realizes", async () => {
  const rt = fresh();
  const out = format(await rt.evaluate(parse("Ambiguous(Frobnicate(), Add(2, 3))"), c("Execution")));
  assert.equal(out, "5");
});

test("ambiguity is preserved when nothing resolves", async () => {
  const rt = fresh();
  const out = format(await rt.evaluate(parse("Ambiguous(Frobnicate(), Wibble())"), c("Execution")));
  assert.equal(out, "Ambiguous(Frobnicate(), Wibble())");
});

test("under Describe every reading is kept", async () => {
  const rt = fresh();
  const out = format(await rt.evaluate(parse("Ambiguous(Bank(River()), Bank(Money()))"), c("Describe")));
  assert.equal(out, "Readings(Bank(River()), Bank(Money()))");
});
