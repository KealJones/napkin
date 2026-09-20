# Judgment, preference, and context-dependent truth

Research notes behind a deliberate omission. This document exists so that a future
reader does not seed `Better(Gain(), Loss())` and then spend a week working out why the
diet advice is wrong.

Companion to `concept-spec.md` (Part 9.3, incomparable facets) and `seed-concepts.md`
(Part 12, deliberate omissions). Sources are listed per section, and the four underlying
research passes are kept in `research/judgment/`.

---

## 1. How the problem was found

The system was asked: *"If you could choose between getting 1 million dollars or owing 1
million dollars, which would you choose?"*

It parsed that correctly and then described the question instead of answering it. The
obvious repair was to give it a preference relation. That repair collapsed four times, each
time one level deeper:

| Attempt | Counterexample |
|---|---|
| `Better(Gain(), Loss())` as a global fact | For bodyweight, loss beats gain. |
| Scope it to the subject: `Dollar: Better(Gain(), Loss())` | Money has conflicting goals — accumulation, generosity, enjoyment. |
| Scope it to the goal: `in For(Accumulation())` | `Bodyweight: Better(Loss(), Gain())` is still false for someone underweight. |
| Scope it to the current state | The reference point itself moves: what counts as underweight depends on the person, and on whether they are happy with their weight. |

Four exceptions in a row is not a missing facet. It is a sign that the primitive is wrong.

The working hypothesis that came out of it: **preference cannot be stored as a fact at
all.** Only the structure of the tradeoff can be stored — reference points, and which
direction each option moves — and the verdict must be computed at the point of asking,
against something the asker supplies.

The research below was run to test that hypothesis against the literature. It holds up
better than expected.

---

## 2. The single result

**Every formalism surveyed separates two things, and none of them derive the second from
the first.**

| Formalism | Structure (storable) | Ordering (supplied from outside) |
|---|---|---|
| CP-nets | dependency graph over variables | the conditional preference table |
| TCP-nets | which variables conflict | relative-importance edges |
| Default logic | the defaults themselves | a priority relation over them |
| Circumscription | the theory | the minimize/fix/vary partition |
| Value-based argumentation | arguments and the attack relation | the audience's value ordering |
| Prospect theory | the value function's shape | the reference point |
| MAUT / TOPSIS / AHP | the criteria | numeric weights |
| Lexicographic ordering | the criteria | a total priority order |

Six independent literatures — knowledge representation, philosophical logic, economics,
psychology, operations research — arrive at the same split without coordinating. The
ordering is always an input. It is never a consequence of the facts.

This matters because it means "the graph holds the structure, the person supplies the
weights" is not a design compromise. It is a repeatedly rediscovered result, and a system
that stored a verdict would be storing the output of someone else's weighting as though it
were a fact about the world.

---

## 3. The problem already has four names

Useful, because each one comes with a literature.

**The Nixon Diamond** (non-monotonic reasoning). Quakers are pacifists; Republicans are
not; Nixon is both. Two defaults, equally specific, conflicting on incomparable
dimensions. Default logic produces two unranked extensions. Every specificity-based system
surveyed either reports the ambiguity or demands hand-supplied priority. **Surfacing the
conflict is the standard academic answer, not a workaround** — which is exactly what
`concept-spec.md` Part 9.3 already decided to do, for grammatical rather than moral
reasons.

**Relative gradable adjectives** (Kennedy, *Linguistics & Philosophy*, 2007). Adjectives
like *big*, *heavy*, *expensive* and *good* take their standard of comparison from an
implicit **comparison class**. This is why a big mouse is smaller than a small elephant.
Kennedy's account is mature and formally worked out. No major knowledge base surveyed —
Cyc, ConceptNet, SUMO, DOLCE — adopted it. The claim that "evaluation needs an implicit
comparison-class argument" is well-established linguistics, not a novel assertion.

**Ceteris paribus preference** (von Wright 1963; van Benthem, van Otterloo & Roy 2009).
"Better" is not a two-place relation on propositions. It only means anything once you fix
a set Γ of what is held constant, and *no logic derives Γ* — it is always a modelling
choice. This is the formal version of the weight-loss objection: change what you hold
fixed and the preference flips.

**Reference dependence** (Kahneman & Tversky 1979). Whether something counts as a gain or
a loss is a property of the *(outcome, reference point)* pair, not of the outcome. The
value function is asymmetric around the reference and its curvature flips sign across it.
This is precisely why `Better(Gain(), Loss())` was doomed at every scoping level: gain and
loss are not categories an option belongs to.

---

## 4. What can be answered for free

**Pareto dominance.** A dominates B if A is at least as good on every criterion in play
and strictly better on at least one. It requires no weights, no numbers, and no priority
order. It is a *partial* order and is provably silent whenever two options genuinely trade
off.

That silence is the specification, not a defect, and it explains the original asymmetry
exactly:

