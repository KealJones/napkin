# Concept IR Specification

Status: draft 1. Source of truth for what the Concept intermediate representation is,
how it is written, how it is read, and why each rule exists.

This document describes the IR as it **should** be. Where the current runtime cannot yet
do something the IR requires, that is recorded as a required runtime change, not as an IR
constraint. The IR is not derived from the existing parser, matcher, or seed data.

Audience: humans, and future readers trying to understand why the IR looks like this. This
is not the parser's system prompt. The parser prompt is generated from Part 9.

Companion: `concept-spec.md` specifies what a Concept is, how realization and evaluation
work, how context selects behaviour, and how anything persists. `seed-concepts.md` lists the
Concepts the network starts with, including one for every node the Ears can emit.

**Reference convention.** A bare `Part N` means a part of *this* document. A reference to a
companion spec always names the file: `concept-spec.md Part 5.2`. This document specifies the
expression language that names those things. The two share one foundation, residual
evaluation, stated in Part 2 here and Part 8.1 there.

---

## 1. What the IR is for

Two producers write the same IR:

1. **The Ears.** A small local model converting a human message into Concepts.
2. **A code translator.** A mechanical pass converting source files into Concepts.

One consumer reads it: the evaluator, which realizes Concepts in a usage context.

These two producers have very different capabilities, and the IR must serve both without
forking. A small model needs shallow, uniform, order-preserving structure. A translator
needs enough depth and precision to round-trip a page of code. The resolution is that both
write the same node shapes, but only the Ears is bound by the shallowness rules in Part 9.

### 1.1 The central requirement

The IR must hold **both** of these at once:

- The exact structure and intent of the original input, including things that are wrong,
  retracted, vague, misspelled, emphasised, or unresolvable.
- Something the evaluator can actually run.

Every previous attempt treated these as a tradeoff. They are not, and Part 2 explains why.

---

## 2. The thesis: structure is kept, evaluation projects

An expression that has no applicable realization **evaluates to itself**. It is not an
error. It is a value. Call this a *residual*.

This single property is what lets the IR be simultaneously faithful and executable:

- `Misspelling("virginya", Virginia())` in an execution context realizes to `Virginia()`.
- The same node in a discussion context has no execution realization, so it stays exactly
  as written, and the system can talk about the fact that the user misspelled it.

So the IR does not choose between recording what was said and computing an answer. It
records what was said; **evaluation projects that record into an answer**, and the
projection is context-dependent. Different context, different projection, same IR.

Consequences that follow directly, and which the rest of this spec leans on:

- The Ears never has to decide whether something is executable.
- The Ears never has to decide whether a Concept exists (Part 8).
- Markers like `Correction`, `Fuzzy`, and `Emphasis` cost nothing when irrelevant, because
  a context with no realization for them leaves them inert and passes their payload through.
- There is no separate "metadata" channel. There is no `source=` string carrying the
  original text alongside a cleaned-up expression. Doing that would make the record inert.
  The record *is* the structure.

### 2.1 Why not a source string

An earlier proposal was to keep raw text in a `source="..."` field and let the expression
be clean. This is wrong and worth stating explicitly so it is not re-proposed.

A `Correction` preserved as prose is not usable. A `Correction` preserved as structure lets
the system notice that the user first said "weights", then said "scores", and react to
that: ask which they meant, or note the slip. That behaviour is the reason for structural
fidelity, and it only works if the correction is a node.

---

## 3. Grammar

The complete surface grammar. There is nothing else.

```
expr    := number | string | boolean | null | variable | call
variable:= "$" name
call    := Head "(" [ arg { "," arg } ] ")"
arg     := [ name "=" ] expr
Head    := uppercase letter, then letters/digits/underscore
name    := letter or underscore, then letters/digits/underscore
string  := double-quoted, JSON escapes
number  := JSON number
```

Notes and deliberate omissions:

- **No list syntax.** No `[a, b]`. Ordered collections are Concepts (Part 6.2).
- **No object literal syntax.** No `{k: v}`. Keyed collections are Concepts built from the
  named arguments the grammar already has (Part 3.2).
- **No infix operators.** No `a + b`, no `a === b`. Operators are Concepts.
- **No statements, no semicolons, no blocks.** Sequencing is a Concept (Part 6).
- **Arity is unbounded.** A call may take any number of arguments. See Part 12 for the
  runtime change this requires.
- **Named and positional arguments are both legal.** Part 9.3 says which to write and why.

The syntax is `Capitalized(...)` with parentheses because that form measurably outperforms
JSON, angle brackets, and schema-constrained output for small local models, and because
returning it directly as text is faster than conforming to a JSON schema.

### 3.1 Primitives

A Concept exists for each primitive kind (`Number`, `String`, `Boolean`), but **using a
primitive does not require wrapping it**. `5` is a legal expression. `"hello"` is a legal
expression.

Wrap a primitive only when the wrapper carries information the bare value cannot:

- `Number("three")` records that the user wrote a number as a word. The bare value `3`
  would lose that, and the realization can convert when it needs to.
