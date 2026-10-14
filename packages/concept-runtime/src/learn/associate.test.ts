import assert from "node:assert/strict";
import { test } from "node:test";
import { Associations, Directions } from "./associate.js";

test("what goes with what is kept by lift: a common outcome is not tied to every context", () => {
  const a = new Associations<string, number>();
  for (let i = 0; i < 20; i++) a.observe(["eight", "apples"], [8, 2]);
  for (let i = 0; i < 80; i++) a.observe(["as", "apples"], [2]);
  const kept = a.kept({ least: 5, share: 0.5, lift: 3 });
  assert.deepEqual(kept.map((k) => `${k.context}:${k.outcome}`), ["eight:8"]);
  assert.equal(a.best().get("eight")?.outcome, 8);
});

test("which way a thing points: against its group's base rate, or by a clear majority", () => {
  const d = new Directions();
  for (let i = 0; i < 30; i++) d.add("add", "Effect", "Up");
  for (let i = 0; i < 30; i++) d.add("spend", "Effect", i < 25 ? "Down" : "Up");
  for (let i = 0; i < 60; i++) d.add("have", "Effect", i < 15 ? "Down" : "Up");
  assert.deepEqual(d.decided("Effect", { by: "base", z: 2 }).map((x) => `${x.key}:${x.way}`).sort(), ["add:Up", "spend:Down"]);
  for (let i = 0; i < 10; i++) d.add("older", "Compares", i < 9 ? "Up" : "Down");
  assert.deepEqual(d.decided("Compares", { by: "majority" }).map((x) => `${x.key}:${x.way}`), ["older:Up"]);
});