- *A million dollars vs owing a million* — one option dominates on every dimension in
  play. There is no goal under which owing is better. **Answerable with no weighting.**
- *Lose weight vs gain weight* — each carries costs and benefits that cut in different
  directions depending on the reference point. **Not dominance-answerable, and no amount
  of extra facts makes it so.**

In practice dominance is a strong filter and a weak decider: reported front sizes include
33 non-dominated options out of ~15M candidates, and 171 out of ~250M. It discards well
over 99% of a large space and still leaves a handful of mutually incomparable finalists.
Those finalists are where contested choices live, and a two-option question that survives
the filter sits there by definition.

**The design consequence.** Answer when one option dominates. Surface the tension when it
does not. That single rule covers most of what people expect an answer to, and refuses
precisely the cases where a stored preference would have been someone's opinion wearing a
fact's clothes.

*Sources: Pareto surveys (arXiv 2407.00359); GECCO 2007 front-selection study; Kahneman &
Tversky 1979.*

---

## 5. The ceiling on a numberless engine

Qualitative reasoning already built the vocabulary this problem wants. QSIM's
`qdir(x) ∈ {inc, std, dec}` is a direction of change, and its quantity spaces express a
value by its ordinal position relative to landmarks. Forbus's qualitative proportionality
`Q1 Q∝+ Q2` asserts a monotonic dependence with no functional form and no magnitude. That
is "reference point plus direction," off the shelf, from 1984.

**And it has a documented wall.** In sign algebra, multiplication is fully determined but
addition is not:

```
(+) · (-) = -        determined
(+) + (-) = ?        undetermined
```

That single gap is the seed of the entire ambiguity problem in qualitative physics. The
moment two opposing influences combine, the algebra cannot resolve the outcome, and the
`?` does not stay local: coupled variables propagate it into multiple live hypotheses,
each hitting further `?` downstream. QSIM is sound but generates *spurious* behaviours that
match no real system, and Kuipers characterised some of these as **ineradicable** — provably
not removable by adding more qualitative distinctions.

The field's own remedy was to give up on purity. Kuipers and Berleant's Q2/Q3 re-inject
numeric interval bounds specifically to prune spurious branches. Order-of-magnitude
reasoning (Raiman's FOG, Mavrovouniotis's O[M]) exists precisely to establish when one term
dominates so the addition can be resolved. This is widely cited as why qualitative physics
did not scale.

**Directly applicable warning.** "Gain versus loss on a dimension where both pull" is a
`(+) + (-)` case. Any design that combines direction-of-change facts arithmetically will hit
this wall. Two ways around it, and only two:

1. Never combine directions arithmetically — keep one dominant relation per decision.
2. Accept `unknown` as a first-class, non-explosive output instead of branching into all
   consistent possibilities.

Option 2 is already the system's stance. Three-valued open-world truth and residual
evaluation are, whether or not it was designed for this, the standard sidestep of the
historical explosion. Worth knowing that the stance is load-bearing for more than it looks.

*Sources: Kuipers, "Qualitative Simulation," AIJ 29 (1986); "Causes of Ineradicable Spurious
Predictions," JAIR 27 (arXiv 1110.0020 — title and abstract verified, full text could not be
parsed in this pass); Forbus, "Qualitative Process Theory," MIT AI Memo; de Kleer & Brown,
"Foundations of Envisioning"; Raiman, AAAI-86.*

---

## 6. The shape that survives

Two qualitative calculi did scale: **Allen's interval algebra** (13 relations over time
intervals) and **RCC-8** (8 topological relations over regions). Both are still in
production use in temporal databases, GIS and language processing.

The reason they worked is structural, not domain-specific. Their relation sets are:

- **closed** — no open-ended discovery of new relations at runtime;
- **small** — 13 and 8 respectively;
- **jointly exhaustive and pairwise disjoint** — every pair stands in *exactly one* base
  relation, so there is no analogue of the `?` gap;
- **reasoned over by table-lookup composition**, not by simulation.

Even these degrade when pushed: consistency checking is NP-complete in general, and
combining the spatial and temporal calculi can reach PSPACE- or EXPSPACE-complete, or
undecidable, depending on the interaction primitives chosen.

**This is the most actionable finding in the whole survey, and it applies well beyond
preference.** It is a design constraint on the relation vocabulary as a whole: prefer small,
closed, mutually exclusive relation families with a defined composition, over open-ended
vocabularies where any two relations might interact in undefined ways. `seed-concepts.md`
Part 2 should be read with this in mind.

*Sources: Gerevini & Nebel, ECAI 2002; "A Survey of Qualitative Spatial and Temporal
Calculi," arXiv 1606.00133.*

---

## 7. What everyone else built, and what happened

