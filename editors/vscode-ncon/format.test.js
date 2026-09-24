// node format.test.js: the editor formats with the runtime's formatter, and every built-in
// pack is already in its layout. The rules themselves are tested in the runtime
// (packages/concept-runtime/src/code/format.test.ts).
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { format, isFormatError } = require("./format.js");

test("the editor's formatting is the runtime's", async () => {
  const { formatNcon } = await import(join(__dirname, "../../packages/concept-runtime/dist/code/format.js"));
  const text = "Realization(Double($x),context=Execution())";
  assert.equal(await format(text), formatNcon(text));
  assert.equal(await format(text), "Realization(Double($x), context = Execution())\n");
});

test("text that does not parse is the formatter's error, not a crash", async () => {
  const error = await format("If($a,").catch((e) => e);
  assert.ok(await isFormatError(error), String(error));
});

test("every built-in pack is already formatted", async () => {
  const dir = join(__dirname, "../../packages/concept-runtime/packs");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ncon"))) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.equal(await format(text), text, f);
  }
});
