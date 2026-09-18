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

A Concept is **one self-contained unit**. It has exactly four parts:

| Part | What it is |
|---|---|
| **identity** | A `CapitalizedName`. The Concept *is* its identity. |
| **gloss** | Plain-language text. Human-readable, searchable. **Not** a source of meaning. |
| **relations** | Concept expressions asserting facts about it. |
| **realizations** | One or more. How it means, or how it acts, per context. |

There is nothing else. No separate rules table, no action registry, no fact store, no
native-function map, no realization-kind enum, no `meaning` field competing with the
realizations.

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
identity, gloss, relations, and every realization together — when the thing that actually
changes is one behaviour.

### 3.1 Append-only parts

Instead, the parts of a Concept have different mutability:

| Part | Mutability |
|---|---|
| identity | immutable; it *is* the Concept |
| realizations | **append-only**; never edited in place |
| relations | **append-only**; retract by asserting a contradicting relation |
| gloss | freely mutable; unchecked text, not authoritative (Part 4) |

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
  (Part 9.2). Genuine competition, resolved by observed behaviour.
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
`Times`, `Multiplication`, and `Multiply` may all exist. See Part 5.3 — this is intended.

---

## 4. The gloss

A short plain-language description. It exists for two consumers: humans reading the graph,
and lexical search (Part 11).

**The gloss is not the meaning.** A Concept's semantic content is expressed by its ordinary
realizations, including realizations whose bodies compose other Concepts to express what it
means. There is no privileged `meaning` field standing beside the realizations and competing
with them.

The reason is single source of truth. A Concept-expressed description that duplicates what
the realizations already say would need to be kept in sync with them, and would eventually
disagree. Two answers to "what does this mean" is one too many.

### 4.1 Consequence, stated plainly

The gloss is unchecked text. It can drift from the realizations and nothing detects it. It
is documentation and a search key, and it should be treated with exactly the trust you
would give a code comment.

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

### 5.2 Truth is three-valued and the world is open

A query over relations answers **true**, **false**, or **unknown**.

Absence of a relation is *not* falsity. A system whose entire purpose is to learn things it
does not yet know cannot treat "not in the graph" as "not true", or it would confidently
deny everything it has not yet been taught.

- **true** — a supporting relation exists, directly or by traversal.
- **false** — a contradicting relation exists.
- **unknown** — neither. This is the trigger for learning (Part 12), not an answer to
  return.

### 5.3 Synonyms are a success, not a defect

If the input says "times", the faithful parse names `Times`, not `Multiply`. `Times` then
carries `SynonymOf(Multiply())`.

Both the user's word and the computation survive. Collapsing `Times` into `Multiply` at
parse time would discard the word actually chosen, which the IR spec forbids.

Many surface forms reaching one realizable core is the intended shape of the graph, and it
*raises* effective recall, because more phrasings find the same behaviour.

The real defect is **disconnection**: an identity with no relation and no realization
reaching anything realizable. That is an orphan, and Part 12 is how orphans get attached.

### 5.4 Relations generate default realizations

`SynonymOf(Multiply())` as a relation and `Times($a, $b) := Multiply($a, $b)` as a
realization assert the same thing twice, which is the duplication Part 4 rejects.

Resolution: the relation is the source of truth, and the forwarding realization is
**derived** from it. Declaring `SynonymOf(X())` is sufficient to make the Concept behave as
`X`. An explicit realization is only written when the forwarding is not straightforward.

The same applies to other structural relations: `IsA` supplies inherited behaviour where
none is declared locally.

### 5.5 Traversal is a realization, not a host feature

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

### 7.1 Context propagates

A context flows down through evaluation. Every sub-expression inherits the active context
unless a realization deliberately changes it for its body or its result.

This is what makes context useful rather than decorative: naming a context at the top of a
request governs the whole tree beneath it, so `Discussion()` reliably produces explanation
all the way down instead of accidentally executing something in the middle.

### 7.2 Context is matched, not compared

A realization's context is a **pattern**, matched against the active context, and it can
bind variables from it. So a realization can apply to `Walking($animal)` generally, or to
`Walking(Dog())` specifically.

### 7.3 Asking for a context explicitly

A request may name the context it wants, rather than inheriting:

```
InContext(concept=Fetch($x), use=Walking(Dog()))
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

1. **Context specificity.** The realization whose context pattern is most specific wins. A
   realization naming `Walking(Dog())` beats one naming `Walking($animal)`, which beats one
   naming no context at all.
2. **Success evidence**, from the trace, for that exact (Concept, realization, context)
   combination — but **only to break ties** among candidates of equal specificity.

### 9.1 Why specificity must dominate

Success statistics must never override a more specific contextual match. If they could, a
realization that happens to succeed often would capture the Concept and start answering in
contexts it was never meant for.

That is the crutch failure mode in a new costume: behaviour drifting away from the declared
meaning because a side mechanism outvoted it. Specificity is a statement of meaning;
statistics are a preference among things that already mean the right thing.

### 9.2 What counts as success is unresolved

Success is not defined here, and no universal metric is assumed. What the trace can record
now is outcome per step — succeeded, failed, produced a residual — together with the
context. That is enough to break ties and not much more.

Open question in Part 19. Until it is settled, ties fall back to declaration order, which
is a weakness worth naming: it makes behaviour depend on position in a list.

### 9.3 Genuine ambiguity

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
| text over identity and gloss | what the Teacher and the learner use |
| relation traversal | "everything that `IsA(Bird())`" |
| usage ranking from the trace | preferring Concepts that actually get used |

### 11.1 Search returns a cluster, not a node

A text search that returns only the Concept whose name matched is broken for discovery.
Searching "times" finds `Times` and never reveals that `Multiplication`, `Product`, and
`Multiply` exist, even though they are all connected and one of them holds the behaviour.

So a text hit **expands over equivalence relations** — `SynonymOf`, and `IsA` for the
parent — and returns the closure, marked up with:

- which Concept was the direct textual hit,
- which others are related, and by which relation,
- **which Concept in the cluster actually has an executable realization**, since that is
  usually what the consumer wants.

Bounded: equivalence relations only, a depth limit, and a result cap. Ranked: direct hit
first, then the realizable core, then the rest.

Two things follow from this that are worth stating.

**It is the difference between the graph mattering and not.** If search is purely lexical,
relations contribute nothing to discovery and the graph is decorative outside of inference.
The claim in Part 5.3 that connected synonyms *raise* effective recall is only true because
search traverses. Without cluster expansion, that claim is simply false.

**It is also orphan detection.** If a cluster's closure contains no realizable behaviour,
that cluster is a disconnected island — the actual defect defined in Part 5.3. The same
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

### 11.4 The gloss carries lexical search

This is the practical reason the gloss is plain text rather than Concept-expressed: text is
directly searchable. Concept-expressed descriptions would need their own index to be
searched lexically, which is a second structure to maintain for no gain over the text.

Meaning still lives in the realizations. The gloss is an index, not an authority.

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
   supply behaviour (Part 5.4). Then research: web search and structured sources, with
   results turned into Concepts. Then composed reasoning, which may include a conversation
   the system holds with itself.
5. **Ask the Teacher, last.** A larger local model, given the original request, the gap, the
   research evidence, and lookup access to existing Concepts, returns complete Concept
   units. It may be asked about several gaps at once.
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

### 13.2 No fourth store

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

### 16.1 Why this needs Part 2 to hold

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
| 1 | Descriptions should be "expressed in Concepts", but lookup needs searchable text. | No privileged `meaning` field. Meaning is the realizations; the gloss is plain searchable text and not an authority. Part 4. |
| 2 | Everything is a Concept, but the trace "does not have to be". | Writing is an ambient effect; reading is a Concept. Otherwise selection policy and self-analysis leak into host code. Part 15.1. |
| 3 | An unknown Concept raised an error, but the parser is supposed to invent freely. | An absent Concept yields a residual, exactly like a missing realization. Raising would make invention fatal. Part 8.2. |
| 4 | `SynonymOf(X())` as a relation and a forwarding realization say the same thing twice. | The relation is the source of truth; the forwarding realization is derived from it. Part 5.4. |
| 5 | Relations are Concept expressions, so are they evaluated? | No. Asserted, matched, traversed. They routinely cycle, and implicit evaluation would loop. Part 5.1. |
| 6 | Statistical selection versus declared contextual meaning. | Specificity dominates absolutely; statistics only break ties among equally specific candidates, or meaning drifts. Part 9.1. |
| 7 | "Decide which in different scenarios" for ambiguity, without saying how. | The policy is itself a realization selected by context, so it is inspectable and changeable. Part 9.3. |
| 8 | No versioning, but the system edits itself. | Realizations and relations are append-only, so an edit never destroys anything and recovery is the new realization losing selection. Versioning would be the wrong granularity. Part 3.1. |
| 9 | Does a bare `490` match `Number(490)`? | No. Distinct expressions, distinct patterns, explicit lifting. Implicit coercion would make matching dishonest. Part 10.1. |
| 10 | Isolated conversations may change shared Concepts but leave no transcript. | Deferred, not specified. Anticipated for future users, not needed now. The asymmetry is recorded as a question to settle before building it. Part 14.2. |
| 12 | Synonyms "raise recall", but a lexical search only ever returns the name that matched. | Search expands a hit over equivalence relations and returns the cluster. The recall claim is false without this. Part 11.1. |
| 11 | Traversal and inference have to happen somewhere. | In realizations of the relation Concepts, not in the store or evaluator. Part 5.5. |

---

## 19. Open questions

- **What counts as success.** Required before statistical tie-breaking is more than a
  placeholder. No universal metric should be assumed; outcome-per-context logging is the
  available starting point, and until it is settled, ties fall back to declaration order,
  which makes behaviour depend on list position.
- **Unbounded realization growth.** Append-only means the store grows without limit while
  the active set stays at one per pattern-and-context pair. Shadowed and retired
  realizations are never collected. Probably fine for a long time; unmeasured.
- **Gloss drift.** Nothing detects a gloss that contradicts its realizations. A check may be
  possible by generating a gloss from the realizations and comparing.
- **Cost of open-world queries.** Distinguishing false from unknown requires searching for a
  contradicting relation, not just failing to find a supporting one. The traversal cost of
  that at scale is unmeasured.
- **Orphan detection at rest.** Part 11.1 detects disconnection whenever a cluster is
  searched, which covers discovery. Nothing sweeps the graph proactively for islands that
  are never searched for.
- **When `Exist` runs.** Continuous autonomous operation is in scope by requirement but
  deliberately deferred until the network can think well enough to make it useful.