**Cyc — microtheories.** The closest working precedent. Every assertion is indexed to a
microtheory; microtheories form a partial order under `genlMt`; contradictory facts coexist
because no query spans both unless a human writes a *lifting rule* to bridge them. The
mechanism worked. Nothing around it did: roughly 40 years, ~$200M and ~2000 person-years
produced a system Pedro Domingos calls "a catastrophic failure" and Gary Marcus — far more
sympathetic, and Lenat's co-author on his final paper — calls "neither a success nor a
failure... a ground-breaking, clarion experiment that never fully gelled."

The failure mode is specific and it is the one to watch: **hand-authored bridges between
contexts scale combinatorially.** Someone must write a lifting axiom for every pair of
microtheories that needs to interact. A system requiring a human to write a bridge every
time two contexts meet does not get past a few hundred contexts.

Ernest Davis wrote a dedicated evaluation of Cyc essentially because its behaviour was
opaque to outsiders — a closed KB the field could not independently pressure-test, which is
its own lesson.

**McCarthy — `ist(c, p)`.** The theoretical ancestor of Cyc's contexts: propositions are
never true, only true-in-a-context, with lifting axioms to move facts to more general
contexts. Influential as logic; never deployed at scale. Ghidini and Giunchiglia later
proved lifting axioms are **strictly less expressive** than the rival bridge-rule mechanism
of Multi-Context Systems. A pure "lift the assertion to a broader context" approach is
provably not enough for some cases.

**Wikidata — qualifiers and ranks.** The most successful deployed analogue. Statements carry
qualifiers constraining when and where they hold (time, jurisdiction, determination method),
and ranks (preferred / normal / deprecated) decide which of several simultaneously-true
statements wins by default. Two honest limits: qualifiers attach per statement and are not
reusable named context objects, and **rank is manually curated, not computed** — Wikidata
does not infer that a more-constrained qualifier set should beat a less-constrained one.

**ConceptNet.** No context mechanism at all. A scalar crowd-sourced confidence weight per
assertion, with contradictory assertions simply coexisting. Its own evaluation puts ~15.5%
of assertions at "false or vague." The clearest "didn't try" baseline.

**SUMO and DOLCE.** Neither represents evaluative predicates. DOLCE's quality/quality-space
model is a genuinely reusable pattern for scalar *measurement*, but a DOLCE weight is an
absolute point on a scale; "heavy for a mouse" needs a convention DOLCE does not supply.
This is a gap nobody filled, not an attempt that failed.

**FrameNet — the Desirability frame.** The most conceptually on-point prior art found. An
evaluative frame with explicit slots for *Evaluee*, *Parameter*, *Comparison_set*,
*Circumstances*, *Affected_party* and *Degree*. That is a linguistically validated schema
for "evaluation is a relation with an implicit context argument," including a slot for the
comparison class and for *whom* the evaluation is relative to. It is built for annotating
text, not for live reasoning — but as a schema for what the arguments of an evaluative
predicate should be, it is already worked out and worth copying rather than reinventing.

*Sources: Cyc AI Magazine overview; Marcus, "Doug Lenat, 1950-2023"; Lenat & Marcus, arXiv
2308.04445; Davis, "Evaluating CYC"; McCarthy, "Notes on Formalizing Context," IJCAI 1993;
Ghidini & Giunchiglia, LNCS; Wikidata Help:Qualifiers and Help:Ranking; ConceptNet 5 wiki;
Kennedy, "Vagueness and Grammar"; FrameNet Desirability frame.*

---

## 8. What philosophy says

The formal pass deliberately skipped moral philosophy. That was a mistake, because the
formal literatures all *stop* at "incomparable" and philosophy is where the argument about
what incomparability actually is has been happening.

Philosophy does not settle this. That is not a disappointment — the specific shape of the
disagreement is more useful here than a verdict would have been.

### 8.1 The deepest version of the result

**Hume's is/ought gap.** No set of descriptive premises entails an evaluative conclusion.
The graph is entirely `is`. Six formal literatures independently rediscovering the
structure/ordering split is arguably just this, restated in six technical vocabularies.

Honest caveats, because the gap is less airtight than it is usually quoted as being. Hume's
passage is genuinely ambiguous between a narrow logical claim and an early noncognitivism.
Searle's promise-derivation is widely read as *relocating* the gap — smuggling the
evaluative content in through institutional premises — rather than closing it, which is
itself informative: the evaluative content has to enter somewhere. And Putnam argues the
fact/value *dichotomy* is unsustainable, because thick terms and even epistemic virtues
like "coherent" and "reasonable" are already value-laden. That last point bites: a system
that claims to hold only facts should not assume its own vocabulary is evaluatively inert.

**Moore's open question argument** reaches the same place by a different route and is now
generally considered question-begging (Frankena), though its conclusion still has
defenders. Worth knowing mostly so as not to lean on it.

### 8.2 Anscombe: "better for what?" is constitutive, not an extra argument

Earlier in this investigation, `For(...)` was treated as a context facet that evaluation
*needs*. Anscombe's claim is stronger: you cannot simply want something. You want it under
a **desirability characterisation**, some aspect under which wanting it is intelligible. An
unaspected preference is not a degraded preference; it is not a preference at all.

