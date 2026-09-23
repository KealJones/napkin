import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRules } from "./rules.js";

const read = (message: string) => parseRules(message).reading?.lines.join(" | ");

test("the same message always reads the same way", () => {
  const m = "what day will it be in 5 days?";
  assert.equal(read(m), read(m));
  assert.equal(read(m), "What(Day(), Will(It(), Be(In(Days(5)))))");
});

test("questions lead with their question word, helpers fuse, yes/no leads with the helper", () => {
  assert.equal(read("who wrote hamlet"), "Who(Wrote(Hamlet()))");
  assert.equal(read("where did i put my keys"), "WhereDid(Me(), Put(My(Keys())))");
  assert.equal(read("how did the build go?"), "HowDid(Build(), Go())");
  assert.equal(read("could you close the door please"), "Could(You(), Close(Door()))");
  assert.equal(read("how many angels can dance on the head of a pin"), "HowMany(Angels(), Can(Dance(On(Head(Of(Pin()))))))");
});

test("claims are subject first, with the predicate inside owners and describers", () => {
  assert.equal(read("i'm allergic to peanuts"), "Me(AllergicTo(Peanuts()))");
  assert.equal(read("colorless green ideas sleep furiously"), "Colorless(Green(Ideas(Sleep(Furiously()))))");
  assert.equal(read("that was wrong"), 'Was(Ref("that"), Wrong())', "a Ref is never a head");
});

test("orders are verb first, and clauses split into lines", () => {
  assert.equal(read("turn off the lights"), "Turn(Off(), Lights())");
  assert.equal(read("please add 2 and 2"), "Please(Add(2, 2))");
  assert.equal(read("take 10, double it, then subtract 5"), 'Take(10) | Double(Ref("it")) | Subtract(5)');
  assert.equal(read("do NOT delete the backups"), 'MarkEmphasis("NOT", DoNot(Delete(Backups())))');
});

test("amounts, clock times, arithmetic and pointing phrases", () => {
  assert.equal(read("set a timer for 10 minutes"), "Set(Timer(), For(Minutes(10)))");
  assert.equal(read("what is 17 times 4"), "WhatIs(Times(17, 4))");
  assert.equal(read("open the second one"), 'Open(Ref("the second one"))');
});

test("what the rules cannot account for is refused, with the reason", () => {
  const r = parseRules("## Task\nRefactor `parseConfig`");
  assert.equal(r.reading, undefined);
  assert.match(r.why ?? "", /markup/);
});
