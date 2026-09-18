# Concept Specification

Status: draft 1. Source of truth for what a Concept is, how it is realized, how it is
evaluated, how context selects behaviour, how Concepts are found, how they relate, and how
anything persists.

Companion to `ir-spec.md`, which specifies the expression language. This document specifies
the thing the expressions name. Read Part 2 of the IR spec first if you have not: residual
evaluation is assumed throughout.

This document is derived from the stated requirements in `../rough-idea.md` and
`../idea-honing.md`, not from the current implementation. Where a requirement was ambiguous
or self-contradicting, Part 18 records the contradiction and the resolution.

---

## 1. The unit

A Concept is **one self-contained unit**. It has exactly three parts:

| Part | What it is |
|---|---|
| **identity** | A `CapitalizedName`. The Concept *is* its identity. |
| **relations** | Concept expressions asserting facts about it. Stated here, queried through an index (Part 5.1.1). |
| **realizations** | One or more. How it means, or how it acts, per context. Produced, and evaluated. |

There is nothing else. No separate rules table, no action registry, no fact store, no
native-function map, no realization-kind enum, no `meaning` field, and no `gloss` field
competing with the realizations. Searchable text exists, but it is **derived** from the
realizations rather than stored beside them (Part 4).

### 1.0 Stated versus produced

The line between the two non-identity parts is worth naming, because it is the reason there
are two and not one:

- **Relations are stated.** They are asserted facts, walked by a terminating graph
  operation. They routinely cycle.
- **Realizations are produced.** They are behaviour, run by evaluation, which does not
  terminate in general and is bounded by budget.

Anything you *assert* is a relation. Anything the system *produces* is a realization. That
rule decides where new things go, and Part 4 and Part 5.1 are both consequences of it.

Everything the system knows and everything it can do is a Concept of this shape:
arithmetic, HTTP, file access, shell execution, JSON parsing, model calls, memory lookup,
the input parser, the Teacher, the output renderer, and the evaluator's own entry point.

### 1.1 Self-containment is the whole point

A Concept carries its own behaviour. You do not look up `Multiply` in one place and its
implementation in another. That separation is the documented cause of failure in all three
prior attempts: each represented most things as Concepts and kept a registry, kernel, or
closed enum beside them, and the thing beside them became the real engine.

---

## 2. The no-privilege rule

**No Concept is more important than any other, and no capability exists outside the
network.**

Some realizations must perform real host operations. That does not elevate their Concept.
A realization that opens a socket is one realization among others, exactly as replaceable
as a realization that composes two other Concepts.

### 2.1 The test

Prior attempts all *claimed* concept-first architecture and all failed it. So the rule needs
a check that can actually be run:

> Can you change the system's behaviour by editing ordinary Concepts and their
> realizations, without editing a registry, a router, a dispatch switch, a model seat, or
> an evaluator special case?

If changing behaviour requires touching host code that enumerates Concepts by name, the
rule is broken. Concretely, these are violations:

- A `switch` on Concept identity anywhere in the host.
- A closed enum of realization kinds.
- A list of "built-in" Concepts the evaluator treats differently.
- A fixed model slot, so that swapping the parser model means editing host code rather than
  a realization.
- A hardcoded answer for a specific question, so that host code special-cases an input.

And these are not violations:

- A realization whose body is code calling `fetch`.
- A general host facility reached uniformly through the evaluation interface, available to
  every realization equally (Part 17).

### 2.2 No placeholders

A Concept with an empty or stubbed realization is worse than an absent Concept, because it
reports capability it does not have. Absence produces a residual, which is an honest signal
the learning path can act on (Part 12). A stub produces a wrong answer silently.

An increment counts as implemented only when it works end to end and can be demonstrated.

---

## 3. Identity

The identity is the Concept. Two units with the same identity are the same Concept.

**Concepts are not versioned.** There is no version history of a Concept, no staging, and
no rollback.

Versioning would be the wrong granularity anyway: it would version the whole unit —
identity, relations, and every realization together — when the thing that actually
changes is one behaviour.

### 3.1 Append-only parts

Instead, the parts of a Concept have different mutability:

| Part | Mutability |
|---|---|
| identity | immutable; it *is* the Concept |
| realizations | **append-only**; never edited in place |
| relations | **append-only**; retract by asserting a contradicting relation |
| describing realizations | append-only, like any realization (Part 4) |

Append-only realizations do the job versioning would have done, at the right granularity
and without the machinery. Improving a behaviour means **adding** a realization, not
replacing one.

The consequence is that **an edit never destroys anything.** Recovery from a bad change is
the new realization losing selection, not restoring a snapshot. Nothing was overwritten, so
nothing needs restoring.

### 3.2 How realizations stop winning

Appending is not enough on its own; a bad realization has to be able to lose. Three
mechanisms, in the order they apply:

- **Different context.** A realization with a more specific context wins in that context
  (Part 9). Genuine competition, resolved by declared meaning.
- **Success evidence.** Among equally specific candidates, outcome history breaks the tie
  (Part 9.4). Genuine competition, resolved by observed behaviour.
- **Shadowing.** When a new realization has the *same* pattern and the *same* context as an
  existing one, nothing in the selection criteria can distinguish them, so they cannot
  meaningfully compete. The newer one is selected and the older is **shadowed** — retained
  in the store and in the trace, simply not chosen.

Shadowing is the honest handling of that case. Pretending two indistinguishable
realizations compete would just make behaviour depend on position in a list.

**Retirement** covers the rest: a realization may be explicitly marked as no longer
preferred, without being deleted. Retirement is itself recorded, so it is auditable and
reversible.

Nothing in this scheme deletes a realization. The store grows; the *active* set stays at
one per pattern-and-context pair.

### 3.3 Identity is not canonical

There is no canonical identity for a meaning, no alias table, and no deduplication pass.
`Times`, `Multiplication`, and `Multiply` may all exist. See Part 5.4 — this is intended.

---

## 4. Description

A Concept describes itself from three sources. The first two are free.

**A composed realization is already a description.** If behaviour is expressed in Concepts,
behaviour is readable:

```
Double($x)                     := Multiply($x, 2)
WikidataSearch($text, $kind)   := JsonParse(Fetch(Url(...)))
```

Those say what the Concept means. Nothing needs to be written alongside them.

**Relations are already a description.** Most Concepts are not computations and have no
composition to read. `Chess` is not an operation; everything it *is* lives in its relations:

```
IsA(BoardGame())
IsA(Sport())
MinimumNumberOfPlayers(2)
```

Read together, those answer "what is chess". This is the common case for learned knowledge:
research produces a Concept with relations and no realization, because there is nothing to
compute.

**An explicit describing realization** covers what neither of the above can: a Concept whose
only body is effectful, or one whose composition is accurate but unhelpful.

```
Describe()                              a description, in no particular usage
Context(Describe(), Execution())        what it does when run
Context(Describe(), Walking(Dog()))     what it means in that situation
```

`Describe()` is a facet of the usage context, not a wrapper around one (Part 7.1).

There is no `gloss` field. Description is behaviour like everything else.

### 4.0 Describing is evaluation with effects suppressed

`Describe()` is not a separate mode with its own traversal. It is an ordinary facet whose
only power is to make **effectful** bodies unavailable. Everything else follows from rules
that already exist:

- **Selection is unchanged.** A realization naming both `Describe()` and the situation wins
  on specificity. One naming only the situation still matches, because a context pattern
  constrains rather than enumerating (Part 7.2). So the behavioural realization is the
  natural fallback, with no fallback machinery.
- **Expansion is free.** Evaluating a composed body under this context expands it, and the
  residual rule (Part 8.1) stops the expansion exactly where it should: at a Concept whose
  body is effectful, which becomes a residual and therefore appears in the description as
  itself.

So `WikidataSearch` describes down to `JsonParse(Fetch(Url(...)))`, and `Fetch` stops there
because its body is effectful. The description is the maximally expanded composition, and it
terminates without anything special.

#### Relations describe by inheritance, not by special case

A Concept with no composition still has relations, so there is a **default describing
realization** whose body presents them. `Chess` has no behaviour to read, and this is what
answers a question about it.

That default is not a fallback wired into the evaluator. It is one realization on a
universal parent that every Concept is an `IsA` descendant of, delivered by ordinary
inheritance (Part 5.5). Editing that single realization changes how everything describes
itself, which is what Part 2.1 requires of anything that behaves like a default.

It is also consistent with Part 1.0. Relations are *stated*; the description is *produced*,
by traversing them. The relations remain the only source of those facts, so nothing is
duplicated.

#### Which relations

The default description does not lead with every relation. A summary of `Happy` that opens
with its `SynonymOf` list, or a summary of `Describe` that mentions `SuppressesEffects()`,
is worse than one without.

But **whether a relation is interesting is a property of the question, not of the
relation.** `SynonymOf` is machinery when it is forwarding a call and content when someone
asks "give me synonyms for happy". It is the same relation in both cases, so nothing
attached to the relation can decide which role the caller wants. Only the request can.

Three consequences.

**Exclusion is a soft default, never a prohibition.** A relation may declare itself
*incidental*, meaning it is not usually worth leading with in a general summary. It never
means unreachable. Filtering by a hardcoded list would in any case be exactly the privilege
Part 2.1 forbids.

**Every relation stays directly queryable.** Relation traversal is a search surface in its
own right (Part 11), and it is pure, so a lexical question is answerable descriptively. It
is simply a *different query* from the general description rather than a competing one:
`WhatIs(Happy())` summarizes and omits the synonym list, while a traversal over `SynonymOf`
returns precisely that list.

**Context already selects which description runs**, so this needs no new mechanism. The
describing realization is a realization matching `Describe()`, and facets do the rest:

| active context | describing realization | leads with |
|---|---|---|
| `Describe()` | the inherited default | content relations; synonyms omitted |
| `Context(Describe(), Lexical())` | a more specific one | the synonym relations |

Two facets beat one (Part 9), so the lexical description wins when the question is lexical.
Which relations matter is therefore decided by context, like everything else in this
document, rather than by a binary property baked onto each relation.

#### Asking a question is describing

`WhatIs(Chess())` and describing `Chess` are the same operation: the question form is
`InContext(concept=Chess(), use=Describe())`. They should not be built twice.

#### Relations are part of the unit, not arguments

A rendered description may present relations as a list, but relations are not arguments to
the Concept. `Chess()` takes no arguments; its relations are one of its three parts
(Part 1). The list is the description's shape, not the Concept's.

#### Effectful, not merely code

The line is effects, not bodies. `Add(2, 3)` has a code body but no effect, and `5` is a
better description of it than `Add(2, 3)` is. So pure code still runs; only effectful
bodies are withheld.

This requires realizations to declare their effects. That is not new work: the autonomy
modes in Part 16 need the same declaration to decide what may run unattended. Describing
reuses it.

**Limit, stated plainly:** an effect declaration is a claim, not an enforcement. A
realization can declare itself pure and open a socket, and nothing detects it.

#### Suppression is declared, not hardcoded

If the evaluator checked whether a facet *is* `Describe()`, that would be precisely the
special case Part 2.1 forbids. Instead the context declares the property:

```
Describe()   with relation   SuppressesEffects()
```

The evaluator's rule is general — *if any active facet declares effect suppression,
effectful bodies are unavailable* — so the harness never learns that `Describe` exists, and
another suppressing facet can be added without touching it.

#### Unbound variables denote themselves

Describing a Concept generically, rather than describing a specific call, leaves the
pattern's variables unbound. Under evaluation that is a failure (Part 8.3). Under a
suppressing context it is not: the result is a template, so an unbound variable stands for
itself and is part of the description.

#### Depth

Expansion terminates on budget (Part 8.4), but a maximal description is not a readable one.
A describing context wants a shallower depth limit than execution. That is a realization
concern, not an evaluator one.

### 4.1 Why a single text field could not work

A stored description has three defects, and the first is fatal:

- **A Concept does not have one meaning.** `Fetch` means retrieve in ordinary language, an
  HTTP request in code, and an activity when paired with a dog. One text field has to pick
  one and be wrong about the rest, or be so vague it says nothing. Context-dependent meaning
  is the whole premise of Part 6.2, and a single description contradicts it.
- **It is a second source of truth.** It duplicates what the realizations already say, needs
  syncing, and eventually disagrees.
- **Nothing checks it.** It can contradict the realizations silently, with the same
  reliability as a stale code comment.

Describing realizations have none of these. They are contextual by construction, they are
the only source, and they cannot drift from the realizations because they *are*
realizations.

### 4.2 Search uses a derived index, not a field

Lexical search needs text, and realizing a description on every query would be slow. So the
searchable text is a **derived index**: describing realizations are evaluated once, their
output is cached as text, and the cache is invalidated when the Concept's realizations
change.

| | stored field | derived index |
|---|---|---|
| sources of truth | two | one |
| contextual | no | yes, one entry per describing context |
| can drift | yes, undetectably | no, it is regenerated |
| search speed | fast | fast |

An index entry carries the context it was produced under, so search can prefer the
description matching the caller's situation.

This is what makes the claim in Part 1 true rather than aspirational: meaning is the
realizations, with no exception smuggled in through a text field.

### 4.3 What this cost, honestly

A Concept is dark to search only when it has **no composition, no relations, and no
describing realization**. Composition self-describes and relations self-describe, so that
set is small: essentially a freshly invented identity that nothing has been attached to yet.

Which is precisely the set the learning path is about to fill in (Part 12), and precisely
what an orphan is (Part 5.4). So a Concept with no searchable text is not a coverage gap so
much as a work item that is already queued.

The remaining weak case is an effectful leaf whose relations are thin — `HttpRequest` with
only `IsA(NetworkOperation())` produces a true but unhelpful description. Those are worth
describing by hand, since they are where the system touches the world.

Where a gap remains, it is an honest one. A Concept nobody described is a Concept nobody
explained, and Part 2.2 prefers that to a filled-in placeholder. It also gives the learner
something concrete to fix.

---

## 5. Relations

A relation is a Concept expression asserting a fact about the Concept:

```
IsA(Bird())
SynonymOf(Multiply())
ResidesIn(Virginia())
DerivesFrom(CurrentTimestamp())
```

Relations are what make the graph a graph. They are used for inference, for search
(Part 11), and for explanation.

### 5.1 Relations are asserted, never implicitly evaluated

