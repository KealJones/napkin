import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { c, format, isCall, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const corpus = existsSync(new URL("../../data/dialog/dumps/train/dialogues_train.txt", import.meta.url));
const store = new ConceptStore();
seed(store);

test("a reply is predicted from how people answered what is nearest", { skip: !corpus && "DailyDialog is not downloaded (src/seed/dialogue/fetch.sh)" }, async () => {
  const reply = await new Runtime(store).evaluate(parse('Reply("I\'m so scared about tomorrow")'), c("Execution"));
  assert.ok(isCall(reply) && reply.head === "Reply");
  assert.match(format(reply), /heard=Heard\(\w+\(\), Fear\(\)\)/);
});

test("a statement is noted with the reply it calls for", { skip: !corpus && "DailyDialog is not downloaded" }, async () => {
  const r = await turn(new Runtime(store), "haha that's hilarious", c("Execution"), { backend: "rules", learn: false, speak: false });
  assert.match(String(r.rendered), /^Noted\(.*reply=Reply\(\w+\(\), heard=Heard\(\w+\(\), Happiness\(\)\)/);
});
