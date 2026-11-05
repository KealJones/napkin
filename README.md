# Napkin

An AI architecture in which **everything is a Concept**. It thinks, speaks, and acts using
one kind of unit, and it grows by adding more of them. No language model hears or speaks for it.

```
$ pnpm napkin "What is 5 times three?"

heard (frames)  Value(Multiply(5, 3))
result          Answer(15)
said (graph)    15.

why
  Worked out by its words' holes: Multiply(5, 3).
  multiply took 5 and 3.
```

No grammar read that. "times" is a Concept with two holes (it takes two numbers), "three" is
a number the graph knows, and "what is" asks for what the rest comes to: the words fill each
other's holes, and the reading that fills the most, from the sides they are usually filled
from, wins.

Status: runtime **0.23.4** (`packages/concept-runtime/package.json`), last worked on
2026-10-17. The next version became a separate project, [Noodle](https://github.com/KealJones/noodle);
see [History](#history).

## The idea

A Concept is one self-contained unit of three parts:

| part | what it is |
|---|---|
| **identity** | a `CapitalizedName` |
| **relations** | asserted facts, themselves Concepts: `IsA(Bird())`, `SynonymOf(Multiply())` |
| **realizations** | how it means, or how it acts, per usage context |

There is no separate rules table, action registry, fact store, or native-function map.
Arithmetic, HTTP, file access, hearing a message, and the evaluator's own entry are all
Concepts of this shape. They are written in N-Con, Napkin's text form for Concepts (`.ncon`
files, "napkin concept"), and most of what Napkin knows how to do lives in the 42 packs in
`packages/concept-runtime/packs/`: `core.ncon`, `reading.ncon`, `english.ncon`, `coding.ncon`,
`units.ncon`, `pursue.ncon` and the rest.

### Residual evaluation

The load-bearing rule: **an expression with no applicable realization evaluates to itself.**
It is not an error. It is a value.

Everything leans on this. The reader can name a Concept that does not exist, because
invention is never fatal. Structure the system cannot execute survives intact instead of
being destroyed, which is what lets a reading record corrections, misspellings and vagueness
and still be runnable. And a residual is exactly the signal that something needs learning.

### Context selects behaviour

A usage context is an unordered **set of facets**, matched by subset:

```
Fetch()  in Execution()                          an HTTP request
Fetch()  in Walking(Dog())                       an activity
Fetch()  in Context(Describe(), Walking(Dog()))  what it means there
```

Two facets beat one. A realization naming only the situation still applies. Facets compose
additively, so asking for a description keeps the situation being described.

### Reading a message

A message is read by its words' holes (`src/frame/compose.ts`, the holes themselves graph
facts in `packs/reading.ncon`): each word's senses say what it can be and what it takes, and
neighbouring pieces join where one fills a hole the other leaves open. There are no sentence
shapes and no grammar in code. This is the "one reader", and it is the default (`--hear frames`).

- **Several readings are kept** and scored. A word's sense is chosen by the words around it,
  the conversation, and what the graph knows; when two readings are close, Napkin asks
  ("born when, or where?") and keeps the answer.
- **A hole the words leave open** is filled from the conversation or memory
  (`src/frame/context.ts`), or asked about.
- **Frames inside frames**: reported speech ("I told them that X"), clauses joined by "and",
  statements that become facts ("my name is Sam", "remember that ...").
- **Word problems**: amounts, holders, rates and units ("50 minutes at $12 an hour"), sums in
  symbols (`(2+3)*4`), and dates ("the 12th of may").
- **Weights are learned**: picks, "yes" and "no" adjust which sense won and which hole a word
  filled; the hand-set costs are only the prior.

The older readers (the rules parser and `Hear()` in `packs/hearing.ncon`) are off the chat
path and kept only to compare against: `--hear rules`, `--hear old`.

### It learns

```
$ pnpm napkin "what is chess?"

learned  wikidata: Chess: Q718: IsA(BoardGame()), ...
result   Describes(Chess(), List(IsA(BoardGame()), ...))
```

Learning is on by default (`--no-learn` answers from the graph alone). Realize, collect what
came back residual, try the graph, then what the world says (Wikidata, Wiktionary, the
Wikimedia sister projects, ATOMIC 2020 and ConceptNet for what follows from an event), save,
re-answer. Everything learned is sourced and stamped. The graph is the packs plus
`~/.napkin/store.ncon`, a journal that grows as it learns (`--compact` rewrites it as what it
holds now).