A relation is data. `IsA(Bird())` does **not** cause `Bird()` to be realized.

This matters for a concrete reason: relations routinely mention the Concept they belong to,
or mention each other in cycles. Implicit evaluation would loop. Relations are matched and
traversed; evaluating one is an explicit act.

### 5.1.1 Where a relation lives, and how it is found

A relation written inside a unit has an **implicit subject**: whichever Concept's unit holds
it. So `IsMarriedTo(Emmy())` stored in Keal's unit is the triple

```
subject = Keal      predicate = IsMarriedTo      object = Emmy
```

The unit is where a relation is **authored**. It is not how relations are **queried**.

Asking for a Concept's relations is a **query result, not a field read.** The query runs over
the two-directional index (Part 5.2), gathering every triple that mentions the Concept as
subject *or* as object, and then reorienting each result according to the predicate's
declared properties (Part 5.3).

Emmy's marriage is found like this:

1. Index lookup on object = Emmy returns `(Keal, IsMarriedTo, Emmy)`.
2. `IsMarriedTo` declares `Symmetric()`, so reoriented that triple yields
   `(Emmy, IsMarriedTo, Keal)`.
3. It appears in Emmy's relation set.

Nothing is conjured. The fact was always *findable* from Emmy's side; it was simply not
*authored* there. This is the reason Part 5.2 requires indexing by object as well as by
subject — without it, "findable from either end" is false and derivation would need a scan.

The index is a cache rather than a fourth store (Part 13.3), regenerated when relations
change. It is the same arrangement as the derived description index in Part 4.2: authored in
one place, indexed globally for query.

#### Consequence: the authoring home is asymmetric

**Emmy's unit does not contain her marriage.** Editing Emmy's unit alone cannot retract it;
the assertion lives in Keal's unit, and retraction happens there or by asserting a
contradicting relation.

For a symmetric relation, which unit holds the assertion is therefore **arbitrary** —
ordinarily whichever side was learned first — and carries no meaning. That asymmetry is the
price of storing one truth once, and it is the right price, but it is a real edge that
anyone editing the graph should know about rather than discover.

#### The alternative, not taken

The fact could be **reified**: `IsMarriedTo(Keal, Emmy)` as its own statement Concept, owned
by neither participant. Retraction would then have one neutral home and nothing would be
asymmetric, which is roughly what a triple store does.

It is rejected because it empties the unit of what makes it readable, and because for the
common asymmetric case — `IsA(Bird())` on `Parakeet` — filing the relation under its subject
is plainly the right place. Recorded as a legitimate road not taken rather than a bad idea.

### 5.2 Truth is three-valued and the world is open

A query over relations answers **true**, **false**, or **unknown**.

Absence of a relation is *not* falsity. A system whose entire purpose is to learn things it
does not yet know cannot treat "not in the graph" as "not true", or it would confidently
deny everything it has not yet been taught.

- **true** — a supporting relation exists, directly or by traversal.
- **false** — a contradicting relation exists.
- **unknown** — neither. This is the trigger for learning (Part 12), not an answer to
  return.

Establishing **false** means finding a contradiction, which sounds like it requires scanning
the graph. It does not, because **what counts as a contradiction is determined by the
relation's own declared properties** (Part 5.3). `Asymmetric()` on `IsOlderThan` is exactly
what makes asserting it in both directions a contradiction rather than merely unknown; a
direct negation and a relation to something declared disjoint are the other shapes.

So the check is a small set of keyed lookups rather than a traversal. It requires relations
to be indexed **in both directions** — by subject and predicate, and by object and predicate
— because an inverse or symmetric relation is found from either end. With those indexes the
cost of distinguishing false from unknown is a small constant, independent of graph size.
Without them the distinction is unaffordable and the open-world guarantee is theatre.

### 5.3 Relations have properties, and properties imply relations

A relation often implies another relation, in the other direction:

- `IsMarriedTo(Keal, Emmy)` implies `IsMarriedTo(Emmy, Keal)`. Same relation, swapped.
- `IsOlderThan(Keal, Greg)` implies `IsYoungerThan(Greg, Keal)`. A different relation,
  swapped.

Both are handled the same way, and it needs nothing new: **a relation Concept is a Concept,
so it has relations.**

```
IsMarriedTo   ->  Symmetric()
IsOlderThan   ->  InverseOf(IsYoungerThan()),  Transitive(),  Asymmetric()
IsA           ->  Transitive()
SynonymOf     ->  Symmetric(),  Transitive()
```

The useful vocabulary is small: `Symmetric`, `Asymmetric`, `InverseOf`, `Transitive`,
`Reflexive`, `Irreflexive`, `Functional`. The inference each one licenses is performed by a
realization on the relation Concept, exactly as Part 5.7 requires — these are further
instances of the pattern `IsA` transitivity already established, not a new mechanism.

`InverseOf` is itself `Symmetric()`, so declaring it once on `IsOlderThan` is enough. The
property vocabulary describes itself using its own mechanism, which is a good sign the
design closes rather than needing a layer above it.

#### Derive, do not materialize

Asserting `IsMarriedTo(Keal, Emmy)` does **not** write `IsMarriedTo(Emmy, Keal)` into
Emmy's relations. Only the asserted fact is stored; querying Emmy runs the symmetry rule
and yields the implied relation.

Materializing would store two records of one reality. Part 3 retracts a relation by
asserting a contradicting one, which would then have to be done at both ends and could be
done at only one, leaving the graph quietly inconsistent. One fact, one truth.

The cost is paid by the two-directional index in Part 5.2, which keeps derivation a keyed
lookup rather than a scan.

#### Derived relations are real relations

Anything that reads a Concept's relations reads the derived set, not just the stored set.
In particular the default description (Part 4.0) must, or describing Emmy would omit her
marriage.

#### Termination

Symmetry and transitivity together can cycle. Traversal carries a visited set, which is
precisely why Part 1.0 has relations *traversed* rather than *evaluated*: a graph walk with
a visited set terminates, and evaluation does not.

### 5.4 Synonyms are a success, not a defect

If the input says "times", the faithful parse names `Times`, not `Multiply`. `Times` then
carries `SynonymOf(Multiply())`.

Both the user's word and the computation survive. Collapsing `Times` into `Multiply` at
parse time would discard the word actually chosen, which the IR spec forbids.

Many surface forms reaching one realizable core is the intended shape of the graph, and it
*raises* effective recall, because more phrasings find the same behaviour.

That last claim depends entirely on search expanding a hit over equivalence relations
(Part 11.1). Under purely lexical search it is false: searching one synonym would surface
only that synonym, and the cluster would be invisible.

The real defect is **disconnection**: an identity with no relation and no realization
reaching anything realizable. That is an orphan, and Part 12 is how orphans get attached.

### 5.5 Relations generate default realizations

`SynonymOf(Multiply())` as a relation and `Times($a, $b) := Multiply($a, $b)` as a
realization assert the same thing twice, which is the duplication Part 4 rejects.

Resolution: the relation is the source of truth, and the forwarding realization is
**derived** from it. Declaring `SynonymOf(X())` is sufficient to make the Concept behave as
`X`. An explicit realization is only written when the forwarding is not straightforward.

