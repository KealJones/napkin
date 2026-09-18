# Seed Concepts

Status: draft 1. The Concepts the network starts with, derived from `concept-spec.md` and
`ir-spec.md`.

A seed Concept is an ordinary Concept that happens to exist at time zero. It can be
shadowed, appended to, retired, and forgotten like any other. Seeding is a head start, not
a privilege.

**Reference convention.** A bare `Part N` means a part of *this* document. A reference to
either companion spec always names the file: `concept-spec.md Part 5.2`, `ir-spec.md
Part 3`.

---

## 1. Seeded is not privileged

The distinction matters, because conflating them is what sank the prior attempts.

- **Privileged** means the harness names a Concept, so behaviour can only be changed by
  editing host code.
- **Seeded** means the graph is non-empty at startup. The harness would run identically
  without any of it, just producing residuals and failing to infer.

Part 2.1 of the Concept spec still holds for every Concept in this document: you can change
what it does by editing it.

### 1.1 The six the evaluator genuinely must know

Honesty first. A machine that reads a unit needs a few fixed words in that vocabulary:

| Concept | Why it is unavoidable |
|---|---|
| `Concept(identity, relations, realizations)` | the declaration form it saves |
| `Realization(pattern, context?, body)` | it must locate patterns and bodies |
| `Code(...)` | it must recognise an executable body |
| `Context(...)` | it must subset-match facets |
| `Suppresses(x)` | it applies the suppression rule generically |
| `IsA(x)` | selection orders by inheritance distance |

Six, and the list is closed. Every one is **structural** — about the *form* of a unit — and
none is **semantic**. The harness does not know that `Multiply` or `Describe` or `Execution`
exists; it knows how to read a realization and how to compare two contexts.

Two consequences worth noting. `Suppresses(x)` is known but `Effectful()` and `Lossy()` are
not, because the rule is generic over the property. And `IsA` is known only as an ordering
input; its transitivity is still a realization (`concept-spec.md` Part 5.7), not host code.

Anything beyond these six that the harness starts naming is a regression, and the test in
`concept-spec.md` Part 2.1 is how you catch it.

### 1.2 Seeding policy

Seeding is **idempotent and additive**, never destructive:

1. If a Concept with that identity does not exist, create it.
2. If it exists, add only the relations and realizations not already present, compared
   structurally.
3. Never remove, never overwrite, never reorder.

Because realizations are append-only (`concept-spec.md` Part 3.1), re-seeding a graph that has since learned
better realizations leaves them intact. The seed loses; the learned version keeps winning
on specificity or recency. That is the intended outcome.

### 1.3 No stubs

`concept-spec.md` Part 2.2: a stubbed realization is worse than an absent Concept, because it claims a
capability it does not have, while an absence produces an honest residual the learning path
can act on.

So this seed contains only Concepts that are **pure data** (relation vocabulary, context
facets, failure types, markers) or whose realization can actually be written. Part 12 lists
what is deliberately left out on those grounds.

---

## 2. Relation vocabulary

Pure data. The harness never reads these; realizations of the relation Concepts do.

| Identity | Own relations | Meaning |
|---|---|---|
| `IsA(x)` | `Transitive()` | subtype / inheritance |
| `SynonymOf(x)` | `Symmetric()`, `Transitive()` | same computation, different word |
| `InverseOf(x)` | `Symmetric()` | this relation is the converse of that one |
| `Disjoint(x)` | `Symmetric()`, `Irreflexive()` | nothing is both |
| `Symmetric()` | — | holds in both directions |
| `Asymmetric()` | — | cannot hold in both directions |
| `Transitive()` | — | chains |
| `Reflexive()` | — | holds of itself |
| `Irreflexive()` | — | never holds of itself |
| `Functional()` | — | at most one object per subject |
| `Incidental()` | — | not usually worth leading with in a summary (`concept-spec.md` Part 4.0) |

`InverseOf` being `Symmetric()` is why `IsOlderThan -> InverseOf(IsYoungerThan())` need only
be declared once. The vocabulary describes itself with its own mechanism.

### 2.1 Inference realizations

One realization per property, on the property's own Concept, per `concept-spec.md`
Part 5.7. Each answers a
relation query by walking the index with a visited set:

```
Symmetric()   given (a, R, b)  yields (b, R, a)
Transitive()  given (a, R, b) and (b, R, c)  yields (a, R, c)
InverseOf(S)  given (a, R, b)  yields (b, S, a)
Asymmetric()  (a, R, b) and (b, R, a) together are a contradiction
Disjoint(Y)   (a, IsA, X) and Disjoint(X, Y) make (a, IsA, Y) false
Functional()  two distinct objects for one subject are a contradiction
```

