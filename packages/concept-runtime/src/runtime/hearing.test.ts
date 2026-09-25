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

test("doings: a verb takes what follows and belongs to the thing before; after a verb, a doing is said about the thing", async () => {
  assert.equal(await hear("i need toilet paper and cheese sticks"), "Phrases(I(Need(And(Paper(Toilet()), Sticks(Cheese())))))");
  assert.equal(await hear("the old dog barked at the mailman"), "Phrases(Dog(Old(), Barked(At(Mailman()))))");
  // design/prompt-hearing.md section 5, word for word.
  assert.equal(
    await hear("American Pie is a 1999 American teen comedy film directed and co-produced by Paul Weitz"),
    "Phrases(Is(Pie(American()), Film(1999, American(), Teen(), Comedy(), And(Directed(), CoProduced(By(Weitz(Paul())))))))",
  );
});

test("rambling: sentences stay apart, contractions are their words, filler is set aside", async () => {
  assert.equal(await hear("red light, speed camera ahead. work in progress."), "Phrases(Camera(Red(), Light(), Speed()), Ahead(), Work(In(Progress())))");
  assert.equal(await hear("there's a way"), "Phrases(Is(There(), Way()))");
  assert.equal(await hear("i like uh pie"), "Phrases(I(Like(Pie())), MarkAside(\"uh\"))");
});

test("a word nobody knows hears as what the tagger says it looks like", async () => {
  assert.equal(await hear("the americanpie"), "Phrases(Americanpie())");
});

test("under Hearing a word only hears: nothing it does elsewhere runs", async () => {
  // Add and Delete have behaviour; heard, they are words.
  assert.equal(await hear("add 2 and 3 then delete everything"), "Phrases(Add(), And(2, 3), Then(), Delete(Everything()))");
});
