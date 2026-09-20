import assert from "node:assert/strict";
import { test } from "node:test";
import { paragraphs, passages } from "./reading.js";

const DOCS = [
  {
    name: "concept-spec.md",
    text: [
      "A realization is a pattern and a body. It is how a Concept behaves.",
      "",
      "In this context the reader should already know the grammar.",
      "",
      "```",
      "Realization(pattern=X(), body=Y())",
      "",
      "still the same block",
      "```",
      "",
      "A facet is one member of a usage context, matched by subset.",
    ].join("\n"),
  },
];

test("a fenced block stays whole, so an example is never cut in half", () => {
  const found = paragraphs(DOCS[0]!.text);
  const fenced = found.find((p) => p.startsWith("```"));
  assert.ok(fenced);
  assert.match(fenced, /still the same block/);
});

test("naming the term outranks merely sharing a word with it", () => {
  const found = passages(DOCS, "realization");
  // "A realization is..." beats "In this context...", which shares nothing but shape.
  assert.match(found[0]!.snippet, /^A realization is/);
});

test("evidence carries the document it came from", () => {
  const found = passages(DOCS, "facet");
  assert.equal(found[0]!.source, "Reading");
  assert.equal(found[0]!.title, "concept-spec.md");
  assert.match(found[0]!.snippet, /matched by subset/);
});

test("a term the documents never mention yields nothing rather than noise", () => {
  assert.deepEqual(passages(DOCS, "photosynthesis"), []);
  assert.deepEqual(passages(DOCS, ""), []);
});