- `String("r")` is unnecessary; write `"r"`.
- A specific-value Concept like `FourHundredAndNinety()` may exist and carry relations. The
  Ears does not need to know that; `490` reaches it through realization if it exists.

Rule: **the producer never normalizes.** Digits stay digits, words stay words, misspellings
stay misspelled. Conversion is realization's job.

### 3.2 Why no brackets

Three reasons, and one real cost.

**A bracket literal is not a Concept.** `[a, b]` is a value nothing can realize, relate to,
or describe. `List(a, b)` is a Concept: it can carry realizations (map, fold, length),
relations (`IsA(Collection())`), and a description of itself. In a system whose premise is
that meaning lives in Concepts, a literal is a dead end.

**One form is measurably easier to write.** Every expression is `Head(args)`. Adding `[...]`
and `{...}` would give a small model three delimiter types to balance and three forms to
choose between, and the only hard failure measured in Part 11 was paren balancing. More
delimiter types multiply the worst existing failure mode.

**One node shape means one case.** The evaluator, matcher, substituter, tracer, and
describer each handle a single shape. A native list or object would need its own case in all
five — five special cases bought with syntax sugar.

**The cost, stated plainly.** `List(1, 2, 3)` is more tokens than `[1, 2, 3]`, and it is
noisier in translated code. More significantly, this choice is what *creates* the
unbounded-arity requirement in Part 12: a native list type would not need variadic patterns.
That is judged the better trade, since a native list would instead need destructuring
syntax, but the requirement is a consequence of this decision rather than an independent
need.

### 3.3 Keyed collections use named arguments

The grammar already has `name=value`, so a keyed collection needs no new syntax at all:

```
Object(action="wbsearchentities", search=$text, type=$kind, language="en", limit=10)
```

That is the normal form. `Pair` is the fallback for the cases named arguments cannot cover:

| form | when |
|---|---|
| `Object(action="x", limit=10)` | keys are known, identifier-shaped — the common case |
| `Object(Pair($key, $value), ...)` | keys are computed, or are not identifier-shaped, e.g. `"foo-bar"` |

The fallback is principled rather than arbitrary: an object whose keys are not known in
advance has to be walked by a code body, and a named-argument pattern cannot capture a key
it does not already name.

---

## 4. Concepts

A Concept is one self-contained unit of three parts. See `concept-spec.md` Part 1 for the
full treatment; what matters here is the shape an expression must produce.

- **identity** — its `CapitalizedName`.
- **relations** — Concept expressions asserting facts about it, e.g. `IsA(Bird())`,
  `SynonymOf(Multiply())`. Authored in the unit, queried through a two-directional index,
  and carrying their own properties (`Symmetric()`, `InverseOf(...)`, `Transitive()`) which
  license inference. Append-only.
- **realizations** — one or more. Each has a pattern, an optional usage context, and a body.
  A body either composes other Concepts or is executable code. Append-only.

There is **no gloss and no `meaning` field.** A Concept describes itself through its
composition, through its relations, or through a realization under a `Describe()` context,
and searchable text is derived from those rather than stored. So a declaration expression
carries identity, relations, and realizations — nothing else.

Nothing is privileged. File access, network access, model calls, and the evaluator's own
entry point are ordinary Concepts whose realizations happen to be code.

### 4.1 Many realizations, no canonical one

A Concept has no single true meaning. `Fetch()` means retrieve in ordinary language, an
HTTP request in code, and an activity when paired with a dog. The usage context selects.

This is why the IR must not normalize identities, and why the next section matters.

### 4.2 Synonyms are a success, not a defect

If the user says "times" and the graph has `Multiply`, the faithful parse is `Times(5, 3)`,
not `Multiply(5, 3)`. `Times` then carries:

```
SynonymOf(Multiply())
```

and a realization `Times($a, $b) := Multiply($a, $b)`.

Both the user's word and the computation are kept. Collapsing `Times` into `Multiply` at
parse time would discard the word the user actually chose, which violates Part 1.1.

Therefore: **there is no canonical identity, no alias table, and no deduplication pass.**
Many surface forms pointing at one realizable core is the intended shape of the graph, and
it *raises* effective recall, because more phrasings reach the same computation.

The real defect is not duplication, it is **disconnection**: an identity with no relation
and no realization reaching anything realizable. That is an orphan, and it is detected at
realization time, not parse time.

---

## 5. Variables

### 5.1 Single assignment

A variable is written `$name`. A variable is bound once. There is no mutation and no
reassignment of a live binding.

The reason is that realization works by matching a pattern against a call and substituting
the resulting bindings into a body. If a name could change value partway through, the same
name would mean two things in one expression and substitution would be meaningless.

This rule is about **bindings**, not about state. Mutable state exists, via the cells in
Part 10.5, and does not weaken it: a variable bound to a cell always denotes the same cell,
so substitution stays sound. What changes is the cell's contents, which is not a binding.

### 5.2 Shadowing is how refinement works

The input often refines something it already named:

> "grab the weights, er the scores"

This looks like mutation. It is not. Each refinement introduces a **new** binding of the
same name, whose value is built from the previous binding. The old binding is still intact
inside the new one:

```
$measure = Field("weights")
$measure = Correction($measure, Field("scores"))
```

The second `$measure` refers, in its own value expression, to the first. After that line,
`$measure` names the `Correction` node, which contains both the retracted and the intended
value. Nothing was overwritten, and the correction is recoverable.

The same mechanism handles progressive narrowing:

```
$runs = Ref("those probe things i sent you")
$runs = Qualify($runs, Not(Ordinal(1)))
$runs = Qualify($runs, Ordinal(2))
```

Each line is one phrase of the input, in order, and the accumulated value is a single
nested expression recording every qualification in the order it was said.

Rule: **a binding is live for everything after it, in order.** That is the whole scoping
model. It is deliberately the one a reader already has from reading top to bottom.

### 5.3 There is no PromptVariable concept

The original design named a `PromptVariable` Concept for values that change or are acted on
through the input. That role is filled by `$name` plus the shadowing rule above, so a
separate node would be duplicate state.

Provenance (which clause introduced a binding, and what it was before) is not lost by this,
because every evaluation step is traced. The trace already answers "where did `$measure`
come from" without a node asserting it.

### 5.4 When to bind

Bind only when one of these is true:

- the value is corrected or qualified later,
- the value is referred to more than once,
- or binding it keeps a line inside the depth limit (Part 9.4).

Otherwise write the value inline. Unnecessary bindings are the main way a small model loses
track of its own names.

---

## 6. Sequence

`Sequence(a, b, c, ...)` is one variadic Concept meaning: these steps, in this order.

It is used for every ordered group in the system:

- the clauses of a parsed message,
- a statement block in translated code,
- a function body,
- a list of gaps to resolve followed by the action to retake (Part 8.3).

There is no separate `Message`, `Utterance`, `Prompt`, `Block`, or `Statements` node. One concept.

### 6.1 A single step is not wrapped

**One step is that step, bare.** `What(Date())` is a complete IR. It is not
`Sequence(What(Date()))`, and it is not wrapped in any root node.

`Sequence` appears only when there are two or more steps.

This is a direct consequence of a rule that applies everywhere in this design: a wrapper
that is mandatory even when it wraps one thing is pure failure surface. It costs tokens,
it costs a paren the producer must remember to close, and it carries no information. The
consumer can trivially treat a bare expression as a one-step sequence.

The same rule retires the `ConceptRelations(...)` and `Realizations(...)` wrappers as far as
it goes: a single relation is a relation, and the reader normalizes. Part 6.2 retires them
for a stronger reason that also covers the multi-item case.

### 6.2 Ordered collections are all `List`

Because the grammar has no list syntax, an ordered collection is a Concept with one argument
per item. There is **one** such Concept: `List(a, b, c)`.

> **A collection Concept earns its own identity only when it has a realization. Otherwise it
> is `List`.**

`Sequence` earns its name: it has behaviour — ordered steps, unevaluated arguments, its own
realization. `List` is inert ordered data and is the default for everything else.

This retires a family of wrappers that never earned anything: `ConceptRelations`,
`Realizations`, `Params`, `Names`. Each was an inert list under a *named argument of the
same meaning*, so `relations=ConceptRelations(...)` stated "relations" twice. The slot name
already carries it, and a second label on the value is cost with no information: more
tokens, more identities to look up and describe and eventually forget, and — as the mismatch
between `ConceptRelations` and `Realizations` shows — a vocabulary invented one case at a
time rather than designed.

So a declaration reads `relations=List(...)`, `realizations=List(...)`, and a function reads
`Func($f, List($a, $b), body)`.

---

## 7. Keeping the source: markers

Five markers record what the input actually did. All five follow one rule.

| Marker | Written | Records |
|---|---|---|
| `Correction(old, new)` | `Correction(Field("weights"), Field("scores"))` | the producer retracted `old` and meant `new` |
| `Misspelling("wrote", Meant())` | `Misspelling("virginya", Virginia())` | a misspelled name, both forms kept |
| `Fuzzy(x)` | `Fuzzy(Field("scores"))` | the input was vague or approximate about `x` |
| `Emphasis(x)` | `Emphasis(Exactly())` | the input stressed `x` |
| `Aside("verbatim")` | `Aside("it was crazy.")` | a remark that is not part of the request |

### 7.1 The one rule that governs all of them

**A marker projects when the usage wants a value, and stays intact when the usage wants
the structure.**

- Where a value is wanted, each marker has a realization that projects to the operative
  one: `Correction` yields `new`, `Misspelling` yields `Meant()`, `Fuzzy` yields a loosened
  match, `Emphasis` yields its payload unchanged.
- Where the structure is wanted, those realizations are unavailable, so the markers stay as
  residuals and the system can reason about them, including about the mistake itself.

That is the entire specification for all five. There is no per-marker special casing, and
new markers can be added later by following the same rule.

#### What makes a projection unavailable

A marker's projecting realization declares itself **`Lossy()`**: it discards part of its
input. `Correction` throws away the retracted value, `Misspelling` throws away what was
written, `Fuzzy` throws away the fact that the user was vague.

