import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { format, parseMany } from "../concept/expression.js";
import { formatNcon } from "./format.js";
import { BUILT_IN_PACKS, loadPacks, unitText } from "./ncon.js";

test("= gets a space either side, and a short call stays on one line", () => {
  assert.equal(formatNcon("Realization(Double($x),context=Execution())"), "Realization(Double($x), context = Execution())\n");
});

test("a call with more than two arguments breaks unless it is short; its paren closes under it", () => {
  assert.equal(formatNcon("If($a, $b, $c)"), "If($a, $b, $c)\n");
  const long = "If(GreaterThan(Length($somethingLong), 1000), Concat($first, $second, $third, $fourth), Undefined())";
  assert.equal(formatNcon(long), "If(\n  GreaterThan(Length($somethingLong), 1000),\n  Concat($first, $second, $third, $fourth),\n  Undefined()\n)\n");
});

test("Concept, Realization, Lambda and Bind keep their first argument on the head's line", () => {
  const text = 'Bind($found, If(Equals(TypeOf(Index($v, 1)), "number"), Index(Member(Index($v, 0), "args"), Index($v, 1)), Undefined()), $found)';
  assert.equal(formatNcon(text), 'Bind($found,\n  If(\n    Equals(TypeOf(Index($v, 1)), "number"),\n    Index(Member(Index($v, 0), "args"), Index($v, 1)),\n    Undefined()\n  ),\n  $found\n)\n');
});

test("comments stay above, beside, and before the closing parenthesis they were at", () => {
  const text = "A(\n  // above\n  B(), // beside\n  C()\n  // before the end\n)\n";
  assert.equal(formatNcon(text), text);
});

test("blank lines between forms are kept, one at most", () => {
  assert.equal(formatNcon("A()\n\n\n\nB()\nC()\n"), "A()\n\nB()\nC()\n");
});

test("every built-in pack is already in the layout, and what the runtime writes is too", () => {
  for (const f of readdirSync(BUILT_IN_PACKS).filter((f) => f.endsWith(".ncon"))) {
    const text = readFileSync(join(BUILT_IN_PACKS, f), "utf8");
    assert.equal(formatNcon(text), text, `${f} is formatted`);
  }
  for (const u of loadPacks([BUILT_IN_PACKS]).flatMap((p) => p.units).slice(0, 400)) {
    const written = unitText(u);
    assert.equal(formatNcon(written).trimEnd(), written, u.identity);
    assert.equal(parseMany(written).map(format).join(), parseMany(formatNcon(written)).map(format).join());
  }
});
