import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../../concept/expression.js";
import { readMath } from "./math.js";

const read = (s: string) => {
  const e = readMath(s);
  return e === undefined ? undefined : format(e);
};

test("arithmetic is read by precedence, with parentheses", () => {
  assert.equal(read("5 * 3"), "Times(5, 3)");
  assert.equal(read("(2 + 3) * 4"), "Times(Plus(2, 3), 4)");
  assert.equal(read("2 + 3 * 4"), "Plus(2, Times(3, 4))");
  assert.equal(read("((1 + 2) * (3 + 4)) / 7"), "Over(Times(Plus(1, 2), Plus(3, 4)), 7)");
  assert.equal(read("2(3 + 4)"), "Times(2, Plus(3, 4))", "a number against a parenthesis multiplies");
  assert.equal(read("3 x 4"), "Times(3, 4)");
});

test("powers bind right, and a minus sign binds under them", () => {
  assert.equal(read("2 ^ 3 ^ 2"), "Power(2, Power(3, 2))");
  assert.equal(read("-2^2"), "Negative(Power(2, 2))");
  assert.equal(read("-3 + 4"), "Plus(-3, 4)");
  assert.equal(read("2 * -3"), "Times(2, -3)");
});

test("comparisons sit below arithmetic", () => {
  assert.equal(read("3 + 4 = 7"), "Equals(Plus(3, 4), 7)");
  assert.equal(read("5 > 3"), "GreaterThan(5, 3)");
});

test("dates, phone numbers and ranges are not arithmetic", () => {
  assert.equal(read("9/23/2026"), undefined);
  assert.equal(read("555-1234"), undefined);
  assert.equal(read("3-4"), undefined);
  assert.equal(read("24/7"), undefined);
  assert.equal(read("(2 + 3"), undefined, "an unclosed parenthesis is not a sum");
});