`Describe()` declares that it suppresses lossy realizations as well as effectful ones
(`concept-spec.md` Part 4.0), so describing an expression leaves its markers standing.

This matters because **effect suppression alone is not enough.** A `Correction` projection
is perfectly pure — dropping a value touches nothing — so a rule that withheld only
effectful bodies would let the correction quietly disappear from its own description, which
is the one thing this part exists to prevent. Nor does naming `Execution()` on the
projection fix it, since `Context(Describe(), Execution())` is a legitimate context meaning
"describe what this does when run", and subset matching would let the projection through.

No new mechanism is required. The suppression rule is already general: *if any active facet
declares suppression of a property, realizations declaring that property are unavailable.*
`Effectful()` and `Lossy()` are two properties under one rule, and `Lossy()` is
independently useful — it is what caching and replay need to know.

### 7.2 Aside takes verbatim text

`Aside` is the one marker whose payload is a plain string rather than structure. Its
content is by definition not part of the request, so structuring it would be work with no
consumer, and verbatim copying is both lossless and the single easiest operation for a
small model.

### 7.3 What not to mark

Mark a misspelling only for a **content word that names something** — a place, a person, a
field, a product. Do not mark ordinary grammar slips: a missing apostrophe in "todays", a
dropped letter in "havent", lowercase "i". Marking those produces noise on every input and
buries the misspellings that carry meaning.

---

## 8. Not knowing things

Three different kinds of not-knowing, handled three different ways. Conflating them was the
largest single defect in the previous parser design.

### 8.1 An unknown Concept: invent it, say nothing

If no existing Concept fits, **the producer invents a `CapitalizedName` and moves on.** It
does not flag it, wrap it, or check a catalogue first.

This is not a concession, it is the correct division of labour:

- The producer cannot know what is in the graph. It sees a retrieved subset at best. Asking
  it "does this exist?" guarantees wrong answers, because a retrieval miss and a genuine
  absence look identical from where it sits.
- The evaluator *does* know. It holds the graph. When it realizes the expression it either
  finds a realization or produces a residual, and a residual for an invented identity is
  precisely the signal that something must be learned.

So gaps are detected at **realization** time by the component that can detect them. The
producer's job shrinks to structure, which is the only part it is good at.

An absent Concept therefore produces a residual, not an error. See `concept-spec.md`
Part 8.2: if an unknown identity raised, invention would be fatal, and invention is the
mechanism by which gaps are discovered at all.

This retires the `MissingConcept` wrapper and every rule about it.

### 8.2 An unresolvable reference: `Ref`

Some references cannot be resolved from the message alone:

> "those probe things i sent you", "the second one", "this time", "before"

These depend on conversation history the producer does not have. It marks them with the
phrase copied verbatim:

```
Ref("those probe things i sent you")
```

`Ref` is the only gap the producer flags, because it is the only one it is genuinely in a
position to notice: the text refers outside itself. Copying a phrase into a string is also
the cheapest possible operation.

`Ref` nodes are marked **in place**, inside the structure where the referent belongs. They
are not also listed in a header. A parallel list of gaps alongside the tree is duplicate
state that can disagree with the tree; the consumer finds every `Ref` by walking what it
already has.

This retires the `MissingContext` wrapper, the single-top-level-wrapper rule, and the
several plumbing Concepts that existed only to unwrap it.

### 8.3 Resolution is a loop, not one shot

The first parse of a message full of unfamiliar vocabulary is necessarily the worst parse
that will ever be produced, because it was made with the least knowledge. Committing to it
is a mistake.

So resolution iterates:

1. Parse.
2. Realize. Collect residual invented identities and every `Ref`.
3. Resolve them: search, learn, ask the Teacher as a last resort, look up history.
4. **Re-parse the original message**, now that the graph and the resolved references are
   available.
5. Repeat until nothing new is resolved, or a bounded iteration limit is hit.

Two properties matter. **Multiple gaps are resolved per pass** — a message can need a
history lookup and four unknown Concepts at once, which a single top-level wrapper made
impossible. And the re-parse is explicit, so the improved parse is actually used rather
than discarded.

The loop itself is expressible as a `Sequence`, which is what makes it inspectable:

```
Sequence(Resolve(Ref("those probe things i sent you")),
         Learn(GreaterThan()),
         Learn(Field()),
         Reparse())
```

---

## 9. The Ears contract

This part is the only part bound by small-model constraints. Everything above is about what
the IR means; this is about what a 4B model can write consistently. Every rule here is
either measured (Part 11) or derived directly from a measured failure.

### 9.1 Output

One IR, as plain text, with no prose, no markdown, no code fence, and no trailing period.
Returning the structure directly is faster and more reliable than conforming to a JSON
schema, so no schema is imposed.

### 9.2 One line per phrase

The producer writes **one line per phrase of the input, in the order the input said them.**
A line is either an expression, or an assignment `$name = expression`.

The consumer lifts those lines: one line becomes itself, N lines become `Sequence(...)`.
The producer therefore never writes `Sequence`, never writes a root wrapper, and never has
to close an outer paren.

This is surface syntax only. It denotes exactly the IR in Part 6, and the lift is
mechanical and lossless.