The same applies to other structural relations: `IsA` supplies inherited behaviour where
none is declared locally.

### 5.6 Context does not follow synonyms

If `Times` carries `SynonymOf(Multiply())`, and some Concept has a realization written for
the context `Multiply()` but not for `Times()`, a call naming `Times` does **not** match
that realization.

Context matching is on the identity **as written**, never on what it forwards to.

The reason is that `SynonymOf` asserts *these compute the same result*, not *these mean the
same thing in every situation*. Forwarding happens at realization, which is behaviour. It
does not happen at context matching, which is meaning.

`GoesInto` and `DividedBy` make the danger concrete. They compute the same division, so
they are reasonably synonyms. But "3 goes into 12" and "12 divided by 3" put the operands in
**opposite orders** in ordinary speech. A context realization written for one and silently
applied to the other would flip the arguments and be confidently wrong.

#### When you do want sharing

Use `IsA`, not `SynonymOf`. Inheritance shares context and behaviour deliberately
(Part 5.5), so a realization written for a shared parent applies to every child. That makes
the two structural relations mean clearly different things:

| Relation | Shares computation | Shares context |
|---|---|---|
| `SynonymOf(X())` | yes, by forwarding | **no** |
| `IsA(X())` | yes, by inheritance | **yes** |

If a contextual realization should cover several identities, declare their common parent and
write it there. The convenience of automatic synonym sharing is not worth reintroducing the
`GoesInto` bug.

### 5.7 Traversal is a realization, not a host feature

`IsA` transitivity — concluding `IsA(Animal())` from `IsA(Bird())` and `Bird IsA Animal` —
is performed by a realization of the relation Concept itself, not by special traversal code
in the evaluator or the store.

If the store did it, inference rules would live outside the network and could not be
changed by editing Concepts, which violates Part 2.1.

---

## 6. Realizations

A realization says: *in this situation, this Concept behaves like this.*

It has three parts:

| Part | Required | What it does |
|---|---|---|
| **pattern** | yes | The shape of call this realization handles. Binds variables. |
| **context** | no | The usage context this applies in. Absent means any context. |
| **body** | yes | What it produces: composed Concepts, or code. |

### 6.1 A body composes, or it runs

**Composed.** The body is a Concept expression, evaluated in turn:

```
Double($x)                     := Multiply($x, 2)
WikidataSearch($text, $kind)   := JsonParse(Fetch(Url(scheme="https",
                                    host="www.wikidata.org", path="/w/api.php", ...)))
```

**Code.** The body is executable, for the irreducible operations: actually opening a
socket, actually reading a file, actually invoking a model.

Composition is strongly preferred. Code is the floor, not the default. A capability
expressed as composition can be inspected, explained, and edited as Concepts; the same
capability buried in code can only be read as code.

### 6.2 Meaning and action are both realizations

There is no distinction in kind between "what this means" and "what this does". Both are
realizations; they differ only in context.

```
Parakeet()   in Discussion()  ->  a composition describing a small parrot
Parakeet()   in Execution()   ->  possibly nothing; the expression is its own value
Fetch($x)    in Discussion()  ->  "to go get something"
Fetch($x)    in Execution()   ->  an HTTP request
Fetch($x)    in Walking(Dog()) ->  an activity
```

This is the mechanism behind the IR spec's central claim. A Concept that has an execution
realization computes; a Concept that has only a meaning realization explains; a Concept
with neither in the active context evaluates to itself and is still perfectly good data.

### 6.3 No single true realization

Language is ambiguous and so are Concepts. There is no canonical realization for a Concept,
and the question "what does `Fetch` really do" has no answer. Whichever realization fits the
usage is the right one for that usage.

### 6.4 Argument evaluation

By default a call's arguments are evaluated before the realization's body runs.

A realization may declare that its arguments are **not** evaluated, receiving them as
unevaluated expressions. This is not an optimisation; it is required for anything that
chooses or defers:

- `If(cond, then, otherwise)` must not evaluate both branches.
- `Let($x, value, body)` must not evaluate `$x` before it is bound.
- `Try(body, catch)` must not evaluate the handler unless the body fails.
- `Sequence(...)` must control its own order.

A realization may also request that its **result** be evaluated again, for bodies that
produce an expression meant to be run rather than returned.

### 6.5 Conjunction yes, disjunction no

A realization has one context pattern, but that pattern may require **several facets at
once** (Part 7.1):

```
context = Context(Describe(), Walking(Dog()))
```

That is conjunction: this realization applies when the usage is *both* describing *and*
dog-walking. It is the normal way to write a realization that depends on more than one
dimension of the situation.

Disjunction is **not** available. There is no `AnyOf(Execution(), Teaching())`. Cover two
unrelated situations by generalizing with a variable, or by writing two realizations.

#### Why the two differ

They are excluded and admitted for opposite reasons, and the reason is specificity ordering
(Part 9):

- **Conjunction narrows.** Each added facet is a strictly stronger requirement, so more
  facets means more specific, and candidates stay comparable.
- **Disjunction widens.** `AnyOf(A(), B())` matches more than either branch and is
  comparable to neither. It is more specific than no context at all, but there is no answer
  to whether it beats `A()` alone.

Admitting disjunction would therefore push cases into tie-break that meaning should have
decided, which is the one thing Part 9.1 exists to prevent.

---

## 7. Context

A usage context is itself a Concept expression. It answers: what is this evaluation for?

```
Execution()          doing the thing
Discussion()         talking about the thing
Teaching()           producing a definition
JavaScript()         emitting JavaScript
Rust()               emitting Rust
Walking(Dog())       a structured, specific situation
```

Context is not an enum. It is an expression, so it can be as structured as needed, and new
contexts are ordinary Concepts.

### 7.1 A context is a set of facets

Usage has more than one independent dimension at a time. Describing something is a *mode*;
dog-walking is a *situation*. Both can be true at once, and neither is a parameter of the
other.

So the active context is a **set of facets**:

```
Context(Describe(), Walking(Dog()))
```

A single facet is not wrapped: a context of `Execution()` is one facet, written plainly.
`Context(...)` appears only when there are two or more, which is the same rule as
`Sequence` in `ir-spec.md` Part 6.1.

#### Why not nest them

Nesting was considered and rejected. `Describe(Walking(Dog()))` forces an arbitrary
ordering, and `Walking(Describe(Dog()))` is a different expression. Two realizations that
nest the same two facets in different orders would **never match the same context**, and
nothing would report it — they would silently fail to fire.

Facets are unordered, so that class of mistake cannot be made.

### 7.2 Context is matched by subset

A realization's context is a **pattern**, and it matches when every facet the pattern names
matches some facet of the active context. Active facets the pattern does not mention are
simply not constrained.

Patterns bind variables as usual, so a realization can name `Walking($animal)` generally or
`Walking(Dog())` specifically.

Matching a pattern against a context asks only "are these requirements met here", which is
why a realization can be written against one facet and still apply in a rich situation.

### 7.3 Facets compose additively

A context flows down through evaluation. Every sub-expression inherits the active context
unless a realization deliberately changes it.

Changes are normally **additive**: a realization that produces an explanation adds
`Describe()` to whatever facets are already active, rather than replacing them. So asking
for a description of `Fetch` inside a dog-walking situation yields the context
`Context(Describe(), Walking(Dog()))`, and the dog survives.