The last three are what make `false` distinguishable from `unknown` (`concept-spec.md`
Part 5.2). Without them the open-world guarantee has nothing to work with.

---

## 3. Realization properties

Pure data. Declared on realizations, read generically through `Suppresses`.

| Identity | Meaning |
|---|---|
| `Effectful()` | the body touches the world |
| `Lossy()` | the body discards part of its input |
| `Pure()` | neither; stated positively where useful |

---

## 4. Context facets

Each is a facet, not a wrapper (`concept-spec.md` Part 7.1).

| Identity | Relations | Meaning |
|---|---|---|
| `Execution()` | — | doing the thing |
| `Describe()` | `Suppresses(Effectful())`, `Suppresses(Lossy())` | explaining the thing |
| `Teaching()` | — | producing a definition |
| `Lexical()` | — | the question is about words, not referents |
| `JavaScript()` | — | emit JavaScript |
| `Rust()` | — | emit Rust |

`Describe()` carrying both suppressions is the whole of why describing works: composition
expands, effectful leaves stop as residuals, and source markers stay intact instead of
projecting away (`concept-spec.md` Part 4.0, and `ir-spec.md` Part 7.1).

### 4.1 Terminology note

The IR spec originally said "discussion context" where it now means `Describe()`. There is
one facet, spelled `Describe()`. `Discussion()` is not seeded and should not be introduced
as a synonym, since two names for one facet would let two realizations miss each other.

---

## 5. The universal parent

| Identity | Relations | Realizations |
|---|---|---|
| `Concept()` | — | `Describe()` → present my content relations |

Every Concept is an `IsA` descendant of `Concept()`. Its single describing realization is
what answers "what is chess" for any Concept with relations but no composition
(`concept-spec.md` Part 4.0).

It is reached by ordinary inheritance, so it loses to anything a Concept declares locally
(`concept-spec.md` Part 9.2). Editing this one realization changes how everything describes itself, which is
exactly the property a default must have to not be a privilege.

Its body: query my relations through the index, drop those declared `Incidental()`, present
the rest. A more specific describing realization under `Context(Describe(), Lexical())`
presents the synonym relations instead.

---

## 6. Evaluation control

All of these take their arguments **unevaluated**; that is the point of them.

| Identity | Shape | Notes |
|---|---|---|
| `Sequence(...)` | variadic | steps in order; one step is never wrapped (`ir-spec.md` Part 6.1) |
| `Let($name, value)` | 2 positional | binds for the remainder of its sequence |
| `If(cond, then, otherwise)` | 3 | evaluates one branch; also serves as expression-position ternary |
| `Try(body, Catch($e, handler))` | 2 | binds the failure expression |
| `Catch($var, handler)` | 2 | handler shape for `Try` |
| `Lambda(Params(...), body)` | 2 | anonymous function |
| `Params(...)` | variadic | parameter list; pure data |
| `InContext(concept, use)` | 2 named | evaluate in an explicitly named context (`concept-spec.md` Part 7.4) |

`Sequence` needs unbounded arity in patterns, which is item 1 of `ir-spec.md` Part 12.

---

## 7. State

| Identity | Shape | Notes |
|---|---|---|
| `Cell(initial)` | 1 | allocate; yields a `CellRef` |
| `CellRef(id)` | 1 | opaque id, safe to clone (`ir-spec.md` Part 10.5) |
| `Get(ref)` | 1 | read contents |
| `Set(ref, value)` | 2 | replace contents |

`Cell`, `Get`, and `Set` have code bodies declared `Effectful()`. They reach the cell store
through the same interface every other realization uses, which is what keeps them
unprivileged.

---

## 8. Failure and outcome

Pure data, produced by evaluation, matchable by `Try` (`concept-spec.md` Part 8.3).

| Identity | Carries |
|---|---|
| `ExecutionFailed(concept, message)` | a realization raised |
| `UnboundVariable(name)` | a variable had no binding |
| `BudgetExceeded(kind, limit)` | depth or step budget exhausted |
| `Unrealized(identity)` | no Concept and no realization; the residual marker |
| `UnknownTruth()` | relation query answered neither true nor false |

`Unrealized` is what the learning path collects (`concept-spec.md` Part 12). It is a
value, not an error — that is the residual rule.

---

## 9. IR source markers

From `ir-spec.md` Part 7. Each projecting realization is declared `Lossy()`, so `Describe()`
withholds it and the marker survives into its own description.