Two measured reasons, both in Part 11:

- The only hard failure observed on `qwen3.5:4b` was an unbalanced **outer** paren, which
  swallowed every clause after it. Line form removes that paren from the output entirely.
- Lines give **fault isolation**. One malformed line is one malformed clause; the others
  still parse. A single expression has no such property: one slip anywhere destroys the
  whole parse.

A nested alternative was tested, where each binding contains the rest of the message in a
`body=` argument. It is rejected: it failed *silently*, emitting a `Let` with three
separate `body=` arguments that parsed cleanly and meant nothing. Losing loudly is strictly
better than losing silently, and the flat form only ever fails loudly.

### 9.3 Arguments

Positional by default. Write `name=` only when a call has two or more arguments whose roles
are not fixed by order and getting them backwards would silently change the meaning.

Measured: an all-named variant scored lower on validity and produced about 60% more
characters for no gain. Naming every argument gives a small model one more thing to be
inconsistent about on every single call.

Never mix named and positional arguments in the same call.

### 9.4 Depth limit

Keep nesting at most four levels deep. If a value needs more, stop, assign it to its own
`$name` on its own line, and continue.

This gives the producer a mechanical escape from its worst failure mode instead of asking
it to count parentheses. It is also why the hard test case parses reliably: the same
content that fails as one deep expression succeeds as four shallow lines.

### 9.5 Completeness

Write a line for every distinct thing the input said, and drop nothing. Mark every
retraction, every negation, every vague word, and every stressed word.

Measured: adding this instruction took the hardest test case from 86% to 100% marker
coverage, and was the single largest fidelity improvement of any change tested.

### 9.6 No lambdas where a broadcast will do

Prefer `Sum(Property($items, $field))`, reading a field from every item, over
`Sum(Map($items, Lambda($x, Property($x, $field))))`.

Measured: with the lambda form, every sample got "add em up" wrong, summing the field name
instead of the values. With the broadcast form it was correct. The lifting belongs in the
realization, where it is written once, not in the producer, where it is re-derived and
mis-derived on every request.

---

### 9.7 Worked examples

All in the final line form. The first five are the intended targets for the measured
inputs; the sixth is a target not yet reached (Part 11.4).

Each question carries its **interrogative**, which is what marks it as a question. There is
no `Question(...)` wrapper: `What`, `When`, `Where`, `Who`, `Why`, `How`, `HowMany`,
`WhichOf`, and `Whether` each say both that a question is being asked and what kind. Each
takes a proposition, and where the unknown sits inside that proposition it is written `$_`. Wrapping
one in `Question(...)` would state "question" twice, the same redundancy Part 6.2 retires
for collections.

**"What is 5 times three?"** — one line, so no `Sequence`. Note `5` stays a digit and
`three` stays a word: the producer never normalizes.

```
What(Multiply(5, Number("three")))
```

**"What is todays date?"** — the missing apostrophe is a grammar slip, not a content word,
so it is not marked (Part 7.3). The subject is `Date`; `Today` is a separate temporal
qualifier and must not be conflated with it:

```
What(Date(Today()))
```

Three nearby messages stay distinct, where a normalizer would collapse all three:

| source | IR |
|---|---|
| "What is today's date?" | `What(Date(Today()))` |
| "What is the date?" | `What(Date())` — deictic default; no `Today` is invented |
| "What is today?" | `What(Today())` — an odd question, still expressible |

`Date(Today())` looks redundant, because `Today()` is already a date. "Today's date" is
redundant in English too, and preserving that is the point.

A requested format **wraps** the subject rather than parameterising it, so `Date` never has
to know that formats exist (`concept-spec.md` Part 10.2):

```
What(Format(Date(Today()), "MM-DD-YYYY"))
```

**"What do we need?"** — the unknown fills a slot inside a relation rather than naming the
subject, so the hole is written `$_` (`seed-concepts.md` Part 10):

```
What(Need(We(), $_))
```

**"how many r's are in strawberry"** — the source says "how many", so the interrogative is
`HowMany`. `Count` need not exist; if it does not, realization produces a residual and the
learning loop supplies an executable realization, which then counts characters correctly
rather than guessing from tokens.

```
HowMany(Count("r", "strawberry"))
```

**"Is chess a sport?"** — a yes/no question has no question word, so the bare proposition
would be indistinguishable from asserting it. `Whether` supplies the marking:

```
Whether(IsA(Chess(), Sport()))
```

**"i went to virginya to visit my mom. She has lived there 5 years. I havent been there for
3 years. it was crazy."** — four phrases, four lines. `virginya` is a content word naming a
place, so it is marked. The closing remark requests nothing, so it is an `Aside` holding
verbatim text.

```
Fact(Visited(Me(), Misspelling("virginya", Virginia())))
Fact(Purpose(Visit(), Mother(Me())))
Fact(LivedIn(Mother(Me()), Virginia(), Years(5)))
Fact(NotVisitedFor(Me(), Years(3)))
Aside("it was crazy.")
```

The two durations are relative to now. The producer records them as said; anchoring them to
an absolute date is realization's job, because the runtime holds the clock. Storing "5
years" as a bare fact would silently rot.

