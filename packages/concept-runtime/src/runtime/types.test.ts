import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

const store = new ConceptStore();
seed(store);
const fits = async (s: ConceptStore, value: string, type: string) => format(await new Runtime(s).evaluate(parse(`Fits(${value}, ${type})`), c("Execution"))) === "True()";
const is = (value: string, type: string) => fits(store, value, type);

test("a type is anything IsA can point at, written like a pattern: a primitive, positions, a repeating tail, either, or a Concept through IsA", async () => {
  assert.ok(await is("5", "Number()"));
  assert.ok(!(await is('"five"', "Number()")));
  assert.ok(await is("List(1, 2)", "List(Rest(Number()))"));
  assert.ok(!(await is('List(1, "a")', "List(Rest(Number()))")));
  assert.ok(await is("List()", "List(Rest(Number()))"));
  assert.ok(await is("List(1)", "List(Number())"));
  assert.ok(await is("List(1, 2, 3)", "ListOf(Number())"));
  assert.ok(!(await is('List(1, "a")', "ListOf(Number())")));
  assert.ok(!(await is("List(1, 2)", "List(Number())")));
  assert.ok(await is('List("a", 1, 2)', "List(String(), Rest(Number()))"));
  assert.ok(await is('List("a", 1)', "List(String(), Number())"));
  assert.ok(await is('"x"', "OneOf(Number(), String())"));
  const s = new ConceptStore();
  seed(s);
  s.addRelation("Rex", parse("IsA(Dog())"));
  s.addRelation("Dog", parse("SubclassOf(Animal())"));
  assert.ok(await fits(s, "Rex()", "Animal()"));
  assert.ok(!(await fits(s, "Rex()", "Number()")));
  assert.ok(await is("List(1, 2)", "List(Of(Number()))"));
  assert.ok(!(await is('List(1, "a")', "List(Of(Number()))")));
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

test("a type variable is one type wherever it stands", async () => {
  const s = new ConceptStore();
  seed(s);
  s.seed(
    concept("Pair", {
      realizations: [
        realization({ pattern: "Pair($a, $b)", context: "Execution()", body: parse('"mixed"') }),
        realization({ pattern: "Pair($a, $b)", context: "Execution()", types: "Types(a = $T, b = $T)", body: parse('"alike"') }),
        realization({ pattern: "Pair($a, $b)", context: "Execution()", types: "Types(a = List(Of($T)), b = $T)", body: parse('"one more of them"') }),
      ],
    }),
  );
  const pair = async (e: string) => format(await new Runtime(s).evaluate(parse(`Pair(${e})`), c("Execution")));
  assert.equal(await pair("1, 2"), '"alike"');
  assert.equal(await pair('1, "a"'), '"mixed"');
  assert.equal(await pair("List(1, 2), 3"), '"one more of them"');
});
