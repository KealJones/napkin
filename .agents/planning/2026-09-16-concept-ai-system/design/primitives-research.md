# Primitives research: prior art, current code-level primitives, and a proposed minimal set

> Update 2026-09-27: Direction, DirectionOf, Opposite and Traverse now exist (`packs/grounding.ncon`,
> from `sources/grounding`), and Reverse and Invert ground into `Traverse($xs, Direction(Last(), First()))`
> from their Wiktionary glosses. The "missing" rows below predate that.

Written as research input for the "lowest-level primitives" question: what should the small
set of host-implemented (`Code(...)`) Concepts be, such that everything else, including
dictionary-gloss mechanisms like `Reverse = Traverse(xs, Opposite(DirectionOf(xs)))`, is a
composition of them. This is research input, not a spec; nothing here has been built.

## 1. Prior research already in the repo

### `.agents/planning/2026-09-16-concept-ai-system/research/seed-dataset-sources.md`

This is the one substantial prior treatment of lowest-level linguistic/semantic primitives.
It proposes a four-layer seed dataset, and Layer 1 is exactly this question:

- **Layer 1, "primitive layer"**: the **65 NSM (Natural Semantic Metalanguage) semantic
  primes** of Anna Wierzbicka and Cliff Goddard, plus about 50 "semantic molecules" (man,
  woman, water, etc.), plus Swadesh 100/207 and the Leipzig-Jakarta 100 via Concepticon.
  Quoting the file: "NSM primes give you a principled, universally-lexicalized base into
  which all other Concepts can (in principle) decompose, the same role `Plus`/`Do`/`Happen`
  already implicitly play in Napkin." (line 77)
- It explicitly flags the primes as "claimed universal and indefinable" and "the natural
  bottom of a decomposition hierarchy" (line 43), while also noting in the Caveats section
  that "the 65-prime count is a theoretical claim, not an empirically closed set, some
  linguists dispute universality" (line 110).
- It notes there is no licensed machine-readable dump of the NSM tables; they would have to
  be hand-transcribed from Wierzbicka (2021, *Russian Journal of Linguistics*).
- It also surveys adjacent formalisms as design references rather than import sources:
  AMR/UMR (sense-disambiguated concepts with ARG roles), Grammatical Framework (English-named
  abstract syntax as interlingua, the same "English name as key, opaque ID as identity"
  problem Napkin has), FrameNet/PropBank/VerbNet (frame and role inventories), and
  Cyc/SUMO (upper ontologies, SUMO recommended over Cyc since Cyc is defunct/commercial).
- A later note at the top of the file (added 2026-09-22, lines 1-28) corrects several of its
  own recommendations against the current specs: identity is the name, not an imported ID
  (`concept-spec.md` Part 3); WordNet senses should not be imported wholesale because of the
  Identity/Chore collapse; only import a small closed relation family
  (`IsA`, part/whole with inverse, antonymy, `UsedFor`/`CapableOf`/`Causes`); MASSIVE/intent
  datasets are an Ears evaluation corpus, not seed vocabulary.

No other prior-art document proposes a primitive/prime inventory. There is no NSM/Wierzbicka
discussion anywhere in `packs/*.ncon` itself; the idea lives only in this one research file.

### Adjacent but different ideas found elsewhere

- **`.agents/planning/2026-09-16-concept-ai-system/design/emergent-judgment-plan.md`** line
  99-102 references Minsky's frames and **Schank's conceptual-dependency scripts** as the
  precedent for "expectations" (default-filled slots on a request), not as a primitive
  vocabulary for word meanings. Quote: "What an LLM does when it 'knows' a jam website needs
  a checkout is complete a pattern it has seen many times. The symbolic version of that is
  old and good: Minsky's frames and Schank's scripts." This is about implication/defaults,
  a different problem from grounding a word's meaning into a runnable composition.