**"grab the weights, er the scores or whatever, from those probe things i sent you. Not the
first batch the second one and like add em up and tell me if its more than this time"** —
the hardest measured input, reproduced three times out of three at full marker coverage.

```
$weights = Correction(Field("weights"), Fuzzy(Field("scores")))
$probes  = Qualify(Ref("those probe things i sent you"), Not(Ordinal(1)), Ordinal(2))
$total   = Sum(Property($probes, $weights))
Do(Tell(Me(), Whether(GreaterThan($total, Ref("this time")))))
```

Reading it against the source: the retraction is a `Correction` holding both terms, so the
system can still see that "weights" was said first. "or whatever" becomes `Fuzzy` around
the intended field. "Not the first batch" and "the second one" are two qualifications
accumulated onto one binding in the order spoken, via the shadowing rule in Part 5.2. Two
phrases refer outside the message and become `Ref` with the text copied verbatim. `Sum` and
`GreaterThan` may not exist in the graph; the producer writes them anyway (Part 8.1).

The last line is worth reading closely, because an earlier draft wrote it as
`Question(GreaterThan(...))` and that silently dropped **two** pieces of the message. "Tell
me" is an imperative, so the frame is `Do(Tell(Me(), ...))`; and "if it's more than" is an
embedded yes/no question, so the content is `Whether(...)`. Neither survives a bare
`Question`.

Note also that "tell me the date" has no interrogative at all — `Do(Tell(Me(), Date()))` —
because the source contains a noun phrase rather than a question word. An interrogative
appears only where the source has one.

**A long, self-referential, mid-sentence-corrected request** — the known weak spot from
Part 11.4. Target parse, using the `Self()` referent that Part 13 lists as unspecified:

```
$scope = Correction(Ref("the previous request"), Do(Write(Spec(IR()))))
$scope = Qualify($scope, Emphasis(Detailed()), Emphasis(SourceOfTruth()))
Do(Express(Page(Code()), Structurally(Identically())))
Do(Cite(File("packages/concept-runtime/src/bootstrap/runtime-entry-source-example.js")))
Do(Express(English(Messy(), Circular(), OverCorrected(), Ambiguous(), Misspelled())))
Do(Use(Self(), As(TestCase())))
Aside("look how fucking long this is god damn.")
```

Two things this illustrates. A mid-sentence scope correction is the same `Correction` node
as a field-name correction, so nothing special is needed for it. And a message that talks
about itself needs a referent for itself; without `Self()`, the last instruction cannot be
expressed at all, which is part of why this input scores badly today.

## 10. Code

The same IR represents source code. A page of code must translate structurally, not
approximately.

The producer here is a mechanical translator, so Part 9's shallowness rules do not apply.
Depth is whatever the source requires.

### 10.1 Shared vocabulary

These mean the same thing in code and in a parsed message, and are the same Concepts:

`Sequence`, `Let`, `If`, `Not`, `And`, `Or`, `GreaterThan`, `LessThan`, `Equals`,
`Property`, `Lambda`.

### 10.2 Code-specific vocabulary

| Node | Shape |
|---|---|
| module | `Module(Sequence(...))` |
| import | `Import(List($a, $b), "module")` |
| export | `Export($name)` |
| function | `Func($name, List($a, $b), body)` |
| anonymous function | `Lambda(List($a), body)` |
| call | `Call(callee, arg, arg, ...)` |
| member / index | `Member(obj, "prop")` / `Index(obj, expr)` |
| assignment | `Assign(target, value)` |
| return / throw | `Return(x)` / `Throw(x)` |
| loop control | `Continue()` / `Break()` |
| try | `Try(body, Catch($e, handler))` |
| iteration | `ForOf($item, iterable, body)` / `While(cond, body)` |
| object / array | `Object(k=v, ...)` / `List(a, b, c)` |
| async | `Await(x)` / `Async(f)` |
| misc | `New(c, args...)` / `TypeOf(x)` / `In("k", obj)` / `Undefined()` |
| mutable binding | `Var($x, initial)` |
| state | `Cell(initial)` / `Get($ref)` / `Set($ref, v)` |

`If` is used for both statement and expression position. The IR does not need a separate
ternary, because an `If` that yields a value is the same idea.

### 10.3 Target language is a context facet, not a node

Code IR nodes carry realizations per target language, selected by usage context:
`If(...)` realized under `JavaScript()` emits JavaScript, under `Rust()` emits Rust. The
IR itself is language-neutral, which is what makes the eventual Rust port a realization
change rather than a rewrite.

A usage context is a **set of facets**, not a single nested expression
(`concept-spec.md` Part 7.1), so a target language is one facet among others and composes
with the rest: `Context(Describe(), Rust())` asks what a node means as Rust, without
replacing whatever else the situation already carried.

### 10.4 Worked translation

From `runtime-entry-source-example.js`:

```js
import { whatever } from 'some-fake-package';
```

```
Import(List($whatever), "some-fake-package")
```

```js
function field(value, name) {
  if (!isApplication(value)) return undefined;
  const argument = value.apply.args.find((item) => item.name === name);
  return argument && argument.value;
}
```