This is the concrete advantage of facets over nesting. A nested context would have to be
replaced wholesale, which means asking for a description would destroy the situation being
described.

Naming a context at the top of a request still governs the whole tree beneath it, so
`Discussion()` reliably produces explanation all the way down instead of accidentally
executing something in the middle.

### 7.4 Asking for a context explicitly

A request may name the facets it wants, rather than inheriting:

```
InContext(concept=Fetch($x), use=Walking(Dog()))
InContext(concept=Fetch($x), use=Context(Describe(), Walking(Dog())))
```

This is how a caller asks "what does this mean *here*", and it is the same mechanism the
system uses internally to explain itself.

---

## 8. Evaluation

Evaluating an expression:

1. If it is a primitive, it is already a value. Done.
2. If it is a variable, substitute its binding. An unbound variable is a failure.
3. Otherwise it is a call. Look up the Concept named by its head.
4. Gather realizations whose **pattern** matches the call and whose **context** pattern
   matches the active context.
5. If none match, **return the expression unchanged** — a residual.
6. Otherwise select one (Part 9), bind its variables, and evaluate its body, or run its
   code. Return the result.

### 8.1 Residual is the load-bearing rule

An expression with no applicable realization **evaluates to itself**. It is not an error.
It is a value.

Everything else in this architecture leans on this:

- The input parser can invent Concepts freely; an invented identity produces a residual,
  which is exactly the signal that something must be learned.
- Structure the system cannot execute survives intact instead of being destroyed, which is
  what lets the IR record corrections, misspellings, and vagueness and still be runnable.
- A Concept can be pure data in one context and behaviour in another, with no special case.

### 8.2 An absent Concept is also a residual

If the head names a Concept that does not exist at all, the result is a residual, marked as
unrealized. It is **not** a hard failure.

This is a deliberate correction to an earlier design in which an unknown identity raised.
Raising is incoherent with "the parser invents freely": it would make invention fatal, and
invention is the mechanism by which the system discovers what it needs to learn.

So the two cases unify. No Concept, or no matching realization: both yield a residual, and
both are collected by the same traversal (Part 12).

### 8.3 Failures are Concepts

When a realization fails, the failure is a Concept expression, not an opaque host error:

```
ExecutionFailed(concept=..., message=...)
UnboundVariable(name=...)
BudgetExceeded(kind="depth", limit=...)
```

So failure is inspectable, explainable, matchable, and recoverable. `Try(body, catch)` binds
the failure expression and hands it to the handler, which means recovery logic is written
in Concepts like everything else.

### 8.4 Budgets

Evaluation is bounded on depth and on total steps. Exceeding either produces a
`BudgetExceeded` failure.

This is not optional. A network that can rewrite itself can produce a realization that
recurses forever, and it will.

### 8.5 Evaluation is not the same as understanding

Realizing an expression is how the system *understands* it, not only how it computes. A file
is understood by conceptualizing its contents and realizing the result — raw code means
nothing to the system until it is translated into its own language. See `ir-spec.md` Part 10.

---

## 9. Choosing among competing realizations

Several realizations may match one call. They coexist; none supersedes another.

Selection is ordered:

1. **Where the realization is declared.** A realization declared on the Concept itself
   beats one inherited from a parent, and a nearer ancestor beats a farther one.
2. **Context specificity**, among realizations at the same inheritance distance, ordered by:
   1. **facet count** — a pattern requiring `Context(Describe(), Walking(Dog()))` beats
      one requiring only `Describe()`, which beats one naming no context at all;
   2. **structural depth** of the matched facets — `Walking(Dog())` beats
      `Walking($animal)`.
3. **Success evidence**, from the trace, for that exact (Concept, realization, context)
   combination — but **only to break ties** among candidates of equal specificity.

### 9.1 Why declared meaning must dominate statistics

Success statistics must never override a more specific contextual match. If they could, a
realization that happens to succeed often would capture the Concept and start answering in
contexts it was never meant for.

That is the crutch failure mode in a new costume: behaviour drifting away from the declared
meaning because a side mechanism outvoted it. Specificity is a statement of meaning;
statistics are a preference among things that already mean the right thing.

### 9.2 Why inheritance distance comes first

A Concept's own declarations are statements about *itself*. An inherited realization is a
statement about a *category*. The specific thing knows itself better than its category does,
so locality has to outrank context specificity rather than compete with it.

The concrete case that forces this is description (Part 4.0). The default relations-based
description is inherited and names the `Describe()` facet, so it has one facet. A Concept's
own composed realization often names no context at all, so it has none. Ordering by facet
count first would make the generic inherited description beat the Concept's own composition,
and `Double` would describe as a list of relations instead of as `Multiply($x, 2)`.

**Honest counter-case:** a parent's highly specific contextual realization now loses to a
child's generic one. `Parakeet`'s plain composition beats `Bird`'s ornithology-specific
description even in an ornithology context. That is judged correct — the child is the more
specific claim — but it is a judgement, not a derivation, and it is recorded in Part 19.

### 9.3 Incomparable context matches

Two patterns with the same facet count and the same structural depth, but *different*
facets, are genuinely incomparable. One requires `Describe()`, another requires
`Walking($x)`; both match, and neither is more specific.

No facet priority order is imposed to resolve this, because any such order would be
arbitrary and would quietly decide questions of meaning by fiat.

Instead it is treated as what it is: genuine ambiguity, handed to the policy in Part 9.5,
which may pick the best-supported reading, ask, or explore both.

The important property is that this ambiguity is **detectable**. Under a nested-context
design the same collision existed but was silent, because differently nested facets simply
never matched. Facets make it visible, and something visible can be reported, asked about,
or fixed by writing a more specific realization.

### 9.4 Success is a preference among ties, not a score

There is no universal success metric and none is assumed. Success is deliberately the
weakest possible thing: **a preference ordering among candidates that were already tied.**

Three signals, cheapest first:

| Signal | Strength | Cost |
|---|---|---|
| Outcome — the realization failed, or produced a residual where a value was wanted | unambiguous | free, already traced |
| Implicit negative — the user's next turn corrects, negates, or retries the same request | weak and noisy | free |
| Explicit choice — the user is shown two results and picks | strong | interrupts, so rare |

The implicit negative signal needs no new machinery to detect. The IR already represents a
retraction as `Correction` and a back-reference as `Ref`, so a following turn that corrects
the previous one is visible in the parse itself.

#### Blame has to be narrow

A single turn runs dozens of realizations. A negative signal about the answer does not say
which one was at fault, and penalising everything in the trace punishes the twenty
realizations that behaved correctly. Done naively this produces noise, not evidence.

So feedback only ever adjusts realizations that were **selected by tie-break**. If
specificity picked a realization uniquely, no choice was made and there is nothing to learn
from the outcome.

This makes the mechanism cheap as well as sound: most steps have exactly one candidate, so
most steps record nothing.

#### Asking is the ambiguity policy, not a new feature

"Show the user both results and let them pick" is the `ask` branch of Part 9.5 applied to
realization selection instead of to reading ambiguity. It is the same policy Concept, so it
is already inspectable and changeable, and it is already context-dependent — a background
task with nobody watching must not ask.

