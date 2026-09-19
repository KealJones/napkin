import assert from "node:assert/strict";
import { test } from "node:test";
import { format, parse } from "../concept/expression.js";
import { declarationFrom, TEACHER_MODEL } from "./teacher.js";

test("a declaration written across lines is folded, not thrown away", () => {
  const lifted = parse(
    'Sequence(Concept(identity="Time", relations=List(IsA(Deictic()))), ' +
      "Realization(pattern=Time($a), body=Add(Time($a), 1)))",
  );
  const folded = declarationFrom(lifted)!;
  assert.equal(folded.head, "Concept");
  assert.match(format(folded), /realizations=List\(Realization\(pattern=Time\(\$a\)/);
  assert.match(format(folded), /relations=List\(IsA\(Deictic\(\)\)\)/);
});

test("loose realizations join the ones the declaration already carried", () => {
  const folded = declarationFrom(
    parse(
      'Sequence(Concept(identity="X", realizations=List(Realization(pattern=X(), body=A()))), ' +
        "Realization(pattern=X($b), body=B($b)))",
    ),
  )!;
  const realizations = format(folded).match(/Realization\(/g) ?? [];
  assert.equal(realizations.length, 2);
});

test("anything that is not a declaration is still refused", () => {
  assert.equal(declarationFrom(parse("Sequence(Aside(\"hi\"), Aside(\"there\"))")), undefined);
  assert.equal(declarationFrom(parse("Aside(\"hi\")")), undefined);
  assert.equal(declarationFrom(undefined), undefined);
});

test("the Teacher is a different model from the Ears", async () => {
  const { DEFAULTS } = await import("../ears/ollama.js");
  assert.notEqual(TEACHER_MODEL, DEFAULTS.model);
});
