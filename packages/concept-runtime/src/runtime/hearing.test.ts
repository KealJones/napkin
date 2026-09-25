import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, format } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

const store = new ConceptStore();
seed(store);
const hear = async (text: string) => format(await new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Execution")));

test("things: describers and nouns before a thing are its arguments, and the thing is the head", async () => {
  assert.equal(await hear("my old car"), "Phrases(Car(My(), Old()))");
  assert.equal(await hear("ice cream"), "Phrases(Cream(Ice()))");
  assert.equal(await hear("the big red ball"), "Phrases(Ball(Big(), Red()))");
  assert.equal(await hear("a 1999 American teen comedy film"), "Phrases(Film(1999, American(), Teen(), Comedy()))");
});

test("the closed class: prepositions take the thing after them, and joins, is holds both sides", async () => {
  assert.equal(await hear("the capital of france"), "Phrases(Capital(Of(France())))");
  assert.equal(await hear("toilet paper and cheese sticks"), "Phrases(And(Paper(Toilet()), Sticks(Cheese())))");
  // The tagger calls "in" a noun here; the graph knows it is a preposition.
  assert.equal(await hear("napkin is a work in progress"), "Phrases(Is(Napkin(), Work(In(Progress()))))");
  assert.equal(await hear("directed and co-produced by Paul Weitz"), "Phrases(And(Directed(), CoProduced(By(Weitz(Paul())))))");
});

test("a word nobody knows hears as what the tagger says it looks like", async () => {
  assert.equal(await hear("the americanpie"), "Phrases(Americanpie())");
});

test("under Hearing a word only hears: nothing it does elsewhere runs", async () => {
  // Add and Delete have behaviour; heard, they are words.
  assert.equal(await hear("add 2 and 3 then delete everything"), "Phrases(Add(), And(2, 3), Then(), Delete(), Everything())");
});