Reserve it for ties that are both unresolved and consequential. It buys the strongest
signal available at the highest cost.

#### What is still missing

Preference is recorded per exact (Concept, realization, context) triple. Nothing generalises
across contexts, so a preference learned in one situation teaches nothing about a similar
one. That is a real limit, and it is the remaining part of this question in Part 19.

Until any preference is recorded, ties fall back to declaration order, which makes behaviour
depend on position in a list.

### 9.5 Genuine ambiguity

When context does not resolve which reading is intended, the system has three options, and
all three are legitimate: pick the best-supported reading, ask the user, or preserve the
ambiguity and explore multiple readings.

Which one it takes is **itself a realization**, selected by context. A background task with
no one watching should not ask; an interactive request should. Making the policy a Concept
means the choice is inspectable and changeable without touching host code, per Part 2.1.

---

## 10. Primitives

Strings, numbers, and booleans have Concepts. **Using one does not require wrapping it.**

```
5                    a value
Number(5)            the same value, as a Concept with relations available
FourHundredAndNinety()   a specific value with its own relational facts
```

The bare primitive is shorthand. The Concept is available when its relations matter.

### 10.1 The rule

The bare form and the wrapped form are **distinct expressions** and match distinct patterns.
A realization that accepts either declares both patterns.

Lifting is explicit: an operation is available that, given a primitive, yields the Concept
for that specific value if one exists. This keeps pattern matching honest — matching stays
structural, with no implicit coercion that would make two different expressions silently
equal.

### 10.2 Structured values

Timestamps, file contents, and similar data get Concepts that wrap the data and describe how
it interacts with other Concepts. A `TimeFormat` wrapping a `Timestamp` renders it; the
`Timestamp` itself does not need to know about formats.

The wrapper is where the behaviour lives, which keeps the data Concept simple and lets
formats multiply without touching it.

---

## 11. Finding Concepts

Lookup is a Concept, with these surfaces:

| Surface | Use |
|---|---|
| exact identity | resolving a call |
| text over identity and derived descriptions | what the Teacher and the learner use |
| relation traversal | "everything that `IsA(Bird())`" |
| usage ranking from the trace | preferring Concepts that actually get used |

### 11.1 Search returns a cluster, not a node

A text search that returns only the Concept whose name matched is broken for discovery.
Searching "times" finds `Times` and never reveals that `Multiplication`, `Product`, and
`Multiply` exist, even though they are all connected and one of them holds the behaviour.

So a text hit **expands over equivalence relations** and returns the closure. That
expansion is not a bespoke search feature: it is the ordinary closure over relations
declared `Symmetric()` and `Transitive()` (Part 5.3), which `SynonymOf` is both of, plus
`IsA` for the parent. Cluster search is therefore a consequence of the relation properties
rather than its own mechanism.

The result is marked up with:

- which Concept was the direct textual hit,
- which others are related, and by which relation,
- **which Concept in the cluster actually has an executable realization**, since that is
  usually what the consumer wants.

Bounded: equivalence relations only, a depth limit, and a result cap. Ranked: direct hit
first, then the realizable core, then the rest.

Two things follow from this that are worth stating.

**It is the difference between the graph mattering and not.** If search is purely lexical,
relations contribute nothing to discovery and the graph is decorative outside of inference.
The claim in Part 5.4 that connected synonyms *raise* effective recall is only true because
search traverses. Without cluster expansion, that claim is simply false.

**It is also orphan detection.** If a cluster's closure contains no realizable behaviour,
that cluster is a disconnected island — the actual defect defined in Part 5.4. The same
operation that answers a search answers "is this attached to anything".

### 11.2 Resolution does not expand

Cluster expansion is for **discovery**: the Teacher, the learner, a human browsing. It is
not used when the evaluator resolves a call. A call to `Times` resolves through `Times`;
surfacing its synonyms there would be noise.

The expensive failure this prevents is in Part 12 step 4. The learner searches the graph
before escalating to the Teacher. Without cluster expansion it never discovers that
`Multiply` already does the job, so the cheap path fails and the expensive path runs for
nothing.

### 11.3 Lookup, not bulk inclusion

Neither the Teacher nor any other model consumer receives the whole library. They get a
lookup facility and use it. The network is fully discoverable; it is just not shipped in
every request.

The reason is not only cost. A retrieved subset injected up front invites a consumer to
conclude that anything absent does not exist, and a retrieval miss is indistinguishable
from a genuine absence. Lookup on demand lets the consumer ask a second question instead of
guessing. See `ir-spec.md` Part 8.1.

### 11.4 Lexical search runs on the derived index

Descriptions are realizations (Part 4), so lexical search runs over the **derived index**
built from them, not over a stored field.

The index is a cache, not a source. It is regenerated when a Concept's realizations change,
so it cannot disagree with them. And because each entry carries the describing context it
came from, search can prefer the description matching the caller's situation instead of
matching one flattened summary.

Meaning lives in the realizations. The index is an index.

---

## 12. Learning

The system fills its own gaps. The sequence:

1. **Invent.** The input parser names a Concept even when none exists. It does not check
   first, because it cannot know the graph.
2. **Realize.** Evaluation produces residuals for every identity that is absent or has no
   applicable realization. This is where gaps are actually detected, by the component that
   holds the graph.
3. **Collect.** Walk the realized expression for residual identities and for unresolved
   references.
4. **Try to learn unaided.** Search the existing graph; a `SynonymOf` or `IsA` may already
   supply behaviour (Part 5.5). Then research: web search and structured sources, with
   results turned into Concepts. Then composed reasoning, which may include a conversation
   the system holds with itself.
5. **Ask the Teacher, last.** A larger local model, given the original request, the gap, the
   research evidence, and lookup access to existing Concepts, returns complete Concept
   units. It may be asked about several gaps at once.

   When the gap is a **relation**, the Teacher should also be asked for its properties —
   whether it is symmetric, what its inverse is, whether it is transitive (Part 5.3). Those
   answers are cheap to produce and each one licenses inference over every future use of the
   relation, so they are the highest-value thing to ask for at learning time. A relation
   learned without them is inert in one direction.
6. **Save.** New Concepts enter the shared graph.
7. **Re-evaluate**, and re-parse the original input, now that the graph is better.

### 12.1 The Teacher is not privileged

It is a Concept whose realization calls a larger model. The model is a realization detail,
swappable without touching host code. It is a fallback, reached only when steps 4's cheaper
paths fail, and its output is ordinary Concepts subject to everything in this document.

### 12.2 Learning is bounded and traced

Every step above is traced like any other evaluation, so "what did it learn, from what, and
why" is answerable after the fact. The loop is iteration-bounded; a gap that cannot be
closed stays a residual, which is an honest outcome and better than a fabricated
realization.

---

## 13. Persistence

Three stores, with different lifetimes and different access patterns. They are separate
because conflating them would give one set of semantics to three different jobs.

| Store | Holds | Lifetime | Mutable | Reachable as Concepts |
|---|---|---|---|---|
| **Concept graph** | Concept units | durable | yes, in place | yes — save and lookup |
| **Cell store** | mutable runtime state | per run | yes | yes — allocate, read, write |
| **Trace** | what happened | durable, append-only | no | read yes, write is an effect |

### 13.1 How a Concept persists data

