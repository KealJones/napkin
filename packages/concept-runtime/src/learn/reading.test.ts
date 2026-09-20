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

const SPEC = [
  {
    name: "concept-spec.md",
    text: [
      "# The Concept unit",
      "",
      "| identity | a CapitalizedName |",
      "| relations | expressions asserting facts |",
      "| realizations | how it behaves |",
      "",
      "## What an expression is",
      "",
      "An expression is a literal, a variable, or an application of a Concept.",
    ].join("\n"),
  },
];

test("a passage is about the heading it sits under, not the words it happens to contain", () => {
  // The three-part table mentions "expressions" and sits under a heading about the
  // Concept unit. It was the top hit for `expression`, and taught that an Expression has
  // an identity, relations and realizations -- true of a Concept, false of an expression.
  const found = passages(SPEC, "expression");
  assert.match(found[0]!.snippet, /^An expression is a literal/);
});

test("headings nest, so an inner one does not inherit the wrong outer subject", async () => {
  const { sections } = await import("./reading.js");
  const found = sections(SPEC[0]!.text);
  const definition = found.find((p) => p.text.startsWith("An expression is"));
  assert.deepEqual(definition!.under, ["The Concept unit", "What an expression is"]);
});