```
Func($field, List($value, $name),
  Sequence(
    If(Not(Call($isApplication, $value)), Return(Undefined())),
    Let($argument,
      Call(Member(Member(Member($value, "apply"), "args"), "find"),
           Lambda(List($item), Equals(Member($item, "name"), $name)))),
    Return(And($argument, Member($argument, "value")))))
```

```js
function specificity(value) {
  if (typeof value !== "object" || value === null) return 1;
  if ("variable" in value) return 0;
  return 1 + value.apply.args.reduce((sum, a) => sum + specificity(a.value), 0);
}
```

```
Func($specificity, List($value),
  Sequence(
    If(Or(NotEquals(TypeOf($value), "object"), Equals($value, null)), Return(1)),
    If(In("variable", $value), Return(0)),
    Return(Add(1,
      Call(Member(Member(Member($value, "apply"), "args"), "reduce"),
           Lambda(List($sum, $a), Add($sum, Call($specificity, Member($a, "value")))),
           0)))))
```

Note that `Return(1)` versus `Return(0)` versus the recursive `reduce` all survive
structurally, including the early returns and their order.

### 10.5 Mutation and state

`Var($x, initial)` declares a mutable location. `Assign(target, value)` writes to one.
Both are faithful to the source, including `Assign(Member($error, "value"), ...)`.

They are evaluable, and they do not require relaxing single assignment, because state is
held in a **cell** rather than in a binding:

```
Cell(initial)   ->  CellRef("c17")     allocate a location, yielding an opaque id
Get($ref)                              read current contents
Set($ref, v)                           replace contents
```

`$x` is bound once, to a `CellRef`. The cell's contents change; the binding does not.

The reference is an **id, not a pointer**, and that is what makes this cost nothing. Both
`match` and `substitute` deep-clone values; cloning `CellRef("c17")` yields a value that
still names the same store entry. So **no change to `match`, `substitute`, or the evaluator
is required.** `Cell`, `Get`, and `Set` are Concepts whose realizations reach a store
through `api`, exactly as unprivileged as `HttpRequest` or `SaveConcept`.

`Var` and `Assign` are surface nodes whose realizations compose to those three, so the code
IR keeps the shape the source had.

#### Why not desugar to single assignment

Rewriting `Assign` into a fresh shadowing binding over the rest of the `Sequence` — the
Part 5.2 mechanism, which is SSA — handles straight-line code elegantly and then fails on
three constructs that appear in the very first page translated:

- **Loop-carried state.** A binding introduced inside a `ForOf` body does not survive to
  the next iteration.
- **Closure capture.** A counter captured by a recursive function must be visible across
  calls, which rebinding cannot express.
- **Aliasing.** A mutated object may be held by someone else.

A cell outlives loop iterations, survives closure capture, and is shared across recursive
calls, with no new evaluator semantics. That is the deciding argument.

#### Why reads are explicit

A variable bound to a cell must be read as `Get($x)`. The alternative — the evaluator
auto-dereferencing any cell-bound variable, keeping the IR textually identical to the
source — is rejected, because it places a value-kind-specific rule inside the evaluator,
which is the exact category of privileged machinery this architecture exists to avoid.

The cost is small. The translator inserts `Get` mechanically, since a variable is a cell if
and only if it is ever an `Assign` target, which is a decidable static check. Stripping
`Get` recovers the source form, so the round-trip stays lossless. Structure is preserved;
only surface similarity gives a little.

#### In-place collection methods

`push`, `sort`, and `splice` mutate in place. They are rewritten to a pure read-modify-write
against the cell:

```
Set($candidates, Append(Get($candidates), $item))
Set($candidates, SortBy(Get($candidates), $comparator))
```

#### The boundary

Mutating a **host object the program did not allocate** — `Assign(Member($error, "value"),
...)` on a JavaScript `Error` — is not covered and is not pursued. That stays inside code
realizations, where JavaScript is already the implementation language.

The runtime needs to manage *its own* state as Concepts. It does not need to model the V8
heap. So the residual gap is narrow: not "translated code cannot execute", but "translated
code that mutates foreign objects cannot execute".

---

## 11. Evidence

Full method, scripts, and raw per-sample output:
`../research/ir-parser-experiments/`. Summary of what decided the rules in Part 9.

Measured against local Ollama, temperature 0.3, 6 inputs x 6 samples per cell, validated
with a reference parser written from the grammar in Part 3 rather than the project's own
parser. Inputs ran weakest to hardest: arithmetic; today's date; letters in a word; a
four-sentence anecdote with a misspelling and two relative durations; the "weights, er the
scores" request; and a long self-referential meta request.

Two scores matter. **afterRepair** is validity once missing close parens are appended,
which separates recoverable slips from structural failure. **fidelity** is the fraction of
the markers an input requires that appear anywhere in the output, which catches output
that parses but silently drops meaning.

### 11.1 Surface form

| variant | rawValid | afterRepair | fidelity |
|---|---|---|---|
| one wrapped root expression | 94% | 97% | 78% |
| **one `$name = expr` line per phrase** | **97%** | **100%** | **82%** |