A Concept does not hold mutable data in its definition. Data goes to one of four places:

- **Knowledge** becomes a Concept. Learning something persists it by creating or updating a
  unit in the graph. This is the only durable knowledge mechanism, and it is why learning
  and remembering are the same act.
- **Transient state** goes in a cell, addressed by an opaque id. See `ir-spec.md` Part 10.5:
  the binding is single-assignment and immutable, the cell's contents change, so mutation
  does not compromise pattern substitution.
- **Conversations** become Concepts (Part 14).
- **Observations** go to the trace (Part 15).

### 13.2 Forgetting

Append-only would otherwise grow without limit. So realizations are collected, and the
policy is deliberately conservative — a realization is collectible only when **all** of
these hold:

1. it is shadowed or retired, and
2. another realization covers the same pattern and context, so the capability does not
   disappear, and
3. it has not been selected for a long period.

Condition 2 is the safety property: the only way to do something is never collected, no
matter how old. Forgetting can lose an alternative; it can never lose a capability.

There is no separate store of forgotten Concepts. Collected means gone.

#### The trace must snapshot, not point

Collection is only safe because the trace records the selected realization **by value**
(Part 15.2). If it held a reference, collecting a realization would leave dangling history
and destroy the forensic record that Part 3 relies on for recovery.

#### Orphan sweeping rides along

The collection pass is already walking the graph for things nothing uses, so it is the
natural place to also flag clusters whose closure contains no realizable behaviour
(Part 11.1). One pass, not a second mechanism and not a second database.

#### Forgetting is a Concept

The policy above — the thresholds, the conditions, what counts as long — is a realization,
not host code. Otherwise it could not be tuned without editing the harness, which Part 2.1
forbids.

### 13.3 No fourth store

Anything that looks like it needs a new store should first be checked against these. A new
special-purpose store for one capability is the Part 2 failure mode arriving quietly.

---

## 14. Memory and conversations

Each conversation is a Concept. It holds the original input, the parse, the evaluation, and
the results, so the record of a conversation is the same kind of thing as everything else
and is searchable and traversable the same way.

Memory is not "resend the whole transcript". It is lookup: the system finds the specific
prior messages a reference needs, through Concepts, and only when the parse says a reference
needs resolving.

### 14.1 Global by default

Memory spans all persistent conversations by default, not just the current one, because
references like "those probe things I sent you" routinely cross conversations.

### 14.2 Isolated conversations

Deferred. Not needed for the single-user system, and recorded here only because it is
anticipated for eventual users who do not want persisted memory.

The tentative shape, if it is built: an isolated conversation may **read** global memory and
may **add or change shared Concepts**; only its own transcript is not persisted. Isolation
would be a choice about saving the conversation, not a separate disconnected network.

One thing to settle before building it: under that shape, an isolated conversation can
permanently alter shared knowledge while leaving no record of the conversation that caused
the change. The trace still shows what was saved, so the change is not invisible, but the
reasoning behind it is gone. Whether that asymmetry is acceptable is a question for whenever
this becomes real, not now.

---

## 15. Tracing and self-observation

Every evaluation step is recorded: which Concept, invoked by which Concept, with what
arguments, in what context, which realization was selected, what it produced, and where the
result went.

This serves three consumers: the live view of what the system is thinking, the after-the-fact
history for analysis, and the system itself.

### 15.1 Writing is an effect; reading is a Concept

The stated requirement is that the observability path need not be Concepts and may live in
the runtime with its own store. Taken literally that creates a problem: realization
selection uses success evidence from the trace (Part 9), and the system is meant to analyse
its own behaviour to improve its Concepts. If the trace were unreadable from within the
network, that logic would have to live in host code, violating Part 2.1.

Resolution, and the reason for the split in the table in Part 13:

- **Writing** the trace is an ambient effect of evaluation, like the depth counter. It is
  not modelled as Concepts, because every step would then trace its own tracing.
- **Reading** the trace is an ordinary Concept. So the system can query its own history,
  and selection policy and self-analysis stay inside the network.

### 15.2 The trace records the selected realization

Recording *which* realization ran, not just which Concept, is what makes the trace a
forensic record rather than a summary. It is also the only recovery path for a damaged
self-edit, given that Concepts are not versioned (Part 3.1).

---

## 16. Self-modification

The system can create and change its own Concepts. Since the architecture, the parser, the
Teacher, the renderer, and the evaluator's entry are all Concepts, self-modification and
ordinary learning are the same mechanism.

Autonomy is bounded by mode, not by capability: the system always has its own sandbox to
write in and may always research and learn; access to the wider machine is off until
explicitly granted. Modes are user-controlled — ask for approval, act except where judged
unsafe, full access.

### 16.1 The agenda comes from the trace

Continuous autonomous operation needs something to do next, and the obvious failure is a
system that wanders or needs a goal invented for it.

It does not need one. **The system's to-do list is already recorded.** Every residual is a
Concept it could not realize; every failure is a realization that broke; every orphan is a
cluster attached to nothing; every un-described Concept is a gap in its own understanding.
All of it is in the trace and the graph already, as a by-product of ordinary operation.

So autonomous work is reading its own history for the things it could not do, and working
on them. Pointed at a directory, the same mechanism applies: conceptualizing the contents
produces residuals for everything it does not yet understand, and those residuals are the
agenda.

Choosing what to work on next is itself a realization, selected by context, so the policy
is inspectable and changeable rather than being a scheduler in host code.

### 16.2 Why this needs Part 2 to hold

Self-modification is the reason the no-privilege rule is not aesthetic. If a capability
lives in host code, the system cannot change it — it can only ask a human to. Every
privileged component is a thing the system is permanently unable to improve about itself.

---

## 17. The bootstrap

One irreducible piece of host code exists: a small generic loop that, given an expression,
looks up a Concept, selects a realization, and runs it. It cannot be a Concept, because
running a Concept is what it does.

Everything above it is Concepts, including the entry point through which a turn begins.

### 17.1 Minimality criterion

The loop is correctly minimal when it contains **no knowledge of any specific Concept**. It
knows how to match, substitute, select by specificity, evaluate, count steps, and record
events. It does not know that `Multiply` exists.

The facilities it exposes — store access, the cell store, trace writing, code execution —
are available uniformly to every realization. That uniformity is what distinguishes a host
facility from a privilege: `SaveConcept` and `HttpRequest` reach the host the same way, and
neither is special.

### 17.2 Interfaces exempt by decision

The web interface and the chat interface are not Concepts and are not required to be. They
observe and present; they do not decide behaviour.

---

## 18. Contradictions found and resolved

Recorded so the resolutions are not silently re-litigated.