Last of all, a teacher model (Gemini through a worker, `src/research/teacher.ts`) is asked
about a word or an event no source has: whether a word is a word, a misspelling or a name, and
what it is; how one feels and what one wants after an event. What it says is kept as facts in
the graph's own relations, stamped as taught, and asked once. Napkin answers from what it
holds; the model's text is never the reply. `--no-teacher` turns it off.

It can also study ahead of being asked: `--study money debt` learns topics and whatever they
turn out to need, and `--study --everyday` works through a curriculum, foundations first.

### It works without being asked

```
$ pnpm napkin --agenda
learn     Backgammon    left residual in Backgammon()

$ pnpm napkin --exist
learn Backgammon
  did: wikidata: Backgammon: Q11379: IsA(BoardGame()), ...
```

Nothing invents a goal for it. **The agenda is already written down**: every residual is
something it could not realize, every orphan a cluster attached to nothing. It reads its own
trace for what it could not do, and works on that. Unattended work is bounded by a budget
(`--budget`), and its envelope is narrow: it may research and learn, and nothing else.

Some repairs need nothing from outside at all. A Concept whose synonym relation was never
turned into behaviour gets the forwarding realization derived, so `Multiplication(6, 7)` can
answer 42 once `SynonymOf(Multiply())` is known. `Pursue` keeps a route that worked as a
reusable realization (a Chunk), and `Predict` finds a sequence's rule among the graph's own
operations.

### It forgets

```
$ pnpm napkin --forget
nothing to forget: an only-way-to-do-something is never collected
```

Append-only would grow without limit, and a brain does not keep every habit it ever formed.
A realization is collected only when another covers the same pattern and context, it is the
older of the pair, and it has gone unused. That middle condition is the safety property:
forgetting can lose an alternative, never a capability. `--forget`, `--consolidate` and
`--collect` show what they would do; `--commit` applies it.

### It works on code

```
> explain this code: `function add(a, b) { return a + b }`
Here's what it does: a function add that takes a and b, and gives back a plus b.

> fix this `if (x = 5) { go() }`
Fixed: `x = 5` compares now: `x === 5`.

> run `function f(n) { return n * 2 }` with 21
It gives 42.

> make g so that g(2) = 5, g(3) = 7, g(10) = 21
Here's g, which gives back every example you gave:
function g(x) { return ((x * 2) + 1) }
```

Code in a message, a file named in it, or a file attached in the studio is read as the code IR
(tree-sitter for TypeScript, JavaScript and Python), then explained, checked, fixed, run (in an
isolated context), converted to another language, or saved, each by a Concept in
`packs/coding.ncon`. A function can also be asked for by examples of what it gives: every
operation the graph can work out is tried on them, the way Predict finds a sequence's rule,
and the simplest rule that fits them all is written out. Napkin cannot run shell commands.

## Running it

Node 22.13 or newer and pnpm.

```bash
pnpm install && pnpm build

pnpm napkin "What is 5 times three?"       # a turn, end to end (learning on)
pnpm napkin --no-learn "..."               # answer from the graph alone
pnpm napkin --fresh "..."                  # do not load or save the persistent graph
pnpm napkin --expr 'Add(2, 3)'             # realize an expression directly
pnpm napkin --hear old "..."               # an older reader, to compare (also: rules)
pnpm napkin --study money debt             # learn topics ahead of being asked
pnpm napkin --agenda                       # what it would work on next, unprompted
pnpm napkin --exist                        # work on that agenda, bounded by --budget
pnpm napkin --forget                       # what would be collected (--commit to apply)
pnpm napkin --sources                      # learned facts by where they came from
pnpm napkin --seed                         # seed a graph and report
pnpm studio                                 # build, then the studio at http://127.0.0.1:4173
pnpm test
```

Run `pnpm napkin` with no arguments for the full list (`--import`, `--evidence`,
`--activate`, `--consolidate`, `--collect`, `--compact`, `--graph`, and more).

**The studio** (`apps/studio-client`, React and Vite; `apps/studio-server`, Node) browses the
graph, inspects and edits realizations, shows a turn happening with its trace, and has a chat
page. The port is `NAPKIN_PORT` (default 4173), the graph `NAPKIN_GRAPH`.