The aggregate margin is modest, and the single-expression form was actually better on the
multi-sentence input (96% vs 75%). Lines were chosen on validity, on the hardest input
(6/6 at 100% fidelity versus 5/6 at 81%), and on two structural properties: no outer paren
to leave unbalanced, and fault isolation so one bad line costs one clause instead of the
whole parse.

A nested form, where each binding holds the rest of the message in a `body=` argument, was
rejected outright. It failed **silently**, emitting a `Let` with three separate `body=`
arguments that parses cleanly and means nothing. On the multi-sentence input it also
ignored its own instruction and wrote flat six times out of six.

### 11.2 Model size

| model | rawValid | afterRepair | fidelity | avgMs |
|---|---|---|---|---|
| qwen3.5:2b | 78% | 81% | 64% | 1.4s |
| **qwen3.5:4b** | 83% | **97%** | **87%** | 1.8s |
| qwen3.5:9b | 92% | 94% | 81% | 2.9s |

9b is worse than 4b on fidelity and 1.6x slower, regressing specifically on the two hardest
inputs. A larger model is more inclined to restructure and summarise, which is the wrong
instinct for faithful transcription. 2b collapses on the character-count input (2/6).

**The Ears should run on 4b.** Budget belongs in the prompt and the repair pass, not a
bigger model.

### 11.3 Other decided rules

- **All-named arguments** scored 87% valid against 100% positional, and ran about 60%
  longer, for no measured gain. Hence Part 9.3.
- **Completeness instructions** (Part 9.5) moved the hardest input from 86% to 100% marker
  coverage, three of three samples structurally identical. Largest single fidelity gain
  measured.
- **Lambdas broke aggregation** in every sample, emitting `Sum($measure)` and summing the
  field name rather than the values. Broadcast form fixed it. Hence Part 9.6.
- **Unbounded generation is unsafe.** With no token cap, 0.8b entered a runaway on the long
  meta input and had to be killed. The fix for an arbitrary 384-token limit is a generous
  cap plus a request timeout, not an infinite one.

### 11.4 Known weak spot

The long self-referential meta input scores 13-43% fidelity at every model size, while
everything else sits at or near 100% on 4b. It is the only input that fails structurally
rather than syntactically, and a bigger model does not help.

This is a real gap in the current contract. Likely requirements: the `Self()` referent
listed as open in Part 13, and clause-level decomposition so a long message is parsed in
segments rather than in a single pass.

## 12. Required runtime changes

The IR above needs these. Each is small, and none is a workaround.

1. **Unbounded arity in patterns.** A realization must be able to match a call with any
   number of arguments, so `Sequence`, `Qualify`, `Call`, `Object`, and `List` can be
   genuinely variadic. Without a rest-pattern, variadic nodes can only be inert data
   consumed by code bodies, which is what forced the `ConceptRelations(...)` and
   `Realizations(...)` wrappers.
2. **Wrapper normalization on read.** A single relation or realization, written bare, must
   be accepted as a one-item collection. Today one code path throws on a bare value and
   another silently substitutes an empty list, which loses data without reporting it.
3. **Line lifting.** Accept the Part 9.2 line form and lift it to `Sequence`, including the
   one-line case that lifts to nothing.
4. **Gap collection by traversal.** Walk a realized expression for residual identities and
   `Ref` nodes instead of reading a top-level wrapper.
5. **The resolution loop.** Part 8.3, with an iteration bound.
6. **A repair pass on parse failure**, starting with paren balancing, which fixes the only
   hard failure measured.
7. **A generous generation cap and a request timeout** on every model call.
8. **A cell store on `api`**, addressed by opaque id, backing the `Cell` / `Get` / `Set`
   Concepts in Part 10.5. Deliberately *not* a mutable binding store: bindings stay single
   assignment, so neither `match` nor `substitute` changes.

---

## 13. Open questions

- **Host-object mutation.** Resolved for the runtime's own state by the cells in Part 10.5.
  What remains is mutation of foreign host objects, which is deliberately out of scope and
  left to code realizations. Revisit only if self-modification turns out to need it.
- **Preserving genuine ambiguity.** `concept-spec.md` Part 9.5 settles the *policy* — pick,
  ask, or explore is itself a realization selected by context. What is still unspecified is
  the *IR node*: `Ambiguous(a, b)` is the obvious shape and follows the Part 7.1 rule, but
  nothing is measured and the Ears has no rule for emitting it.
- **Competing realizations.** Resolved in `concept-spec.md`: selection orders by
  inheritance distance, then context specificity (facet count, then structural depth), then
  success evidence used only to break remaining ties (that document's Part 9). Success is
  defined as a preference among tied candidates with blame narrowed to realizations that
  were actually tie-broken (its Part 9.4). What remains open there is generalising a preference across
  similar contexts.
- **Self-reference.** A message that talks about itself ("look how long this is") needs a
  `Self()` referent. Straightforward, unspecified.
- **Depth budget under lifting.** Lifting N lines into nested scopes makes evaluation depth
  grow with clause count. Needs a check against the depth budget for long inputs.