| Identity | Projects to, under `Execution()` | Lossy because |
|---|---|---|
| `Correction(old, new)` | `new` | drops the retracted value |
| `Misspelling(wrote, meant)` | `meant` | drops what was written |
| `Fuzzy(x)` | a loosened match on `x` | drops that the user was vague |
| `Emphasis(x)` | `x` | drops the emphasis |
| `Aside(text)` | — no projection, always residual | not part of the request |
| `Ref(text)` | — no projection, always residual | needs history to resolve |

`Aside` and `Ref` have **no** execution realization at all. That is deliberate: `Aside` is
commentary and `Ref` is an unresolved reference, so both should stay visible until something
resolves them rather than quietly evaluating to anything.

---

## 10. Request vocabulary

| Identity | Shape | Notes |
|---|---|---|
| `Question(x)` | 1 | a request for an answer |
| `Fact(x)` | 1 | the user asserting something |
| `Do(x)` | 1 | the user requesting an action |
| `WhatIs(x)` | 1 | `InContext(x, Describe())`; same operation, not a second one (`concept-spec.md` Part 4.0) |
| `Qualify(thing, q, ...)` | variadic | progressive narrowing |
| `Ordinal(n)` | 1 | positional selection |
| `Not(x)` | 1 | negation |
| `Ambiguous(a, b, ...)` | variadic | **omitted from the seed** — see Part 12 |

---

## 11. Primitives, collections, deixis

| Identity | Notes |
|---|---|
| `String(x)`, `Number(x)`, `Boolean(x)` | wrappers; a bare primitive needs no wrapping (`concept-spec.md` Part 10) |
| `Lift(x)` | primitive → its specific-value Concept, if one exists (`concept-spec.md` Part 10.1) |
| `List(...)` | ordered collection; the grammar has no list syntax, so collections are Concepts (`ir-spec.md` Parts 3.2 and 6.2) |
| `Object(k=v, ...)` | keyed collection, built from the named arguments the grammar already has (`ir-spec.md` Part 3.3) |
| `Pair(k, v)` | fallback entry for `Object` when a key is computed or not identifier-shaped |
| `CurrentTimestamp()` | code body, `Effectful()` — reads the clock |
| `Today()` | composed from `CurrentTimestamp()`; **not** a parser special case |
| `Now()`, `Me()`, `You()` | deictic, resolved from ambient state |
| `Self()` | **omitted from the seed** — see Part 12 |

`Today()` existing as a seeded Concept with a composed realization is what deletes the
hardcoded calendar rule the old parser prompt carried. The Ears emits `Question(Today())`
because `Today` is a Concept, not because a sentence told it to.

---

## 12. Deliberately omitted

Not seeded, on the no-stubs rule in Part 1.3. Each would need behaviour that cannot be
honestly written yet, and an absence produces a residual the learner can act on while a stub
lies.

| Not seeded | Why | What it needs first |
|---|---|---|
| `Exist()` | continuous autonomous operation | the budget and safety envelope, deferred by choice |
| `AskTeacher(...)` | needs a model call and a prompt contract | the Teacher protocol, once the IR is implemented |
| `WebSearch`, `WikidataSearch` | real network realizations | fine to add, just not written here |
| `Self()` | self-reference in an utterance | measured as the weak spot; shape unsettled |
| `Ambiguous(a, b)` | preserving multiple readings | policy is settled, the IR node is not |
| `Forget()` | collection policy | thresholds unresolved (`concept-spec.md` Part 19) |
| success/preference recording | tie-break evidence | generalisation across contexts unresolved |

Naming them here rather than omitting them silently means the gaps are visible, which is the
same reason a residual beats an exception.

---

## 13. What this seed buys

With the above in place at time zero:

- **Relations infer.** Symmetry, inverses, transitivity, and the three contradiction shapes
  all work, so `false` is distinguishable from `unknown` on day one.
- **Everything describes itself.** Composition self-describes, relations self-describe
  through `Concept()`, and markers survive description.
- **Control flow exists.** Sequence, binding, branching, recovery, and lambdas, so composed
  realizations can be written in Concepts rather than code.
- **State exists**, so translated code with mutation is evaluable.
- **Failure is inspectable** and recoverable in Concepts.
- **The IR is expressible.** Every node the Ears can emit has a Concept, so a parse either
  realizes or produces an honest residual — never a crash.

What it does not buy: research, teaching, autonomy, or self-reference. Those are Part 12,
and they are the next real work rather than a gap in this document.