- No document in the repo mentions "image schema" (Lakoff/Johnson) at all.
- **`concept-spec.md` Part 10** and **`seed-concepts.md` Part 11** discuss "Primitives" but
  mean something narrower and unrelated to NSM: the wrapping rule for bare JS-level values
  (`5` vs `Number(5)`), i.e. host primitive types, not semantic primes.
- **`ir-spec.md` Part 10.6** ("Running code: primitives, compiling, and the cache", line 899)
  is the closest thing to a spec for the current code-level primitive layer: it is the table
  audited in Section 2 below, described as "about 150 primitives" (`ir-guide.md` line 168).

Conclusion: the repo has one serious prior proposal for a semantic-prime layer
(NSM, in `seed-dataset-sources.md`), it was research input never acted on, and it has not
been reconciled with the current, much narrower "code primitives" layer described below.
Nothing in the repo currently tries to ground word meanings (dictionary glosses) into
compositions of a small primitive set; the current `Code(...)` primitives are a
computation/runtime layer, not a semantic-decomposition layer.

## 2. Audit of current code-level primitives

Source of truth: every Concept in `packages/concept-runtime/packs/{code,core,basic}.ncon`
whose realization body is `Code(ir = ...)`, listed with
`node packages/concept-runtime/scripts/body.mjs list <pack>` (dist already built; script
only scans literal `body = Code(` occurrences, so this is exhaustive and not a sample).

### `packs/code.ncon`: 151 distinct Code-bodied Concepts (163 realizations, some overloaded)

