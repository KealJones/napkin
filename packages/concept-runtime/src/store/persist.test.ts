import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, format, parse } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { load, save, verifyRoundTrip } from "./persist.js";
import { ConceptStore } from "./store.js";

const withTemp = (fn: (path: string) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), "cnocept-"));
  try {
    return fn(join(dir, "graph.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the seeded graph survives a round trip without losing anything", () => {
  const store = new ConceptStore();
  seed(store);
  assert.deepEqual(verifyRoundTrip(store), []);
});

test("what is learned persists and still works after reloading", async () => {
  await withTemp(async (path) => {
    const first = new ConceptStore();
    seed(first);
    const rt = new Runtime(first);
    await rt.evaluate(
      parse('Concept(identity="Chess", relations=List(IsA(BoardGame())), realizations=List())'),
      c("Execution"),
    );
    save(first, path);

    const second = new ConceptStore();
    seed(second);
    load(second, path);
    const reloaded = new Runtime(second);
    const out = format(await reloaded.evaluate(parse("What(Chess())"), c("Execution")));
    assert.match(out, /IsA\(BoardGame\(\)\)/);
  });
});

test("code realizations survive persistence, so seeded behaviour is not lost", async () => {
  await withTemp(async (path) => {
    const store = new ConceptStore();
    seed(store);
    save(store, path);
    const reloaded = new ConceptStore();
    load(reloaded, path);
    const out = format(await new Runtime(reloaded).evaluate(parse("Multiply(6, 7)"), c("Execution")));
    assert.equal(out, "42");
  });
});

test("loading is additive, so a snapshot never clobbers what is already held", async () => {
  await withTemp(async (path) => {
    const store = new ConceptStore();
    seed(store);
    save(store, path);
    store.seed(concept("Later", { relations: ["IsA(Thing())"] }));
    load(store, path);
    assert.ok(store.has("Later"), "an older snapshot must not remove newer knowledge");
  });
});

test("a missing graph file is not an error", () => {
  const store = new ConceptStore();
  assert.equal(load(store, "/nonexistent/graph.json"), 0);
});
