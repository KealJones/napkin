import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../concept/expression.js";
import { balance, lift } from "./lift.js";
import { check, looksLikeQuestion } from "./ears.js";

test("one line lifts to itself, with no root wrapper", () => {
  assert.equal(format(lift("What(Date())").expression!), "What(Date())");
});

test("several lines lift to Sequence", () => {
  const e = lift("Fact(A())\nFact(B())\nAside(\"x\")").expression!;
  assert.equal(format(e), 'Sequence(Fact(A()), Fact(B()), Aside("x"))');
});

test("an assignment scopes over everything after it", () => {
  const e = lift("$x = Add(1, 2)\nMultiply($x, 10)").expression!;
  assert.equal(format(e), "Let($x, Add(1, 2), Multiply($x, 10))");
});

test("a bad line costs one clause, not the whole parse", () => {
  // Fault isolation: the malformed line is rejected and the other two still parse.
  // A single wrapped expression has no such property — one slip destroys everything.
  const lifted = lift('Fact(A())\nFact(((\nAside("kept")');
  assert.equal(lifted.clauses, 2);
  assert.equal(lifted.rejected.length, 1);
  assert.match(format(lifted.expression!), /Fact\(A\(\)\).*Aside\("kept"\)/);
});

test("paren balancing repairs the measured failure", () => {
  assert.equal(balance("Fact(Visited(Me()"), "Fact(Visited(Me()))");
});

test("a question with no interrogative is caught mechanically", () => {
  const problems = check("What is 5 times three?", lift('Multiply(5, Number("three"))').expression);
  assert.match(problems.join(" "), /no interrogative/);
  assert.deepEqual(check("What is 5 times three?", lift('What(Multiply(5, Number("three")))').expression), []);
});

test("a statement is not required to carry an interrogative", () => {
  assert.ok(!looksLikeQuestion("i went to virginya"));
  assert.deepEqual(check("i went to virginya", lift("Fact(Visited(Me()))").expression), []);
});

test("single quotes are repaired, because a small model writes them anyway", () => {
  const e = lift("Count(String('r'), String('strawberry'))").expression!;
  assert.equal(format(e), 'Count(String("r"), String("strawberry"))');
});

test("a trailing comma is repaired", () => {
  assert.equal(format(lift("Fact(A(), B(),)").expression!), "Fact(A(), B())");
});

test("repair never rewrites a line that already parses", () => {
  const e = lift('Aside("it\'s fine")').expression!;
  assert.equal(format(e), 'Aside("it\'s fine")');
});

test("a placeholder ? becomes an anonymous unknown rather than a dropped clause", () => {
  const lifted = lift('Not(Wrong())\n$math = What(Multiply(?, ?))');
  assert.equal(lifted.rejected.length, 0);
  assert.equal(lifted.clauses, 2);
  assert.match(format(lifted.expression!), /\$_/);
});

test("a ? inside a string is the user's own words and stays put", () => {
  const lifted = lift('Aside("really?")');
  assert.equal(format(lifted.expression!), 'Aside("really?")');
});

test("output cut off by a generation cap keeps what was said before the cut", () => {
  const truncated =
    'Concept(identity="Money", relations=List(IsA(Asset()), IsA(MediumOfExchange()), SynonymOf(Curren';
  const lifted = lift(truncated);
  assert.equal(lifted.rejected.length, 0);
  const text = format(lifted.expression!);
  assert.match(text, /identity="Money"/);
  assert.match(text, /IsA\(MediumOfExchange\(\)\)/);
  // The half-written argument is gone rather than the whole declaration.
  assert.ok(!text.includes("Curren"));
});

test("salvage never wins over something that already parses", () => {
  const fine = 'Concept(identity="Money", relations=List(IsA(Asset())))';
  assert.equal(format(lift(fine).expression!), fine);
});

test("the vocabulary keeps what matters when the graph outgrows the prompt", async () => {
  const { vocabulary } = await import("./prompt.js");
  const { ConceptStore } = await import("../store/store.js");
  const { seed } = await import("../seed/seed.js");
  const { concept } = await import("../concept/unit.js");

  const store = new ConceptStore();
  seed(store);
  // Enough junk to push everything past the limit, all of it alphabetically early.
  for (let i = 0; i < 600; i += 1) store.seed(concept(`Aardvark${String(i).padStart(4, "0")}`));

  const shown = vocabulary(store, 120, "what time is it").split("\n")[1]!;
  // Alphabetical truncation lost the interrogatives and everything that computes.
  assert.match(shown, /\bWhat\(/, "an interrogative is required by the rules beside this list");
  assert.match(shown, /\bTime\(/, "naming a Concept that realizes is the difference from a residual");
  assert.match(shown, /\bMultiply\(/);
});

test("the message pulls in Concepts that are otherwise nowhere near the front", async () => {
  const { vocabulary } = await import("./prompt.js");
  const { ConceptStore } = await import("../store/store.js");
  const { concept } = await import("../concept/unit.js");

  const store = new ConceptStore();
  for (let i = 0; i < 300; i += 1) store.seed(concept(`Aardvark${String(i).padStart(4, "0")}`));
  store.seed(concept("Zebra"));

  assert.match(vocabulary(store, 50, "tell me about a zebra").split("\n")[1]!, /\bZebra\(/);
  assert.ok(!vocabulary(store, 50, "tell me about a horse").split("\n")[1]!.includes("Zebra("));
});
