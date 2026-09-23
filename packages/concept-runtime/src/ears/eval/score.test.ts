import assert from "node:assert/strict";
import { test } from "node:test";
import { lift } from "../lift.js";
import { contentWords, copiedNames, nameWords, namesIn, passed, score, type EvalCase } from "./score.js";

const read = (text: string) => lift(text);

test("name words split camel case, digits stay attached", () => {
  assert.deepEqual(nameWords("ShiftHours"), ["shift", "hours"]);
  assert.deepEqual(nameWords("HowMany"), ["how", "many"]);
  assert.deepEqual(nameWords("F3"), ["f3"]);
  assert.deepEqual(nameWords("IR"), ["ir"]);
});

test("content words drop grammar and keep what the message is about", () => {
  assert.deepEqual(contentWords("can you write me a typescript function"), ["write", "typescript", "function"]);
});

test("a folded name loses the words the request was made of", () => {
  const c: EvalCase = {
    id: "t", source: "heldout", message: "write me a typescript function that says hello world",
    expect: { question: false, keeps: ["typescript", "function", "hello world"] },
  };
  assert.equal(passed(score(c, read("Write(HelloWorld())"))), false);
  assert.equal(passed(score(c, read('Do(Write(Function(TypeScript(), Says("hello world"))))'))), true);
});

test("a polite modal question is a question in form, and an order is not", () => {
  const ask: EvalCase = { id: "t", source: "heldout", message: "can you add 2 and 2" };
  assert.equal(score(ask, read("Whether(Can(You(), Add(2, 2)))")).checks.question, true);
  assert.equal(score(ask, read("Do(Add(2, 2))")).checks.question, false);
  const order: EvalCase = { id: "t", source: "heldout", message: "do NOT delete the backups" };
  assert.equal(score(order, read("Do(Emphasis(Not(Delete(Backups()))))")).checks.question, undefined);
});

test("a digit must survive as a digit, a string, or inside a name", () => {
  const c: EvalCase = { id: "t", source: "heldout", message: "take 10 and go to f3 at 3pm" };
  assert.equal(score(c, read('Take(10)\nGo(F3())\nAt("3pm")')).checks.digits, true);
  assert.equal(score(c, read('Take(Number("ten"))\nGo(F3())\nAt("3pm")')).checks.digits, false);
});

test("a copied name is one the prompt shows and the message never said", () => {
  const prompt = namesIn('"write me a function" is Do(Write(Function()))');
  const e = read("Do(Write(Function()))\nExamples(Bird())").expression!;
  assert.deepEqual(copiedNames("give me three examples of a bird", e, prompt), ["Write", "Function"]);
  assert.deepEqual(copiedNames("write a function", e, prompt), []);
});

test("an unparseable reading fails and drops everything", () => {
  const c: EvalCase = { id: "t", source: "heldout", message: "what is the date" };
  const s = score(c, { expression: undefined, rejected: [{ line: "x", reason: "y" }] });
  assert.equal(passed(s), false);
  assert.equal(s.retained, 0);
});

test("a gold reading commits its frames, holes, references and kept words", () => {
  const c: EvalCase = {
    id: "t", source: "gold", message: "send it to him please",
    target: 'Mood(Imperative(), Please(Send(Ref("it"), To(Ref("him")))))',
  };
  const good = score(c, read('Mood(Imperative(), Please(Send(Ref("it"), To(Ref("him")))))'));
  assert.equal(passed(good), true);
  assert.equal(good.match, 1);
  const lost = score(c, read('Send(Ref("it"))'));
  assert.equal(lost.checks["counts:Imperative"], false);
  assert.equal(lost.checks["counts:Ref"], false);
  assert.equal(lost.checks["keeps:him"], undefined, "a pronoun is not a content word");
});

test("a gold reading can be written without fused names", async () => {
  const { unfuse } = await import("./harness.js");
  assert.equal(unfuse("Mood(Interrogative(), WhoDid(Hamlet(), Kill()))"), "Mood(Interrogative(), Who(Did(Hamlet(), Kill())))");
  assert.equal(unfuse("$x = Chess(IsA(Sport()))\nPush(DoNot(Main()))"), "$x = Chess(Is(Sport()))\nPush(Do(Not(Main())))");
});
