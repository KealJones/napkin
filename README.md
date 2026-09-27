# Napkin

An AI architecture in which **everything is a Concept**. It thinks, speaks, and acts using
one kind of unit, and it grows by adding more of them.

```
$ napkin "What is 5 times three?"

heard    What(Multiply(5, Number("three")))
result   Answer(15)

trace
  What(Multiply(5, Number("three")))   [Execution()]
    => Answer(15)
    Multiply(5, Number("three"))       [Execution()]
      => 15
      Number("three")                  [Execution()]
        => 3
```

`three` stays a word until a realization converts it. Nothing normalized it on the way in,
because the representation is supposed to keep what you actually said.

## The idea

A Concept is one self-contained unit of three parts:

| part | what it is |
|---|---|
| **identity** | a `CapitalizedName` |
| **relations** | asserted facts, themselves Concepts: `IsA(Bird())`, `SynonymOf(Multiply())` |
| **realizations** | how it means, or how it acts, per usage context |

There is no separate rules table, action registry, fact store, or native-function map.
Arithmetic, HTTP, file access, hearing a message, and the evaluator's own entry are all
Concepts of this shape.

### Residual evaluation

The load-bearing rule: **an expression with no applicable realization evaluates to itself.**
It is not an error. It is a value.

Everything leans on this. The parser can name a Concept that does not exist, because
invention is never fatal. Structure the system cannot execute survives intact instead of
being destroyed, which is what lets a parse record corrections, misspellings and vagueness
and still be runnable. And a residual is exactly the signal that something needs learning.

### Context selects behaviour

A usage context is an unordered **set of facets**, matched by subset:

```
Fetch()  in Execution()                        an HTTP request
Fetch()  in Walking(Dog())                     an activity
Fetch()  in Context(Describe(), Walking(Dog()))  what it means there
```

Two facets beat one. A realization naming only the situation still applies. Facets compose
additively, so asking for a description keeps the situation being described.

### It learns

```
$ napkin --learn "what is chess?"

learned  wikidata: Chess: Q718: IsA(BoardGame()), ...
result   Describes(Chess(), List(IsA(BoardGame()), ...))
```

Realize, collect what came back residual, try the graph, then what the world says (Wikidata,
the dictionary), save, re-answer. Everything learned is sourced and stamped. The graph
persists to `~/.napkin/store.ncon`, a journal over the packs. No model hears, speaks or
teaches: a gap that nothing sourced can close stays a residual. It is not filled in with a
guess.

### It works without being asked

```
$ napkin --agenda
learn     Backgammon    left residual in Backgammon()

$ napkin --exist
learn Backgammon
  did: wikidata: Backgammon: Q11379: IsA(BoardGame()), ...
```

Nothing invents a goal for it. **The agenda is already written down**: every residual is
something it could not realize, every orphan a cluster attached to nothing. It reads its own
trace for what it could not do, and works on that. Unattended work is bounded by a budget,
and its envelope is narrow: it may research and learn, and nothing else.

Some repairs need nothing from outside at all. A Concept whose synonym relation was never turned into
behaviour gets the forwarding realization derived, and `Multiplication(6, 7)` starts
answering 42.

### It forgets

```
$ napkin --forget
nothing to forget: an only-way-to-do-something is never collected
```

Append-only would grow without limit, and a brain does not keep every habit it ever formed.
A realization is collected only when another covers the same pattern and context, it is the
older of the pair, and it has gone unused. That middle condition is the safety property:
forgetting can lose an alternative, never a capability.

### It works on code

```
> explain this code: `function add(a, b) { return a + b }`
Here's what it does: a function add that takes a and b, and gives back a plus b.

> fix this `if (x = 5) { go() }`
Fixed: `x = 5` compares now: `x === 5`.

> run `function f(n) { return n * 2 }` with 21
It gives 42.

> explain src/code/tree.ts
Here's what it does: it says it is Source in any language tree-sitter has a grammar for ...;
it defines functions parserFor(grammar) and readTree(text, grammar, prefix); it gives out readTree.
```

Code in a message, a file named in it, or a file attached in the studio is read as the code IR,
then explained, checked, fixed, run (in an isolated context), converted to another language, or
saved, each by a Concept in `packs/coding.ncon`.

## Running it

```bash
pnpm install && pnpm build

pnpm napkin "What is 5 times three?"       # a turn, end to end
pnpm napkin --expr 'Add(2, 3)'             # realize an expression directly
pnpm napkin --learn "what is chess?"       # close gaps before answering
pnpm napkin --agenda                       # what it would work on next, unprompted
pnpm napkin --exist                        # work on that agenda
pnpm napkin --forget                       # what would be collected
pnpm napkin --seed                         # seed a graph and report
pnpm studio                                 # browse the graph at :4317
pnpm test
```

Nothing needs a model. A message is heard by the graph itself (`Hear()` in
`packs/hearing.ncon`): each word is its own Concept and the words find each other.

## Layout

```
packages/concept-runtime/src/
  concept/     the expression language, matching, the unit
  store/       the graph, the two-directional relation index, cells, persistence
  runtime/     facet contexts, selection, evaluation, the trace, one turn, Exist
  ears/        message -> Concepts: the prompt, line lifting, repair, checks
  learn/       the learning loop and study
  research/    Wikidata and web search, as Concepts
  seed/        the Concepts the network starts with
apps/studio/   browse the graph and watch a turn happen
```

## Design

The specs came first and the runtime was written from them, not the other way round.

- **[concept-spec.md](.agents/planning/2026-09-16-concept-ai-system/design/concept-spec.md)**:
  what a Concept is; realization, evaluation, context, search, relations, persistence.
  Part 18 tabulates 27 contradictions found in the requirements and how each resolves.
- **[ir-spec.md](.agents/planning/2026-09-16-concept-ai-system/design/ir-spec.md)**:
  the expression language and the parser contract.
- **[seed-concepts.md](.agents/planning/2026-09-16-concept-ai-system/design/seed-concepts.md)**:
  what the network starts with, and what is deliberately omitted.
- **[the code appendix](.agents/planning/2026-09-16-concept-ai-system/design/ir-spec-appendix-code.md)**:
  234 lines of real JavaScript translated node for node, machine-validated.
- **[the experiments](.agents/planning/2026-09-16-concept-ai-system/research/ir-parser-experiments/)**:
  the parser contract is measured, not argued. Raw per-sample output included.

### Nothing is privileged

The rule that the three prior attempts failed, stated as a check you can run:

> Can you change the system's behaviour by editing ordinary Concepts, without editing a
> registry, a router, a dispatch switch, a model seat, or an evaluator special case?

The evaluation loop knows exactly six identities (`Concept`, `Realization`, `Code`,
`Context`, `Suppresses`, `IsA`), and every one is **structural**, about the form of a unit,
never semantic. It does not know that `Multiply` exists. A test asserts this.

Six is not zero, and pretending otherwise is how the earlier attempts drifted. The list is
written down so a seventh is visible.
