# The Ears

Rules for anyone changing the Ears prompt (`prompt.ts`) or the code around it. Read this
before touching either. The contract itself is `ir-spec.md` Part 9; this file is about
keeping the prompt inside it.

## What the Ears is for

The Ears turns a message into a Concept expression. Its job is to represent what was said
as faithfully as it can, in a form the evaluator can act on:

- **Keep every part, in the user's own words.** "a typescript function that says hello
  world" keeps typescript, function, says and hello world. Nothing is folded into one
  invented name, and nothing is dropped.
- **The first thing said is the head.** A question starts with its question word
  (`Who(Wrote(Hamlet()))`), a yes/no question with its helper word
  (`Could(You(), Close(Door()))`), a claim about a thing with the thing
  (`Me(AllergicTo(Peanuts()))`), an order with its verb. Numbers and `Ref`s are never heads.
  Fixed combinations fuse (`WhoDid`, `WhatIs`, `IsA`, `DoNot`). Full rules:
  `design/reading-spec.md`; worked cases: `eval/ears/gold.md`.
- **Mood, not use, and not the Ears' job.** `mood.ts` adds `Mood(kind, line)` after the
  Ears (`Imperative`, `Declarative`, `Interrogative`, `Checking`), plus `Emphasis` for a
  trailing "!". Reading "can you X" as a request is a realization under the
  `Interrogative()` facet, never a decision in the prompt.
- **Mark what the message did to itself:** corrections, negations, vagueness, emphasis,
  misspellings, asides. Markers are named `Mark*` (`MarkCorrection`, `MarkMisspelling`,
  `MarkFuzzy`, `MarkEmphasis`, `MarkAside`) so a marker word said as a word stays a word:
  "my fuzzy bear" is `Fuzzy(Bear())`. `MarkFuzzy` and `MarkEmphasis` carry their trigger
  words first: `MarkFuzzy("or whatever", x)`.
- **Surface ambiguity and references** so they can be resolved. Every pointing word is a
  `Ref` holding the words used. Outside the message, `Ref("it")`, which memory resolves
  (`ir-spec.md` Part 8.2). Inside the message, `Ref("it", $x)`, pointing at a binding, so
  the word survives and the Ears' reading of it is visible.
- **Keep layout and filler.** Headings, list items and fenced blocks are kept as `Heading`,
  `Item` and `Block`; words that carry nothing for the request go in `MarkAside`. Evaluation
  projects them away where they do not matter (`ir-spec.md` Part 2).

The worked intent for all of this, case by case, is `eval/ears/gold.md`.

## What the Ears is not for

**Choosing the graph's names.** The Ears names the idea in the words the user used. If the
graph calls it something else, the graph connects the two: `SynonymOf`, learning, and the
re-parse after learning (`ir-spec.md` Parts 8.1 and 8.3). "bigger" is `Bigger(...)`. Whether
that realizes as `GreaterThan` is the graph's business, not the parser's.

It also does not compute, normalise, or decide what the user meant beyond marking it.

## Never add to the prompt

1. **Graph vocabulary.** No Concept name chosen because the graph happens to realize it:
   `ShiftHours`, `DayAfter`, `HourBefore`, `Double`, `GreaterThan`. No vocabulary list by
   default. The list was removed on 2026-09-21 for this reason, and examples that carry the
   same names are the same list in disguise.
2. **Translations for particular phrasings.** "3 hours ago is `ShiftHours(Time(), -3)`",
   "clock arithmetic, not numeric addition", "double is not a number, write `Double(21)`".
   Each one is a synonym or a realization the graph should own.
3. **Domain guidance.** Chess notation, time, money, code. That includes text injected at
   run time from the graph: the prompt takes no per-domain guidance block.
4. **A rule or example that exists to fix one case.** Every rule must be about form or
   marking and must hold for any message. A one-case fix goes in a repair, in the graph, or
   nowhere. The prompt is saturated (`design/README.md`): each extra rule measurably costs
   accuracy somewhere else, and examples get copied verbatim.
5. **Eval cases.** Never copy a message from `eval/ears/cases.json` or `eval/ears/gold.md`
   into the prompt. The
   headline score only means something on messages the prompt does not show.
6. **Answers.** Nothing about what the result of a message should be.

## What may go in

- **Form** (`ir-spec.md` Part 9): lines and assignments, the depth limit, positional
  arguments, capital letters and parentheses, the output format.
- **The IR's own closed vocabulary:** the interrogatives and their fused forms, `Tell`, the
  markers (the `Mark*` family, `Please`, `Heading`, `Item`, `Block`, `InlineCode`), `Ref`,
  `Qualify`, `Ordinal`, `Not`, the deictics `Me`, `You`, `We`, and the value readings
  `Number`, `Date` and `Time` with `Am` and `Pm`. These are part of the language, not the
  graph. A clock time is a reading, `Time(7, Am())`; an amount is its unit around its
  number, `Hours(3)`, where the unit is the user's word.
- **Word order:** the first thing said is the head; the question word leads a question.
- **Never `Mood(...)`:** mood is added mechanically after the Ears, so the prompt does not
  teach it.
- **Examples, sparingly,** each illustrating a form or marking rule, in everyday words, and
  each earning its place in the eval.

## Where a fix goes instead

| Symptom | Where it is fixed |
|---|---|
| a name differs from the one the graph uses | the graph: `SynonymOf`, learning, the re-parse loop |
| a mechanical slip: a digit written as a word, single quotes, a stray `?` | `lift.ts` repairs or `check` in `ears.ts` |
| a line missing its mood, or a "?" / "!" not marked | `mood.ts`, never the prompt |
| a reference the parse marked but nothing resolved | resolution against memory (`runtime/references.ts`) |
| the reading lost part of what was said | the prompt, as a general form or marking rule, measured |

## Changing the prompt

Every change is measured. The harness runs the real `hear` over `eval/ears/cases.json` and
`eval/ears/gold.md`, three samples each, and scores fidelity checks that never ask about
graph names. Gold cases derive their checks from the gold reading.

```bash
pnpm eval:ears --label before
# change the prompt
pnpm eval:ears --label after --compare packages/concept-runtime/eval/ears/results/<before>.json
# a mechanical repair can be tried on saved outputs, with no model calls:
pnpm --filter @napkin/concept-runtime exec node dist/ears/eval/run.js --rescore <run.json>
```

When the expectations change (a gold reading, a case), re-score the old run before
comparing: a diff across different expectations mixes two changes.

Keep a change only if the headline does not drop and no source group regresses. The
headline excludes cases the prompt shows as examples. At equal score, the shorter prompt
wins. A single case moving by one sample is noise; judge on the headline.

Add a case when a new failure is found, in the file, never in the prompt. A case asserts
what must survive (`keeps`), what must be marked (`has`), and where holes must or must not
be (`question`, `interrogative`). It never asserts a particular graph name.

The model is `qwen3.5:4b`, measured against 2b, 9b and 27b. Do not change it without data
(`research/ir-parser-experiments/README.md`, Findings 5 and 10).