So a system that answers "better for what?" is not falling back for lack of data. It is
giving the only coherent form the question has. That reframing is worth more than it looks:
it makes asking the *correct* response rather than the apologetic one.

### 8.3 The one that changes code: tentative vs assertive incompleteness

**Amartya Sen** argues that incompleteness in a preference ordering can be the right
answer rather than a defect to repair, and rejects completeness as a requirement of
rationality. He distinguishes:

- **tentative incompleteness** — the ordering is unsettled, and more information would
  settle it;
- **assertive incompleteness** — the ordering is settled *as incomplete*. There is
  positively no fact of the matter.

The system's `unknown` currently conflates these. They are different states with different
consequences: only the first is a gap a Teacher could ever close. The learning loop
presently treats every unresolved comparison as tentative, so it would chase an assertive
gap forever, and any answer it eventually produced would be invented.

**Ruth Chang's parity** is the same distinction argued at the level of the value relation
rather than the ordering. Her claim: better/worse/equal is not exhaustive, and a fourth
positive relation — *on a par* — exists. The test is the small-improvement argument. If two
options were genuinely equal, sweetening one slightly would break the tie. For genuinely
hard choices it does not, which Chang takes to show they were never equal, nor better, nor
worse.

**And this is contested.** Broome, Gustafsson and Espinoza each argue that vagueness in
"better than" explains the same cases without positing a new relation. The dispute is live.
It shows up again as the standing split on what makes a hard choice hard:

| View | Hardness is | Resolvable by more information? |
|---|---|---|
| Vagueness | linguistic indeterminacy | yes, in principle |
| Parity | a real, sui generis value relation | no |

**The design consequence survives the disagreement**, which is why it is worth acting on. We
cannot decide the vagueness/parity question by fiat any more than we can decide someone's
values by fiat. But both sides agree the two states are *different*, so the system should be
able to represent both and should not silently assume every gap is the closable kind.

Concretely: an unresolved comparison the asker has declared assertive is not a learning
target, and the loop should stop rather than teach. That is a small change with a real
consequence — it is the difference between "I have no basis to prefer" and a fabricated
preference.

### 8.4 Holism of reasons: the weight-loss example, generalised

**Jonathan Dancy's particularism** holds that reasons are *holistic*: a feature that counts
in favour in one context can count **against** in another — not merely be outweighed. That
is `Better(Gain(), Loss())` exactly. Gain is a reason for, on money, and a reason against,
on bodyweight, and no defeater structure captures the flip. The mechanism is
enablers/disablers and intensifiers/attenuators — things that act on reasons without being
reasons themselves.

Two corrections to how this is usually reached for:

**Dancy's anti-principle conclusion is weaker than it sounds.** He does not derive "no
principles" as an entailment from holism. The argument is that exceptionless principles
would be unexplained "cosmic accidents."

**The opposition is substantial and the debate is unresolved.** McKeever & Ridge argue
holism is itself codifiable through conditioned principles. Little and Lance argue
defeasible generalisations survive holism intact. Hooker argues principles can be
metaphysically grounded rather than accidental. Jackson, Pettit & Smith argue particularism
implausibly requires skill without pattern recognition. SEP treats the whole dispute as
generative rather than settled.

So: holism names the phenomenon precisely and does **not** license the conclusion that
nothing general can ever be stored. The honest position is that the flip is real and whether
it is codifiable is open.

### 8.5 Pluralism, and the 2,400-year-old instinct

**Isaiah Berlin's value pluralism**: values are irreducibly plural, genuinely conflict, and
share no common currency. Berlin insists this is not relativism — the values are objective
and cross-culturally intelligible, you can understand a value you do not hold. SEP flags
real ambiguity in how he grounds that objectivity, and notes a radical reading of his own
words threatens the distinction he wants. The distinction matters here anyway: plural
conflicting values are not the same claim as "anything goes," and a system that surfaces a
tension is not thereby saying the tension is arbitrary.

**Nussbaum** traces the move this whole investigation kept trying to make — find the one
measurable quantity and all conflict dissolves — back to Plato's *Protagoras*. The MAUT
instinct is roughly 2,400 years old and has been under attack for about that long. She flags
that her own reading of the passage is contested, which is fitting.

**Williams on thick and thin concepts**: *good* and *right* are thin; *cruel* and
*courageous* are thick, fusing description and evaluation inseparably. If he is right, the
clean separation this document relies on — facts in the graph, values supplied by the asker
— is cleaner in the architecture than it is in the vocabulary. `Healthy`, `Wasteful` and
`Fair` are thick. Critics dispute whether needing evaluative competence to *apply* a term
entails that its meaning is inseparable, so this is not settled either, but it is the
sharpest objection to this document's own framing and belongs here rather than buried.

