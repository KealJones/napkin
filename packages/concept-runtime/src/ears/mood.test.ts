import assert from "node:assert/strict";
import { test } from "node:test";
import { frame, mood, sentences } from "./mood.js";

test("mood is grammar, not use", () => {
  assert.equal(mood("turn off the lights"), "Imperative");
  assert.equal(mood("please do NOT push to main"), "Imperative");
  assert.equal(mood("let's play chess"), "Imperative");
  assert.equal(mood("i'm allergic to peanuts"), "Declarative");
  assert.equal(mood("greg is my coworker"), "Declarative");
  assert.equal(mood("could you close the door"), "Interrogative", "a polite question is a question in form");
  assert.equal(mood("what's the capital of france"), "Interrogative");
  assert.equal(mood("ok so basically my pi keeps dropping"), "Declarative");
});

test("a question marked only by its ? or a tag is a check", () => {
  assert.equal(mood("chess is a sport?"), "Checking");
  assert.equal(mood("it's tuesday, right?"), "Checking");
  assert.equal(mood("is chess a sport?"), "Interrogative");
});

test("an interjection has no mood", () => {
  assert.equal(mood("hey there!"), undefined);
  assert.equal(mood("thanks!"), undefined);
});

test("sentences drop fenced blocks and list markers", () => {
  assert.deepEqual(sentences("1. clone the repo\n2. run the tests"), ["clone the repo", "run the tests"]);
  assert.deepEqual(sentences("fix this:\n```\nboom\n```"), ["fix this:"]);
});

test("a mood is only added, never changed", () => {
  assert.equal(frame("Turn(Off(), Lights())", "turn off the lights"), "Mood(Imperative(), Turn(Off(), Lights()))");
  assert.equal(frame("Mood(Declarative(), Open(Door()))", "close the door"), "Mood(Declarative(), Open(Door()))");
  assert.equal(frame('MarkAside("lol")', "lol"), 'MarkAside("lol")');
});

test("a trailing ! or ?? stresses the sentence", () => {
  assert.equal(frame("HeyThere()", "hey there!"), 'MarkEmphasis("!", HeyThere())');
  assert.equal(frame("What(Else())", "what else should i try??"), 'Mood(Interrogative(), MarkEmphasis("??", What(Else())))');
});

test("lines are tied to sentences only when that needs no guess", () => {
  const two = "i'm tired. turn off the lights";
  assert.equal(frame("Tired(Me())\nTurn(Off(), Lights())", two), "Mood(Declarative(), Tired(Me()))\nMood(Imperative(), Turn(Off(), Lights()))");
  assert.equal(frame("Tired(Me())\nVery()\nTurn(Off(), Lights())", two), "Mood(Declarative(), Tired(Me()))\nVery()\nMood(Imperative(), Turn(Off(), Lights()))", "unmatched counts align by shared words; a line sharing none is left");
  assert.equal(frame('$x = Lights()\nTurn(Off(), Ref("them", $x))', "turn off the lights"), '$x = Lights()\nMood(Imperative(), Turn(Off(), Ref("them", $x)))');
});

test("a line nothing can repair is left alone, not wrapped", () => {
  assert.equal(frame("What(( Half))) Of(", "what is half of 90"), "What(( Half))) Of(");
});

test("a line one paren short is still framed, since lift will repair it", () => {
  assert.equal(frame("Can(You(), Add(2, 2)", "can you add 2 and 2"), "Mood(Interrogative(), Can(You(), Add(2, 2))");
});

test("do at the start is an order unless a subject follows or it ends in ?", () => {
  assert.equal(mood("do the same thing for the other file"), "Imperative");
  assert.equal(mood("do you know the time"), "Interrogative");
  assert.equal(mood("do the kids know?"), "Interrogative");
});

test("two calls side by side on one line are framed as two lines", () => {
  assert.equal(frame("I(Me()) Am(Allergic())", "i'm allergic"), "Mood(Declarative(), I(Me()))\nMood(Declarative(), Am(Allergic()))");
});
