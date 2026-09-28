import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { isType } from "./types.js";

const store = new ConceptStore();
seed(store);
const is = (value: string, kind: string) => isType(store, parse(value), parse(kind));

test("a type is anything IsA can point at, written like a pattern: a primitive, positions, a repeating tail, either, or a Concept through IsA", () => {
  assert.ok(is("5", "Number()"));
  assert.ok(!is('"five"', "Number()"));
  assert.ok(is("List(1, 2)", "List(Rest(Number()))"));
  assert.ok(!is('List(1, "a")', "List(Rest(Number()))"));
  assert.ok(is("List()", "List(Rest(Number()))"));
  assert.ok(is("List(1)", "List(Number())"));
  assert.ok(!is("List(1, 2)", "List(Number())"));
  assert.ok(is('List("a", 1, 2)', "List(String(), Rest(Number()))"));
  assert.ok(is('List("a", 1)', "List(String(), Number())"));
  assert.ok(is('"x"', "OneOf(Number(), String())"));
  const s = new ConceptStore();
  seed(s);
  s.addRelation("Rex", parse("IsA(Dog())"));
  s.addRelation("Dog", parse("SubclassOf(Animal())"));
  assert.ok(isType(s, parse("Rex()"), parse("Animal()")));
  assert.ok(!isType(s, parse("Rex()"), parse("Number()")));
});

test("a realization that types its variables is chosen over one that does not, and hands over when they are not of that type", async () => {
  const s = new ConceptStore();
  seed(s);
  s.seed(
    concept("Size", {
      realizations: [
        realization({ pattern: "Size($x)", context: "Execution()", body: parse('"something"') }),
        realization({ pattern: "Size($x)", context: "Execution()", types: "Types(x = Number())", body: parse('"a number"') }),
        realization({ pattern: "Size($x)", context: "Execution()", types: "Types(x = List(Rest(String())))", body: parse('"some words"') }),
      ],
    }),
  );
  const size = async (e: string) => format(await new Runtime(s).evaluate(parse(`Size(${e})`), c("Execution")));
  assert.equal(await size("5"), '"a number"');
  assert.equal(await size('List("a", "b")'), '"some words"');
  assert.equal(await size("Dog()"), '"something"');
});