*Sources: SEP entries on Hume's Moral Philosophy, Moral Non-Naturalism, Value Incommensurability,
Isaiah Berlin, Moral Particularism, Thick Ethical Concepts, Practical Reason, and Aristotle's
Ethics; Chang, "Hard Choices"; Searle, "How to Derive Ought from Is"; Putnam, "The Collapse of
the Fact/Value Dichotomy"; McKeever & Ridge, "Principled Ethics". Full URLs in
`research/judgment/research-metaethics.md` and `research-practical-reason.md`.*

---

## 9. What arguing about it added

The sections above are literature. This one is not — it came out of pushing on the trolley
problem until the framing broke, and it changed the recommendation more than any of the
research did. Recorded because the reasoning is checkable even though the source is a
conversation.

### 9.1 Dissolution is not resolution

The claim in Part 8.3 is that the system should stop treating every unresolved comparison
as closable. That claim was immediately tested by supplying a new fact: pull the switch
*halfway* and the trolley derails, killing nobody.

That does produce an answer. It does **not** resolve the dilemma — it **dissolves** it. The
original pair is untouched: five versus one, still incomparable, still nothing settling it.
A third option appeared that dominates both, so the comparison stopped being load-bearing.

The two are indistinguishable if the test is "did an answer appear," which makes the
tentative/assertive split unimplementable as originally stated. The test has to be
structural:

| What changed | Reading |
|---|---|
| the relation between the existing options | tentative — the gap was closable |
| the option set, by a dominating addition | dissolution — the gap is untouched, just no longer load-bearing |

Comparing option sets before and after is checkable. Without it, Part 8.3 is a nice idea
with no implementation.

### 9.2 The option set is a claim, not a given

Every `Choose(A, B)` carries a second assertion — *and those are the only options* — which
arrives as grammar rather than as content and is therefore never examined.

This is an inconsistency with the system's own commitments. The graph is **open-world**:
absence of a fact is `unknown`, never `false`. But an option set delivered by a question is
treated **closed-world** — complete and authoritative. Nobody decided that; it fell out of
the parse.

The repair uses grammar that already exists. The Ears mark form routinely — `Fuzzy(...)`,
`Correction(...)`, `Misspelling(...)`. Exhaustiveness is the same kind of thing: write the
implicit `Only(A, B)` down and it becomes an ordinary proposition that can be questioned,
rather than a structural assumption that cannot be seen.

Note the failure this catches is not exotic. "Would you rather have a million dollars or owe
a million dollars" has a true answer that is neither option: nobody faces that choice.

### 9.3 The setting decides whether invention is allowed

`Only(A, B)` does not default to `unknown`. Whether the option set is closed depends on the
setting, which makes it a facet rather than a global policy:

| Facet | `Only(A, B)` | Consequence |
|---|---|---|
| `MultipleChoice()` | true | closed-world is correct here; inventing an option is cheating |
| `Casual()` | unknown | invent freely, nothing rides on it |
| `Urgent()` | unknown, but unsearchable | the set may be open and there is no time to look |

So the open/closed-world inconsistency in 9.2 is not a bug to fix globally. It is a facet
nobody had written down.

### 9.4 Deliberation needs a budget

"Why not throw yourself in front of the trolley? Is your life worth more? Why do you get to
choose?" — this is real literature (agent-relative permissions, the demandingness
objection) and the finding is that **it does not terminate**. Questions can be generated
indefinitely.

The evaluator already solves the structurally identical problem with `maximumDepth` and
`maximumSteps`. Practical deliberation needs the same thing, and Aristotle's account agrees:
deliberation ends when it reaches something that can be done now, not when the questions run
out. Phronesis is substantially the skill of knowing when to stop.

Two consequences. A good decision stops at the right depth rather than the greatest one, so
depth is not a proxy for quality. And philosophy is recognisably the mode where the budget
is deliberately raised — which suggests the budget should be a facet like everything else,
not a constant.

### 9.5 The real blocker is grounding, not formalism

Parts 1-8 diagnose a preference-representation problem. That diagnosis is incomplete, and
the incompleteness matters more than anything in it.

When the system was asked to choose between a million dollars and owing a million, it
learned `Dollar` and `Million` **in the same turn it was asked to value them**. It does not
know money buys things, that debt compounds, that a million is life-changing rather than a
large number, or that society runs on the stuff. There is nothing to prefer with.

The research established that the *ordering* must be supplied from outside. It missed that
the system does not have the *structure* either — it cannot say which dimensions are in
play, because it does not know what money does. Two levels are missing and only the far one
was written up.

This is better news than it sounds. `Better` is not blocked on an unresolved problem in
philosophy. It is blocked on the graph being a toddler, and the fix for that is to keep
teaching it.

It also means the original episode was an architectural success. Asked a question far beyond
what it knew, the system declined instead of confabulating. A two-year-old saying nothing to
"would you rather have a million dollars" is the correct output. Bad question, right answer.

---

## 10. Where this leaves the design

**What the design already gets right, and should not be talked out of.**