| # | The contradiction | Resolution |
|---|---|---|
| 1 | Descriptions should be "expressed in Concepts", but lookup needs searchable text. | Description is a realization under a describing context. Searchable text is a **derived index** over those realizations, so there is one source of truth and search is still fast. No `meaning` or `gloss` field. Part 4. |
| 2 | Everything is a Concept, but the trace "does not have to be". | Writing is an ambient effect; reading is a Concept. Otherwise selection policy and self-analysis leak into host code. Part 15.1. |
| 3 | An unknown Concept raised an error, but the parser is supposed to invent freely. | An absent Concept yields a residual, exactly like a missing realization. Raising would make invention fatal. Part 8.2. |
| 4 | `SynonymOf(X())` as a relation and a forwarding realization say the same thing twice. | The relation is the source of truth; the forwarding realization is derived from it. Part 5.5. |
| 5 | Relations are Concept expressions, so are they evaluated? | No. Asserted, matched, traversed. They routinely cycle, and implicit evaluation would loop. Part 5.1. |
| 6 | Statistical selection versus declared contextual meaning. | Specificity dominates absolutely; statistics only break ties among equally specific candidates, or meaning drifts. Part 9.1. |
| 7 | "Decide which in different scenarios" for ambiguity, without saying how. | The policy is itself a realization selected by context, so it is inspectable and changeable. Part 9.5. |
| 8 | No versioning, but the system edits itself. | Realizations and relations are append-only, so an edit never destroys anything and recovery is the new realization losing selection. Versioning would be the wrong granularity. Part 3.1. |
| 9 | Does a bare `490` match `Number(490)`? | No. Distinct expressions, distinct patterns, explicit lifting. Implicit coercion would make matching dishonest. Part 10.1. |
| 10 | Isolated conversations may change shared Concepts but leave no transcript. | Deferred, not specified. Anticipated for future users, not needed now. The asymmetry is recorded as a question to settle before building it. Part 14.2. |
| 11 | Traversal and inference have to happen somewhere. | In realizations of the relation Concepts, not in the store or evaluator. Part 5.7. |
| 12 | Synonyms "raise recall", but a lexical search only ever returns the name that matched. | Search expands a hit over equivalence relations and returns the cluster. The recall claim is false without this. Part 11.1. |
| 13 | A single stored description cannot be right for a Concept whose meaning is context-dependent. | It cannot, so there is no stored description. Contextual describing realizations replace it, which makes gloss drift structurally impossible rather than merely detectable. Part 4.1. |
| 14 | If `Times` forwards to `Multiply`, does a context realization for `Multiply` fire for `Times`? | No. Context matches the identity as written. `SynonymOf` shares computation, not context; `IsA` shares both. Otherwise `GoesInto` inherits `DividedBy`'s context and silently flips the operands. Part 5.6. |
| 15 | Relations are Concept expressions, so should they just be realizations? | No. Relations are *stated* and traversed by a terminating walk; realizations are *produced* and evaluated under budget. Making relations realizations would turn every cyclic relation into a bounded infinite loop. Part 1.0. |
| 16 | Open-world truth requires proving a negative, which sounds unaffordable. | It is a keyed lookup, not a scan. What counts as a contradiction is fixed by the relation's own declared properties, and relations are indexed in both directions, so the check is a small constant. Without those indexes the guarantee is theatre. Part 5.2. |
| 17 | Can a realization require two contexts at once, like describing *and* dog? | Yes. A context is an unordered set of facets, matched by subset, and conjunction is the normal case. Nesting was rejected: it forces an arbitrary facet order, and two realizations nesting differently would silently never match the same context. Part 7.1. |
| 18 | Conjunction was admitted after disjunction was refused. | Opposite reasons. Conjunction narrows, so candidates stay comparable and specificity holds. Disjunction widens and is comparable to neither branch, so it would push meaning into tie-break. Part 6.5. |
| 19 | Must a description exist as its own realization, or can behaviour serve as one? | Behaviour serves. A composed body is already a description, so `Describe()` only suppresses effectful bodies and ordinary evaluation plus the residual rule do the rest. Explicit describing realizations are for effectful leaves. Part 4.0. |
| 20 | Suppressing effects under `Describe()` looks like an evaluator special case. | The context *declares* `SuppressesEffects()` and the evaluator applies a general rule over that declaration, so it never knows `Describe` exists. Part 4.0. |
| 21 | Composition describes operations, but most Concepts are not operations. What describes `Chess`? | Its relations. A default describing realization presents them, delivered by inheritance from a universal parent rather than wired into the evaluator. Relations stay the only source of the facts; the description is produced by traversing them. Part 4.0. |
| 22 | With a default inherited description, does it outrank a Concept's own composition? | No, and fixing this reordered selection: inheritance distance now dominates context specificity. Otherwise the generic inherited description outranks a local composition on facet count, and `Double` describes as relations instead of `Multiply($x, 2)`. Part 9.2. |
| 23 | Machinery relations should be kept out of descriptions, but "give me synonyms for happy" wants exactly one of them. | Interest is a property of the question, not the relation. `SynonymOf` is machinery when forwarding and content when asked about, so the exclusion is a soft default, every relation stays directly queryable, and a lexical facet selects a describing realization that leads with synonyms. Part 4.0. |
| 24 | A relation can imply its converse — married-to is symmetric, older-than inverts to younger-than. Nothing handled that. | A relation Concept is a Concept, so it declares `Symmetric()`, `InverseOf(...)`, `Transitive()`, and the implied relation is **derived at query time, never materialized**: storing both directions would record one truth twice and let a retraction be applied to only one. Part 5.3. |
| 25 | If a symmetric relation is stored in Keal's unit, how is it "derived" for Emmy, whose unit has nothing? | Querying a Concept's relations is a query over the two-directional index, not a read of its unit. The subject of a stored relation is implicit, so the triple is findable from either end and reoriented by the predicate's properties. The authoring home is consequently asymmetric even when the fact is not. Part 5.1.1. |
| 26 | Append-only growth versus forgetting. | Realizations are collected once shadowed, superseded by a live alternative, and long unused. Condition two is the safety property: an only-way-to-do-something is never collected. Part 13.2. |

---

## 19. Open questions

- **Generalising preference across contexts.** Part 9.4 defines success as a preference
  among ties, recorded per exact (Concept, realization, context) triple. Nothing
  generalises: a preference learned in one context teaches nothing about a similar one.
  Whether that matters depends on how often near-identical contexts recur, which is
  unmeasured.
- **Incomparable facets.** Part 9.3 sends equally specific matches on different facets to
  the ambiguity policy rather than inventing a priority order. Whether that is tolerable in
  practice, or whether some facets genuinely dominate others, needs real contexts to answer.
- **Forgetting thresholds.** Part 13.2 settles the conditions for collecting a realization
  but not the numbers. How long is long, and whether time-since-selection is the right
  measure at all, needs real usage to answer.
- **Thinly related effectful leaves.** Composition and relations both self-describe, so the
  Concepts needing a hand-written description are effectful leaves whose relations are thin
  (Part 4.3). Nothing prompts the system to write those, so the index can be unhelpful at
  exactly the points where the system touches the world.
- **Locality outranking context.** Part 9.2 puts inheritance distance above context
  specificity, which means a child's generic realization beats a parent's highly specific
  contextual one. That is judged correct but it is a judgement; a real case where the parent
  should win would overturn it.
- **Honest effect declarations.** Describing and the autonomy modes both trust a
  realization's claim about its own effects, and nothing verifies it. Whether that needs
  enforcement, and what enforcement would even look like for a code body, is unresolved.
- **When `Exist` runs.** Deferred by choice until the network can think well enough to make
  it useful, not because the design is unclear. Part 16.1 settles where the agenda comes
  from; what is unsettled is the budget and safety envelope for unattended operation, and
  how it decides to stop working on something.
