import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { atomicQueryOf, atomicTermOf, groundInAtomic } from "./atomic.js";

// The dataset server as it answers a search: rows whose words match anywhere, most not the event.
const rows = [
  { event: "PersonX's car breaks down", relation: "xReact", tail: ["frustrated", "annoyed", "none"] },
  { event: "PersonX's car breaks down", relation: "xWant", tail: ["to call a mechanic", "to get a ride"] },
  { event: "PersonX's car breaks down", relation: "xReact", tail: ["frustrated", "stressed"] },
  { event: "PersonX drives PersonY's car to work", relation: "xEffect", tail: ["car breaks down"] },
  { event: "PersonX needs to buy a new car", relation: "isAfter", tail: ["PersonX car breaks down"] },
];
const asked: string[] = [];
const server = async (url: string): Promise<unknown> => {
  const u = new URL(url);
  if (u.hostname === "datasets-server.huggingface.co") {
    asked.push(u.searchParams.get("query") ?? "");
    return { rows: rows.map((row) => ({ row })) };
  }
  return {};
};

test("an event told is the words of its clause that say something, by base form", () => {
  assert.equal(atomicTermOf("my car broke down"), "car break down");
  assert.equal(atomicTermOf("I lost my job today"), "lose job");
  assert.equal(atomicTermOf("i just got promoted!"), "promote");
  assert.equal(atomicTermOf("thanks"), undefined);
  assert.equal(atomicTermOf("what is 3 times 4?"), undefined);
  // Searched as ATOMIC writes its events: of someone else, in the present.
  assert.equal(atomicQueryOf("my car broke down"), "car breaks down");
  assert.equal(atomicQueryOf("I lost my job today"), "loses job");
});

test("ATOMIC rows are kept only for the event told, the most said first, and the event is not asked again", async () => {
  const store = new ConceptStore();
  seed(store);
  const got = await groundInAtomic(store, "car break down", { fetch: server });
  assert.deepEqual(got.relations.map(format).sort(), ["XReact(Annoyed())", "XReact(Frustrated())", "XReact(Stressed())", "XWant(CallAMechanic())", "XWant(GetARide())"]);
  await groundInAtomic(store, "car break down", { fetch: server });
  // Two pages, once: asked as ATOMIC writes its events.
  assert.equal(asked.filter((q) => q === "car break down").length, 2);
});

test("told an everyday event, Napkin answers from what ATOMIC says follows: how one feels, what one wants", async () => {
  const store = new ConceptStore();
  seed(store);
  const t = await turn(new Runtime(store, {}), "my car broke down", c("Execution"), { fetch: server });
  assert.match(t.spoken, /frustrated/);
  assert.match(t.spoken, /call a mechanic/);
});