Part 9.3 refuses to impose a facet priority order, on the grounds that any such order
"would be arbitrary and would quietly decide questions of meaning by fiat." That is the
Nixon Diamond answer, arrived at independently and for grammatical reasons. It generalises
to values unchanged: a system that ranked `For(Health())` above `For(Enjoyment())` would be
deciding someone's life by fiat.

Three-valued open-world truth and residual evaluation are the sidestep of the sign-algebra
explosion. `unknown` as a first-class value is what keeps ambiguity from branching.

Facets being *matched* rather than *nested* is what makes the conflict detectable at all.
Part 9.3 already notes this; the research reinforces it, because every formalism surveyed
treats detectability as the whole value of the exercise.

**What appears to be genuinely novel.** Cyc's `genlMt` order is hand-curated. Wikidata's
rank is hand-curated. Neither computes specificity. Facet-subset matching with automatic
specificity ordering — more facets wins, equally specific on different facets is
incomparable — does automatically what both of those systems do by hand.

That claim is worth recording, and worth hedging: it is drawn from one research pass over
these systems, not from an exhaustive survey, and "nobody automates this" is an inference
from absence of documentation rather than a verified negative.

**The risk to watch, named early.** Cyc's failure was hand-authored bridges between
contexts. The equivalent here would be needing a hand-written translation whenever two
disjoint facet vocabularies must interact. The design should decide deliberately whether
it ever supports lifting a fact from one facet context to a broader one — and the honest
reading of both Cyc's outcome and the Ghidini/Giunchiglia result is that a pure lifting
mechanism is both insufficient and unaffordable. Refusing lifting outright is a defensible
position and should be a stated one.

**One tripwire for later.** If relations are ever formalised as a description logic for
decidability guarantees, adding facet-based defeasibility on top is the move that breaks
it. Circumscription over DLs stays decidable only if role names are fixed — allow them to
vary and basic ALC becomes undecidable — and the safe restriction still costs
NEXPTIME^NP. Defaults and DL decidability are close to mutually exclusive.

---

## 11. Recommendation

**Grounding comes before any of this.** Part 9.5 is the controlling finding: the system
could not weigh a million dollars because it did not know what money is. Every item below
assumes a graph that knows what the options *do*, and none of it is worth building into a
graph that does not. A preference engine over ungrounded Concepts would produce confident
noise, which is strictly worse than the honest refusal the system already gives.

The practical consequence is that the next move here is not on this document's subject at
all. It is teaching the graph more about the world, by the ordinary learning path. Come
back to preference when a question about money has something to draw on.

**Do not seed `Better`, `Choose`, or any preference relation.** The literature is
unanimous that the verdict is not a storable fact, and a seeded one would encode whoever
wrote it. The no-stubs rule in `seed-concepts.md` Part 1.3 already forbids it on
independent grounds: the behaviour cannot be honestly written, so the absence should
produce a residual.

**Then, when it is wanted, in this order:**

1. **Dominance.** Answer when one option is at least as good on every dimension in play.
   No weights, no numbers, no values. It covers the questions people expect answers to,
   and it is the only weighting-free verdict rule the survey found.
2. **The tradeoff as the answer.** When nothing dominates, return the conflicting
   dimensions rather than a winner. This is the Part 9.3 ambiguity path, and both ELECTRE
   and PROMETHEE chose it deliberately over forcing a total order.
3. **The goal as a supplied facet.** Let a question carry `For(...)` and let the existing
   specificity machinery select on it. The system should be able to *ask* for it — the
   machinery that turns an unknown input into "What should I multiply?" already knows how.
   On Anscombe's account this is not a fallback; it is the only coherent form of the
   question.
4. **Split `unknown` into tentative and assertive** (Sen). Tentative is a learning target.
   Assertive is a settled answer that happens to be incomplete, and the loop must stop
   rather than teach. This is the smallest change in this document with the largest
   consequence: right now every unresolved comparison is treated as closable, so an
   assertive gap gets chased until something is invented. The system does not need to
   decide which kind a given case is — the vagueness/parity dispute says nobody can — it
   only needs to stop assuming. Implement the test structurally, per Part 9.1: compare
   option sets before and after, because an answer arriving by dissolution is not the gap
   closing.
5. **Write the option set down as a claim** (Part 9.2). `Choose(A, B)` implies
   `Only(A, B)`, and until that is an expression rather than an assumption the system
   cannot notice a false dichotomy. Cheap, uses existing grammar, and catches a whole
   class of question that has no correct answer among the offered options.
6. **Make the setting a facet** (Part 9.3). `MultipleChoice()` closes the option set and
   makes invention wrong; `Casual()` opens it; `Urgent()` leaves it open and unsearchable.
7. **Give deliberation a budget** (Part 9.4), as a facet rather than a constant, since
   philosophy is exactly the mode that raises it.

**Do not build**, on the evidence:

- Numeric weights of any kind. MAUT weight elicitation is documented as unreliable:
  different elicitation methods give different weights for the same person, and
  "importance" is routinely confused with trade-off weight.
