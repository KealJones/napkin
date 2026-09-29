// A reply to "which do you mean" (individuals.ts answerToWhich): picked by the option's name, by
// what is held of the word in that sense, or by order; a tie picks none.
import assert from "node:assert/strict";
import { test } from "node:test";
import { format, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { answerToWhich } from "./individuals.js";

const store = new ConceptStore();
seed(store);
store.addRelation("Note", parse('Means("written message from one to another")'), parse("LiteraryGenre()"));
store.addRelation("Note", parse('Means("form of physical currency made of paper or polymer")'), parse("Genre()"));
store.addRelation("Note", parse("ManifestationOf(Money())"), parse("Genre()"));
const asked = format(
  parse('Which(Note(), List(LiteraryGenre(), Genre(), Annotation()), described=List("literary genre", "genre", "annotation"), said="What is a note?", sense=True())'),
);
const pick = (reply: string) => answerToWhich(asked, reply, parse, store)?.chosen;

test("a reply picks the sense it names, describes, or counts to", () => {
  assert.equal(pick("the the literary genre"), "LiteraryGenre", "more of its name said than the other's");
  assert.equal(pick("the written message from one to another"), "LiteraryGenre", "what is held of it in that sense");
  assert.equal(pick("the money one"), "Genre");
  assert.equal(pick("the second"), "Genre");
  assert.equal(pick("the red one"), undefined, "nothing said picks one");
});
