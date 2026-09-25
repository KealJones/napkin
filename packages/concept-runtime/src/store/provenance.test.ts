import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, parse } from "../concept/expression.js";
import { ConceptStore } from "./store.js";
import { factsBySource } from "./provenance.js";

test("learned facts are counted by the source they were read from", () => {
  const store = new ConceptStore();
  const said = store.addRelation("Conversation_1", parse('Said(Me(), Hi(), text="hi")'));
  const page = store.addRelation("Wiktionary", call("Imported", [{ value: "https://en.wiktionary.org/wiki/lol" }]), undefined, said.seq);
  store.addRelation("Lol", c("Means", "laughing out loud"), undefined, page.seq);
  const taught = store.addRelation("Teacher", parse('Taught("AmericanPie", model="qwen")'), undefined, said.seq);
  store.addRelation("AmericanPie", parse("IsA(Film())"), undefined, taught.seq);
  store.addRelation("AmericanPie", parse("Director(PaulWeitz())"), undefined, taught.seq);
  store.addRelation("Me", parse("Likes(Pie())"), undefined, said.seq);
  const counts = factsBySource(store);
  assert.equal(counts.get("Wiktionary")?.facts, 1);
  assert.equal(counts.get("Teacher")?.facts, 2);
  assert.equal(counts.get("said")?.facts, 1);
});