- **AHP in particular.** It is the most-used MCDA method and the most substantively
  attacked. Rank reversal — adding an option that beats nothing can flip the ranking of
  the existing ones — has been unresolved since Watson & Freeling (1982), and Dyer's 1990
  *Management Science* critique of its validity drew rebuttals from Saaty and from Harker
  & Vargas that never reached consensus. Its popularity is adoption momentum, not
  soundness.
- Inferring a reference point automatically. This is the thinnest literature of the six:
  every source treats the reference point as an unexplained free parameter. Status quo,
  goal and expectation are three different unreconciled proposals, and which applies is
  treated as an individual-difference question, not a derivable fact.

**If a set-point primitive is ever wanted**, the shape is well-precedented even though the
KR formalisation is thin: Coombs' ideal-point model (1950), economic satiation/bliss
points, and homeostasis as a control loop where good is *symmetric proximity to a target*
rather than monotonic in the quantity. Simon's satisficing adds the last piece — the
aspiration level is dynamic and context-set, not a constant, which is the formal version
of "depends whether you're happy with your weight."

---

## 12. Spec amendments

`seed-concepts.md` Part 12 already carries the row:

| Not seeded | Why | What it needs first |
|---|---|---|
| success/preference recording | tie-break evidence | generalisation across contexts unresolved |

"Generalisation across contexts unresolved" turns out to be exactly this problem, written
down before it was hit. Suggested amendments:

1. Extend that row's "what it needs first" to point here.
2. Add a row for `Better` / `Choose` explicitly, since the obvious repair is to seed them
   and the reason not to is non-obvious.
3. Note in `concept-spec.md` Part 9.3 that the refusal to impose a facet priority order is
   the Nixon Diamond answer, and that it is the standard result rather than a local
   judgement call. Part 9.3 currently reads as a judgement; it is stronger than that.
4. Record the Allen/RCC-8 finding as a constraint on relation vocabulary design in
   `seed-concepts.md` Part 2 — closed, small, mutually exclusive families compose; open
   ones do not.
5. Split `unknown` in `concept-spec.md`'s three-valued truth into tentative and assertive
   incompleteness, and make only the tentative kind a learning target. This is the one
   amendment here that changes runtime behaviour rather than documentation.
6. State in `concept-spec.md` that the open-world assumption governs *facts* but that an
   option set arriving in a question is currently treated closed-world, and that the
   resolution is a setting facet rather than a global policy (Parts 9.2 and 9.3). The
   inconsistency is presently silent, which is the worst form for it to take.
7. Record in `seed-concepts.md` Part 12 that the omission of preference is blocked on
   grounding first and formalism second (Part 9.5). As written, the omission implies the
   formalism is the obstacle, and that is the less important half.

---

## 13. Confidence

Verified against fetched primary or near-primary sources: the CP-net complexity
stratification (PSPACE-complete general, NP-complete acyclic, polynomial tree-structured);
the DL circumscription results; the ceteris paribus Γ parametrisation; the strong/weak
specificity distinction; Allen/RCC-8 complexity; the Dyer/Saaty AHP exchange; Wikidata
qualifier and rank semantics; ConceptNet's relation set and self-reported error rate;
Kennedy's relative/absolute distinction.

Part 9 is reasoning from a conversation, not from sources. It is recorded because the
arguments are checkable on their own terms, but it carries no citation weight and should be
read as design reasoning rather than as literature.

On the philosophy: high confidence on Moore/Frankena, the small-improvement argument's
structure, Berlin's doctrine, Williams's thesis, Dancy's holism and its major critics, and
Aristotle on phronesis — all sourced directly from SEP. Medium confidence on the current
balance of the Chang-versus-critics dispute and on Sen's exact terminology, which came from
secondary summaries rather than primary texts. Wiggins and Anscombe primary texts were not
read directly (paywalled); those points rest on secondary sources.

