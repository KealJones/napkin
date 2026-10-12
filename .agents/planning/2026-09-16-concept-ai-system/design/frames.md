# Frames: reading by senses and holes

Status (2026-10-12): built beside `Hear()` for arithmetic, claims, holes and fact questions
(`src/frame/`). Frames read first; a message frames cannot account for word by word goes to
`Hear()` as before. `napkin --hear rules` turns frames off. Measured with
`node scripts/compare-hearing.mjs` on `eval/frames/cases.json`.

## The idea

The ears do not compose. A message is a row of words, and each word brings its senses:

| Sense | Read from the graph | Holes |
|---|---|---|
| value | a number, or a number word through `Number` | none |
| op | a realization that runs, two plain-variable holes, typed or a `Program` | its typed holes; `Binds` says how tightly |
| entity | the store holds facts of it, either way round | none |
| relation | used as a fact's predicate; found by its name, what it is `Called`, or a word akin to it | the thing it is a fact of, and the value |
| kind | things are `IsA` it; found the same ways | keeps answers of that kind |
| question | `IsA(Interrogative())`; `Asks(...)` says what it wants | the hole a fact leaves open |
| pointer | `IsA(Pointing())` | the last answer the graph holds facts of |
| glue | `Helper`, `Determiner`, `Preposition`, `Conjunction`; `MarksFirst` swaps order | none |

A word typed wrong also has the senses of the words it may have meant (a slip, two words typed as
one, one typed as two, a reading the user taught), each at a cost.

## How a reading is chosen

- Values are taken by the operations beside them, in any span (a chart). Which operation takes its
  neighbour first is the graph's `Binds`, not a grammar. Brackets close a group.
- A fact question pairs a thing with one of the relation senses of a word near it, in either
  direction, and every other word must say something of the answer: a part of it ("year"), its kind
  ("movies"), or another word for the same relation. A word left over rules the reading out.
- Every reading of the whole row is scored together; one that accounts for every word that says
  something is used only when no reading meaning something else fits nearly as well.

## What it learns

- The sense taken for a word with more than one is kept on the relation with the words beside it:
  `DateOfBirth` holds `ReadBeside("born", "year")`, a stamp each time. It counts for that sense the
  next time those words are beside it.
- A slip read as another word is kept as `WrittenAs`, as the reading search does.

## Not yet

- Statements, commands beyond arithmetic, multi-sentence messages, reported speech ("I told them
  that ...") as a nested frame: all still `Hear()`.
- Weights are set by hand; only `ReadBeside` and `WrittenAs` are learned.
- A fact frame needs the facts in the graph; a question about something not yet learned goes to
  `Hear()`, which learns it, and the fact chooser (`resolve/asked.ts`) answers after.
