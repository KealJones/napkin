import { test } from "node:test";
import assert from "node:assert/strict";
import { PersistentList, listWith } from "./list.js";
import { c, equal, format, isCall } from "./expression.js";

test("a PersistentList is a List to everything that reads expressions", () => {
  const values = Array.from({ length: 2000 }, (_, i) => (i % 3 ? i : c("X", i)));
  const list = PersistentList.of(values);
  assert.ok(isCall(list));
  assert.equal(list.head, "List");
  assert.equal(list.args.length, 2000);
  assert.ok(equal(list, c("List", ...values)));
  assert.equal(format(list), format(c("List", ...values)));
  assert.equal(JSON.stringify(list), JSON.stringify(c("List", ...values)));
});

test("changing entries makes a new List and leaves the old one as it was", () => {
  const values = Array.from({ length: 40_000 }, (_, i) => i);
  const a = PersistentList.of(values);
  const b = a.with([[0, -1], [1025, "x"], [39_999, null], [1025, "y"]]);
  assert.equal(a.at(1025), 1025);
  assert.equal(b.at(1025), "y");
  assert.equal(b.at(0), -1);
  assert.equal(b.at(39_999), null);
  assert.equal(b.at(40_000), undefined);
  assert.deepEqual(a.toArray(), values);
  assert.equal(b.toArray().filter((x, i) => x !== values[i]).length, 3);
  assert.equal(a.with([]), a);
  assert.throws(() => a.with([[40_000, 1]]), RangeError);
  // A plain List changes into a PersistentList.
  assert.equal(format(listWith(c("List", 1, 2, 3), [[1, 9]])), "List(1, 9, 3)");
  assert.equal(PersistentList.of([]).args.length, 0);
});
