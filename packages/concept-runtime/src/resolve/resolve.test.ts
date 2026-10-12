import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { hear } from "../ears/ears.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { learnedReadings } from "./learned.js";

const fresh = () => {
  const store = new ConceptStore();
  seed(store, { packs: [] });
  return store;
};
/** One conversation: each message with the turns before it as history. */
async function talk(store: ConceptStore, messages: string[]) {
  const runtime = new Runtime(store, {});
  const history: { message: string; result: string; spoken?: string }[] = [];
  const said: string[] = [];
  for (const message of messages) {
    const t = await turn(runtime, message, c("Execution"), { history: history.slice(-6), learn: false, keepReadings: true });
    history.push({ message, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    said.push(t.spoken);
  }
  return said;
}

test("a word is read as the one its neighbours can take: a slip, two words typed as one, one typed as two", async () => {
  const store = fresh();
  assert.equal((await hear(store, "what is 9 minuss 4")).text, "what is 9 minus 4");
  assert.equal((await hear(store, "what is 2 pl us 2")).text, "what is 2 plus 2");
  assert.equal((await hear(store, "whatis 2 plus 2")).text, "what is 2 plus 2");
});

test("a word nothing speaks for another reading of is left as typed, and so is a name in code", async () => {
  const store = fresh();
  assert.equal((await hear(store, "I bought a florp for my kid")).text, "I bought a florp for my kid");
  assert.equal((await hear(store, "i went to a wat in thailand")).text, "i went to a wat in thailand");
  assert.equal((await hear(store, "make g so that g(2) = 5, g(3) = 7")).edits?.length, 0);
});

test("told what was meant, the message is read again, and the reading is kept for next time", async () => {
  const store = fresh();
  const said = await talk(store, ["wat is 2 pluss 2", "no, I meant what", "wat is 3 pluss 3"]);
  assert.equal(said[1], "4.");
  assert.equal(said[2], "6.");
  assert.equal(learnedReadings(store, "wat")[0]?.meant, "what");
  // A reading that worked is kept too, a stamp more each time it holds.
  assert.ok((learnedReadings(store, "pluss")[0]?.times ?? 0) >= 2);
});

test("one known word said for another is said again, not kept as a spelling", async () => {
  const store = fresh();
  const said = await talk(store, ["what is 5 minus 3", "no I meant plus"]);
  assert.equal(said[1], "8.");
  assert.equal(learnedReadings(store, "minus").length, 0);
});

test("a claim made of a sum is worked out and answered, not added into the sum", async () => {
  const store = fresh();
  const said = await talk(store, ["2 plus 2 is 5", "2 plus 2 is 4", "I told them that 2 plus two was 5"]);
  assert.equal(said[0], "It's actually 4, not 5.");
  assert.equal(said[1], "Yes, that's 4.");
  assert.equal(said[2], "It's actually 4, not 5.");
});

test("a hole takes what is inside a word that only marks it: divided by 0 divides by 0", async () => {
  const said = await talk(fresh(), ["what is 12 divided by 0"]);
  assert.equal(said[0], "Undefined.");
});

test("a hole nothing fills is asked for by name, and filled by what is said next", { todo: "the word takes its neighbour, but the turn still runs the call without the missing value" }, async () => {
  const said = await talk(fresh(), ["what is 9 minus", "4"]);
  assert.equal(said[0], "9 minus what?");
  assert.equal(said[1], "5.");
});