Lower confidence, flagged by the research passes: two qualitative-reasoning PDFs (Kuipers'
ineradicable-predictions paper and Raiman's FOG paper) did not parse, so claims about their
detailed mechanisms rest on verified titles and abstracts plus secondary discussion. ASP
preference complexity classes were recalled rather than confirmed. "SUMO does not represent
evaluative predicates" is an inference from absence of documentation, not a verified
negative. Pareto front-size figures are illustrative examples from individual studies, not
a general law.

---

## 14. Postscript: contextual relations, and what was actually objected to

An earlier draft of this section said contextual relations had been rejected. That is a
misreading of the record, and worth correcting precisely, because the two ideas it conflates
have different fates.

What was objected to was using a context facet to carry the **domain** — writing
`Better(Gain(), Loss())` in `Context(Money())` when the relation is stored on `Dollar` and
the subject already says it is about money. That is redundant, and the objection was right.

What was *affirmed* in the same breath was that money has many facets pulling different ways
— accumulation, generosity, enjoyment within reason — and that those need distinguishing.
Which is contextual relations, on a second axis. Part 8 above already draws the conclusion:
**the subject scopes the domain, the facet scopes the goal.** Neither is redundant and
neither replaces the other.

So the mechanism was never the objection. The objection was to one redundant use of it.

### 14.1 A second motivation, from a different direction

Polysemy needs the same mechanism and is easier to demonstrate, because the argument for it
does not depend on values at all. Asked about `Moment`, the Teacher returned:

```
Moment:  SynonymOf(Instant())   SynonymOf(PointInTime())   SynonymOf(BriefPeriod())
         IsA(ProperNoun())      IsA(Surname())             IsA(MusicSingle())
         IsA(WordWithMultipleMeanings())
```

Every one of those is true. A moment is a brief stretch of time, and there is also a band
called Moment and people surnamed Moment. The defect is not that it learned the band; it is
that all the senses are in one undifferentiated pile, so `SynonymOf(Instant())` sits beside
`IsA(MusicSingle())` as equally unconditional, and anything reasoning over the unit can
conclude that a music single is a brief stretch of time.

**The subject cannot scope this, because the ambiguity is the subject.** `Moment` cannot
disambiguate `Moment`. Facets can:

```
Moment:  IsA(Instant())      in Time()
         IsA(MusicSingle())  in Music()
```

So the asymmetry noted at the start — realizations carry a context and relations do not —
now has two independent motivations. The **goal** axis, where one subject holds several
conflicting preferences and only the facet separates them. And **polysemy**, where one name
carries several senses and no relation about it is true unconditionally. The second is the
better argument to build from, because it needs no view about values: nobody disputes that a
moment is a stretch of time and also a band.

Worth noting what the Teacher did when it had no way to express this: it coined
`IsA(WordWithMultipleMeanings())`. That is the model naming the gap and having nowhere to
put the answer, which is a better signal than a confident wrong relation and is the same
kind of evidence a residual is.

### 14.2 Built

Relations carry a context. `ConceptUnit.relations` holds `{ claim, context? }` rather than
bare expressions, and absent context means the claim holds anywhere — which is what every
relation written before this meant, so nothing had to be migrated.

| Query | Returns |
|---|---|
| `of(identity)` | every sense. Unchanged from before, so every existing caller behaves as it did. |
| `of(identity, { context })` | the claims that hold there, plus the contextless ones |
| `truth(s, p, o, context)` | three-valued per context: a claim absent in this sense is `unknown`, never `false` |
| `cluster(id, limit, equivalenceOnly, context)` | neighbours reachable in that sense |

A derived relation inherits the context of the assertion it came from. If `Moment` is a
synonym of `Instant` only under `Time()`, then the symmetric reading found from `Instant`
carries `Time()` too — otherwise symmetry would launder a scoped claim into a general one.

**Description reports every sense and says which is which.** Filtering to the active context
would hide a true fact because the asker did not name a sense; reporting them flat would
state that a music single is a stretch of time. So a scoped claim is rendered
`In(claim, context)` and nothing is dropped:

```
Relations(Moment())  ->  Describes(Moment(), List(
                           In(IsA(MusicSingle()), Music()),
                           In(IsA(Instant()), Time()),
                           IsA(Word())))
```

That is also the form the Teacher writes, so the round trip is one shape:
`In(IsA(MusicSingle()), Music())` in a declaration saves the claim under that context, with
`In` unwrapped on the way in — a context is where a relation holds, not part of what it
says.

The persistence format was free, as predicted. A contextless relation is still the bare
string it always was; only a scoped one needs the object form, and old graphs load unchanged.

### 14.3 What it cost

Not a local change. `concept-spec.md` Part 1 specifies the Concept unit as identity,
relations and realizations, with relations being bare expressions; giving them a context
changes that shape, and five things would have to agree about it:

| What | Why it changes |
|---|---|
| `ConceptUnit.relations` | a relation becomes a pair, not an expression |
| the two-directional index | entries carry the facet, so a query can filter on it |
| `truth(subject, predicate, object)` | takes a context, and selects by specificity like realizations do |
| `cluster` and description | a Describe under `Music()` must not report `SynonymOf(Instant())` |
| the persistence format | existing graphs have contextless relations and must keep loading |

The last one is free: an absent context means "holds in any context", which is exactly what
every relation written so far meant.

Selection is the part with a real design question rather than mechanical work. Realizations
resolve equally specific matches on different facets by surfacing ambiguity (Part 9.3), and
that is the right answer there because only one realization can run. A *relation* query can
return several, so the equivalent choice is whether asking without a context returns
everything, returns only the contextless ones, or refuses. Returning everything preserves
today's behaviour and is probably right, but it means an unqualified question still sees the
pile.

The interim measure is a Teacher rule: one sense per declaration, the sense the message is
about, silence about the others. It keeps the pile from forming without pretending the other
senses are unreal.
