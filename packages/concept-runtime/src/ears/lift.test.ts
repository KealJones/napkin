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