**In the browser.** The runtime's host files sit behind `#platform`, with Node and browser
adapters. The `pages` workflow publishes the studio as a static GitHub Pages site where the
runtime runs in the visitor's browser (a Worker over OPFS, or in memory where OPFS is missing),
from the packs and an empty store. No model reads or teaches there.

**Live probes.** The development sandbox cannot reach Wikidata, Wiktionary or the teacher, so
network checks run in CI through the `live-probe` workflow (inputs `say`, `bench` such as
`gsm8k 50`, and `test`); results land on the `live-probe` branch.

## Layout

```
packages/concept-runtime/
  packs/        the 42 .ncon packs: what the network starts with and how it behaves
  src/
    concept/    the expression language, matching, the unit
    store/      the graph, the two-directional relation index, cells, the journal
    runtime/    facet contexts, selection, evaluation, the trace, one turn, Exist
    frame/      the one reader: senses, holes, composition, frames, the context lookup
    resolve/    holes, readings, fit, rereading, what was asked
    ears/       the old rules hearing (off the chat path), names, spelling, mood
    situation/  the old word-problem reader (off the chat path) and learned meanings
    learn/      the learning loop, study and curricula
    research/   Wikidata, ATOMIC, ConceptNet, why-chains, the teacher
    memory/     conversations and individuals remembered across turns
    code/       the code IR: reading with tree-sitter, importing JavaScript, formatting N-Con
    platform/   the Node and browser hosts
    seed/       seeding the graph, grounding data, the DailyDialog corpus
  scripts/      benchmarks, hearing comparisons, the live probe, weight learning
apps/
  studio-client/   the studio UI and its browser Worker
  studio-server/   the studio's API over the persistent graph
editors/vscode-ncon/   syntax, formatting and previews for .ncon files
```

Realization bodies are IR: written as JavaScript, converted with `importTypeScript`
(`src/code/import.ts`) into `Code(ir=...)`, and kept in a pack. Every pack must pass
`formatNcon`, and a test checks it.

Every commit that changes the runtime bumps its version (a patch for a fix, a minor for a new
mechanism or a change to how something is heard or said), and every exported graph names the
runtime that made it (`Journal(..., runtime="0.23.4+...")`). `AGENTS.md` has the rest of the
rules for changing Napkin.

## Design

The specs came first and the runtime was written from them, not the other way round.

- **[concept-spec.md](.agents/planning/2026-09-16-concept-ai-system/design/concept-spec.md)**:
  what a Concept is; realization, evaluation, context, search, relations, persistence.
  Part 18 tabulates 27 contradictions found in the requirements and how each resolves.
- **[ir-spec.md](.agents/planning/2026-09-16-concept-ai-system/design/ir-spec.md)**:
  the expression language and the parser contract.
- **[seed-concepts.md](.agents/planning/2026-09-16-concept-ai-system/design/seed-concepts.md)**:
  what the network starts with, and what is deliberately omitted.
- **[frames.md](.agents/planning/2026-09-16-concept-ai-system/design/frames.md)**: hearing by
  senses and holes, the one reader; progress in [tasks/todo.md](tasks/todo.md).
- **[pursue-predict.md](.agents/planning/2026-09-16-concept-ai-system/design/pursue-predict.md)**:
  what Pursue, Predict and Judge answer, and what they do not yet.
- **[the code appendix](.agents/planning/2026-09-16-concept-ai-system/design/ir-spec-appendix-code.md)**:
  234 lines of real JavaScript translated node for node, machine-validated.
- **[the experiments](.agents/planning/2026-09-16-concept-ai-system/research/ir-parser-experiments/)**:
  the parser contract is measured, not argued. Raw per-sample output included.

### Nothing is privileged

The rule the earlier attempts broke, stated as a check you can run:

> Can you change the system's behaviour by editing ordinary Concepts, without editing a
> registry, a router, a dispatch switch, a model seat, or an evaluator special case?

Before Napkin was written, its three predecessors were audited against that question
([prior-versions-audit.md](.agents/planning/2026-09-16-concept-ai-system/research/prior-versions-audit.md)).
Each had a hidden engine outside its concepts:

| version | what it proved | where behaviour escaped the Concepts |
|---|---|---|
| Soup (TypeScript) | Concepts can own composable rewrite rules; a turn can carry a readable trace | hardcoded realization phases; native and effect code as closures that were never saved; the session as a second execution path |
| Spoon v1 (Rust) | IO, persistence, effects, a CLI and planning can form a real system | separate Concept, Action, Fact and Clause types; a fixed kernel that wins over the graph |
| Spoon v2 (Rust) | one term model can unify entities, operations, facts and rules; realizations can compete | a closed enum of realization kinds; a separate native-function registry; fixed Ears, Mouth and Teacher seats |

So the evaluation loop here knows exactly six identities (`Concept`, `Realization`, `Code`,
`Context`, `Suppresses`, `IsA`), and every one is **structural**, about the form of a unit,
never semantic. It does not know that `Multiply` exists. A test asserts this.

Six is not zero, and pretending otherwise is how the earlier attempts drifted. The list is
written down so a seventh is visible.

## History

Napkin is the fourth in a line of attempts at the same idea: an assistant whose knowledge
lives in a graph it can read and grow, not in model weights.

[EKG AI](https://github.com/KealJones/ekg-ai) (August 2026) →
[Spoon](https://github.com/KealJones/spoon) (August to September) →
[Soup](https://github.com/KealJones/soup) (September 10 to 15) →
**Napkin** (September 16 to October 17) →
[Noodle](https://github.com/KealJones/noodle) (September 30 to October 4)

- **Sep 16, planning.** The [rough idea](.agents/planning/2026-09-16-concept-ai-system/rough-idea.md)
  asked for an AI where everything is a Concept, with an always-running `Exist`, and said
  hearing "should initially depend on a small local model" through an `OllamaLocalLLM`
  Concept. The [idea honing](.agents/planning/2026-09-16-concept-ai-system/idea-honing.md)
  and the prior-versions audit named what the earlier projects got wrong.
- **Sep 17 to 20, the runtime.** The concept runtime and the studio; research before
  teaching, so the teacher is a last resort; self-reference, ambiguity, forgetting and
  `Exist`; studying topics ahead of being asked.
- **Sep 20 to 25, the model squeezed out.** "Stop answering from the model" (Sep 20); rules
  that read messages well enough not to need it, and an Ears lab in the studio to compare
  LLM, rules and hybrid readers (Sep 23); "English replaces the Mouth: results say
  themselves, and no model words a reply", and "no model hears or speaks" by default (Sep 25).
- **Sep 23 to 24, code and packs.** The code IR, primitives a realization can be composed
  from instead of JavaScript (Sep 23). The seed moved from TypeScript into `.ncon` packs, the
  kernel split into `core.ncon`, and Pursue, Predict, Judge and Reply (answering a statement
  the way people do, predicted from DailyDialog) arrived (Sep 24).
- **Sep 25, prompt hearing.** Hearing as words that find each other, read in rounds, the idea
  that became the one reader.
- **Sep 26 to 28, anywhere.** Host files behind `#platform`, the studio on GitHub Pages with
  the runtime in a Worker, code in any language tree-sitter reads, Wikidata SPARQL for
  superlatives, dates and units from Wikidata.
- **Sep 29, versions and a new design.** The runtime got a version (0.2.0). The same day's
  [meaning-and-learning design](.agents/planning/2026-09-29-meaning-and-learning/README.md),
  written over six rounds of review, became a new project, Noodle, on Sep 30.
- **Sep 30 to Oct 10, paused** while Noodle was built. On Oct 4, Noodle's own comparison
  ([napkin-vs-noodle.md](https://github.com/KealJones/noodle/blob/main/docs/napkin-vs-noodle.md))
  found Napkin closer on the shape of the goal (small, portable, its behaviour in the graph,
  working on its own gaps) and Noodle closer on its point (learning to do things), and
  recommended a new core built from Noodle's learn-to-act loop on Napkin's runtime.
- **Oct 11 to 17, runtime 0.4 to 0.23.** Napkin took some of Noodle's lessons back: keep
  several readings, choose a word's sense by its neighbours and the conversation, learned
  weights, frames inside frames, then one reader for everything, and word problems with
  units, rates and dates.

What Napkin still lacks, by its own and Noodle's measurements: it cannot run a command, so
nothing it learns is how to do something new; research makes some answers slow; and it
reads plain everyday requests less reliably than the examples above suggest.