All are `IsA(CodePrimitive())` (spot-checked `Reverse`, `AddValues`; confirmed by
`ir-guide.md` line 168's "about 150 primitives" figure, which matches). Grouped:

| Group | Members |
|---|---|
| **Arithmetic** | `AddValues`, `SubtractValues`, `MultiplyValues`, `DivideValues`, `RemainderOf`, `NegateValue`, `RoundDown`, `RoundUp`, `RoundNearest`, `AbsoluteValue`, `SquareRootOf`, `CubeRootOf`, `RaiseToPower`, `Largest`, `Smallest`, `NotANumber`, `Infinite`, `IsNotANumber`, `IsFiniteNumber`, `IsWholeNumber`, `ToNumber` |
| **Comparison** | `Above`, `Below`, `NotAbove`, `NotBelow`, `CompareText` |
| **Logic** | `Equals`, `NotEquals`, `Identical`, `NotIdentical`, `Not`, `And`, `Or`, `Truthy`, `Falsy`, `IsNothing` |
| **Sequence / list** | `List`, `Length`, `Concat`, `Includes`, `Unique`, `First`, `Map`, `FlatMap`, `Filter`, `Reduce`, `Reverse`, `FirstSatisfying`, `IndexSatisfying`, `AnySatisfies`, `AllSatisfy`, `Sort`, `Slice`, `Element`, `AtPosition`, `Join`, `AsList`, `WithElement`, `IndexOf` |
| **Text** | `ToText`, `Json`, `Lowercase`, `Uppercase`, `StartsWith`, `EndsWith`, `Split`, `PadStart`, `Matches`, `MatchesPattern`, `MatchOf`, `Replace`, `Regex`, `JoinText` |
| **Sets / maps** | `NewSet`, `NewMap`, `SetAdd`, `SetHas`, `MapGet`, `MapSet`, `SizeOf`, `ValuesOf` |
| **Expressions as data / records** | `Fields`, `Record`, `Argument`, `Head`, `Arg`, `ArgNamed`, `MakeCall`, `IsCall`, `Evaluate`, `TypeOf`, `HasField`, `FieldOf`, `Arguments`, `Throw`, `Quote`, `FormatExpression`, `CallOf`, `ParseExpression`, `Substitute` |
| **Control (loops/calls)** | `Call` (in `basic.ncon`, see below), `CallWith`, `Steps`, `LoopOver`, `LoopWhile`, `LoopDoWhile`, `LoopFor`, `LoopNext`, `LoopStop`, `LoopReturn`, `IsLoopReturn`, `LoopReturnValue`, `Merge` |
| **Time** | `CurrentInstant`, `InstantFrom`, `LocalInstant`, `UtcMilliseconds`, `YearOf`, `MonthOf`, `DayOf`, `WeekdayOf`, `HourOf`, `MinuteOf`, `MillisecondsOf`, `IsoText` |
| **Graph / meta (runtime introspection)** | `Subjects`, `Holds`, `Closure`, `TruthOf`, `Claimed`, `Known`, `IsKnown`, `ClaimsOf`, `ClaimsWithObject`, `ClaimsWithSubject`, `Assert`, `MentionsOf`, `MintIdentity`, `StampOf`, `StampsBetween`, `CollectStamps`, `SeedUnit`, `UnitOf`, `AllUnits`, `Ambient`, `CurrentCause`, `CurrentContext`, `Rank`, `ForgetTurns`, `Events`, `AddRealization` |

### `packs/core.ncon`: 5 Code-bodied Concepts

`Concept`, `Bind`, `Ref`, `Mood`, `Text`. These are the structural/host-named Concepts
`ir-guide.md` line 167 calls out ("the Concepts the host names"): expression construction and
binding primitives that the evaluator itself needs, not domain computation.

### `packs/basic.ncon`: 9 Code-bodied Concepts

`Sequence`, `If`, `Try`, `Cell`, `Get`, `Set`, `Interrogative`, `Read`, `WikidataSearch`,
`WebSearch`. Control flow (`Sequence`/`If`/`Try`), mutable cells (`Cell`/`Get`/`Set`), and
three world-reading effects (`Interrogative` dispatch, `WikidataSearch`, `WebSearch`).
`Add`/`Subtract`/`Multiply`/`Divide` also live in `basic.ncon` (line ~3567) but are
**not** `Code(...)` bodies; they are Concepts named without `IsA(CodePrimitive())` whose
realization composes down to the `*Values` code primitives in `code.ncon` (confirmed:
`Concept(Add())` at `code.ncon:2272` has no body, and `code.ncon:2877`'s `AddValues` is the
one with `IsA(CodePrimitive())` and a `Code(...)` body). This is exactly the
composition-over-primitive pattern the task is asking to generalize: `Add` is the surface
word/operator, `AddValues` is the primitive it grounds into.

### `To(` (JavaScript/Python emission) coverage

`packs/javascript.ncon` has 100 distinct `To(` heads, `packs/python.ncon` has 50. Spot-checks:

- Operators that are IR-level source syntax (`Add`, `Subtract`, `Multiply`, `Divide`,
  `GreaterThan`, `LessThan`, `List`, `Map`, `Filter`, `Reduce`, `Length`, `Includes`,
  `Concat`) have `To(` rules in one or both languages, because they correspond to source
  operators or built-in methods (`+`, `.map()`, `.filter()` etc.).
- The **graph/meta group** (`Subjects`, `Holds`, `Closure`, `TruthOf`, `Claimed`, `Known`,
  `Assert`, `MintIdentity`, `StampOf`, `Rank`, `Events`, `Ambient`, `CurrentContext`,
  `CurrentCause`, `ForgetTurns`, `SeedUnit`, `AllUnits`, `UnitOf`, `IsKnown`, `ClaimsOf`) has
  **zero** `To(` rules in either language. This is expected and correct: these are
  Napkin-runtime-only introspection primitives with no JavaScript or Python source-syntax
  equivalent, so they cannot be emitted as foreign-language code; they only run inside
  Napkin's own evaluator.
- A larger group of value-level primitives (`AddValues`, `SubtractValues`,
  `MultiplyValues`, `DivideValues`, `Reverse`, `Sort`, `Unique`, `First`, `Split`, `Join`,
  `Slice`, `Element`, `AtPosition`, `Lowercase`, `Uppercase`, `StartsWith`, `EndsWith`,
  `Replace`, `IndexOf`, `NewSet`, `NewMap`, `SetAdd`, `MapGet`, `Half`, `Double`) also has
  **zero** direct `To(` rules. These are not runtime-only, though: they are the primitives
  the surface operators (`Add`, `Reverse`'s callers, etc.) compose down into, and the
  surface operator is what gets a `To(` rule. This mirrors the `Add`/`AddValues` split above
  and suggests the emission layer is keyed to source-syntax-shaped Concepts one level above
  the raw primitive, not to the primitive itself.

## 3. Proposed minimal primitive set

Two tiers, as requested. This section is the honest, unbuilt proposal; nothing here exists
in the packs beyond what section 2 already lists.

### Tier A: value/computation primitives

Most of these already exist as `CodePrimitive` Concepts (section 2) and would stay as they
are. The gaps are the ones the task's own example calls out: `Reverse` is currently a
primitive (`code.ncon:4311`, `IsA(CodePrimitive())`, hand-written JS `ir`) rather than a
composition, which is precedent for the opposite of what a "ground everything into
primitives" design wants for anything that has a decomposable gloss.

| Primitive | Status | Note |
|---|---|---|
| Sequence traversal (`Map`, `Filter`, `Reduce`, `First`, `FlatMap`) | exists, `code.ncon` | already the base other list ops could compose from |
| `AtPosition` / `Element` (index access) | exists, `code.ncon` | |
| `Length`, `SizeOf` | exists, `code.ncon` | |
| `Concat`, `Merge` | exists, `code.ncon` | |
| Order/`Sort`, `Largest`, `Smallest` | exists, `code.ncon` | |
| Comparison (`Above`/`Below`/`Equals`/`Identical`) | exists, `code.ncon` | |
| Direction / `DirectionOf` | **missing** | needed to compose `Reverse` per the task's own example; no `Direction` or `Opposite` Concept exists anywhere in `packs/*.ncon` (checked) |
| `Opposite` (of a direction, a value, a boolean) | **missing** | same gap; would let `Reverse`, `Negate`, `Not`, and antonym-style words share one mechanism instead of each being its own primitive |
| `Traverse` (walk a sequence in a given direction) | **missing** | `Reverse` is currently hand-coded (`code.ncon:4311`) instead of `Traverse(xs, Opposite(DirectionOf(xs)))`; this is the concrete example the task cites, and it is not yet done that way |
| Part/whole (`PartOf`/`HasPart`) | exists as a **relation**, not a computation primitive (`basic.ncon:5541`) | fine as-is; part/whole is structural, not something to execute |
| Count (`Length`/`SizeOf`) | exists | already covers "how many" |
| `Half`/`Double`/`Twice` | exist, but as **composed realizations** in `everyday.ncon` (`Half($x) = Divide($x, 2)`), not primitives | this is already the target pattern; good precedent to reuse for `Reverse` |

### Tier B: linguistic/semantic primes (NSM-style), mapped to Napkin

The 65 NSM primes (Goddard & Wierzbicka) are grouped by category below. For each: whether a
Napkin Concept already exists for it (checked against all `.ncon` packs), whether it would
need a host implementation (Tier A primitive) or is purely structural (a relation/context),
and one example gloss it would ground. Primes that do not map to executable behaviour are
marked honestly rather than forced.

| NSM prime category | Primes | Napkin status | Executable? | Example gloss |
|---|---|---|---|---|
| Substantives | I, YOU, SOMEONE, PEOPLE, SOMETHING/THING, BODY | `Me()`/`You()` exist (`seed-concepts.md` Part 11); `SOMEONE`/`SOMETHING` map to question-word kinds (`Who`/`What` ask for), not standalone Concepts | mostly structural | "someone" grounds via the interrogative-kind mechanism already in `seed-concepts.md` ("Answer by kind") |
| Relational substantives | KIND, PART | `IsA` (kind/taxonomy) and `PartOf`/`HasPart` (`basic.ncon:5541`) both exist | structural (relations) | "a wolf is a kind of dog" is `IsA` |
| Determiners | THIS, THE SAME, OTHER/ELSE | none found as Concepts | structural (identity/equality, already covered by `Equals`/`Identical`) | "the same" grounds directly into `Identical($a,$b)` |
| Quantifiers | ONE, TWO, SOME, ALL, MUCH/MANY, LITTLE/FEW | `Number`, count via `Length`/`SizeOf` exist; `ALL`/`SOME` map to `AllSatisfy`/`AnySatisfies` (already primitives) | executable, mostly already there | "all of them satisfy X" is literally `AllSatisfy($xs, $f)` |
| Evaluators | GOOD, BAD | not found; `judgment-research.md`/`judgment.ncon` model preference/evidence but explicitly refuse to store a value verdict as a fact (per `AGENTS.md`: "Judgment never stores value verdicts") | **not executable as a primitive on purpose** | this is the one place the architecture's own rule blocks a direct NSM mapping; good, honest gap |
| Descriptors | BIG, SMALL | not found | would need a comparison-against-scale mechanism (composable from `Above`/`Below` plus a reference value), not yet built | "big" grounds into "above some contextual reference," same shape as `judgment-research.md`'s qualitative-reasoning research on reference points |
| Mental predicates | THINK, KNOW, WANT, FEEL, SEE, HEAR | `Known($x)`/`IsKnown($id)`/`Claimed` exist for KNOW; `Believe` exists per `README.md` line 118 ("Believe keeps lasting claims"); WANT/FEEL/SEE/HEAR have no Concepts | KNOW is executable now; WANT/FEEL/SEE/HEAR are not, and per `AGENTS.md` ("no model hears, speaks or teaches") HEAR is deliberately a mechanism (`Hear()` in `packs/hearing.ncon`), not a semantic prime to decompose into | "know" grounds into `Known`/`Claimed`; "hear" is already a first-class mechanism, not something to build from smaller primitives |
| Speech | SAY, WORDS, TRUE | `Text`, `Speaking()` context exist; `TruthOf` exists as a primitive (`code.ncon`) | TRUE is executable (`TruthOf` returns True/False/UnknownTruth per `ir-spec.md`); SAY/WORDS are structural (the `Speaking()` realization context) | "is it true" grounds into `TruthOf($s,$p,$o)` |
| Actions, events, movement | DO, HAPPEN, MOVE, TOUCH | `Do(x)` exists as the request frame (`seed-concepts.md` Part 10); HAPPEN/MOVE/TOUCH have no Concepts | DO is structural (a frame, not a computation); MOVE would need `Traverse`-style Tier A support once directions/positions exist | "move" would ground into the same `Traverse`/`DirectionOf` primitives proposed for `Reverse` |
| Location, existence, possession, specification | BE (SOMEWHERE), THERE IS, HAVE, BE (SOMEONE/SOMETHING) | `AtLocation`-style relations do not exist yet (flagged as a Stage 2 ConceptNet import in `seed-dataset-sources.md` line 85); `HasPart`/ownership relations partly exist | structural, mostly missing | not yet groundable; matches `seed-dataset-sources.md`'s own note that these are a later import layer |
| Life and death | LIVE, DIE | none | not executable, no clear decomposition | honest gap; these are lexical facts (`IsA`/property claims about biological things), not mechanisms |
| Logical concepts | NOT, MAYBE, CAN, BECAUSE, IF | `Not` exists (`code.ncon`, primitive); `If` exists (`basic.ncon`, primitive); CAN/BECAUSE/MAYBE have no dedicated Concepts, though `Causes` is proposed as an importable ConceptNet relation (`seed-dataset-sources.md` line 85) | NOT and IF are executable now; MAYBE/CAN/BECAUSE are structural (modality, causation relations), not computations | "if X then Y" is literally `If($x,$y,$otherwise)` already |
| Augmentor, intensifier | VERY, MORE | `RaiseToPower`/comparison primitives exist for magnitude but no generic intensifier mechanism | partially executable via composition (`MORE` as `GreaterThan` plus a reference) | "more" grounds into `Above`/`GreaterThan` |
| Similarity | LIKE/AS/WAY | `SynonymOf` (relation, not this prime) exists; no general "manner/way" Concept | structural, missing | not yet groundable cleanly |
| Time | WHEN/TIME, NOW, BEFORE, AFTER, A LONG TIME, A SHORT TIME, FOR SOME TIME, MOMENT | `Now()`, `Before()`/`After()` exist as prepositions/markers (`basic.ncon:2907`, `hearing.ncon:220`, `predict.ncon:490`) but are **hearing/structural markers, not computed order** | mixed: order comparison over instants (`YearOf`, `MonthOf`, ..., time-primitives in `code.ncon`) is executable now; "a long time" (duration magnitude) is not yet a primitive | "before" grounds into instant comparison over the existing time primitives (`LocalInstant`, etc.) |
| Space | WHERE/PLACE, HERE, ABOVE, BELOW, FAR, NEAR, SIDE, INSIDE | `Above`/`Below` exist but as **numeric comparison primitives**, not spatial ones (`code.ncon`); `Inside`/`Outside` exist only as prepositions in `hearing.ncon:276-278`, no computed spatial relation | numeric ABOVE/BELOW executable now (grounds a metaphorical mapping, "5 is above 3"); spatial INSIDE/NEAR/FAR not executable, no spatial model exists | "above" for numbers is already `Above($a,$b)`; spatial "above" would need a different, ungrounded mechanism |

### Honest summary of gaps

- **Direction, opposite, and traverse** are the concrete missing Tier A primitives; the
  task's own example (`Reverse`) is currently done the old way (a hand-written primitive),
  not the new way, which is itself the clearest evidence for building these three first.
- Roughly a third of the 65 NSM primes (quantifiers, logic, some mental predicates, TRUE,
  KNOW) already correspond to existing Napkin primitives or structural mechanisms, mostly
  under different names (`AllSatisfy` for ALL, `If` for IF, `Not` for NOT, `TruthOf` for
  TRUE, `Known`/`Claimed` for KNOW).
- A second third (location/existence/possession, life/death, similarity, space, most
  descriptors and evaluators) have **no** Napkin Concept and, per the architecture's own
  rules (`AGENTS.md`: "would this be the same code for chess, a jam website, and the user's
  name?"), several of them are not mechanisms at all: GOOD/BAD are explicitly excluded by
  design (judgment never stores value verdicts), LIVE/DIE are lexical facts not procedures,
  and spatial primes need a spatial model this repo does not have.
- The remaining group (mental predicates like WANT/FEEL, SAY/WORDS) are partly covered by
  existing non-NSM-named mechanisms (`Speaking()`, `Hear()`, `Believe`) that already do the
  job NSM assigns to a lexical prime; forcing an NSM-named duplicate Concept alongside an
  existing mechanism would be the "parallel structure that needs syncing" the architecture
  explicitly warns against (`AGENTS.md`, "Derive instead of author").
- No duplicate primitives were found across `code.ncon`/`core.ncon`/`basic.ncon`; the one
  overlap worth flagging is `Add`/`Subtract`/`Multiply`/`Divide` (source-syntax operators,
  `basic.ncon`) versus `AddValues`/`SubtractValues`/`MultiplyValues`/`DivideValues` (the
  actual `CodePrimitive`s, `code.ncon`), which is not a duplicate but the composition
  pattern itself, already working correctly, and the template to extend to `Reverse`.
