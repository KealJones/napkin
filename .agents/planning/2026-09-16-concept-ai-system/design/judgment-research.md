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

## 8. Where this leaves the design

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

## 9. Recommendation

**Do not seed `Better`, `Choose`, or any preference relation.** The literature is
unanimous that the verdict is not a storable fact, and a seeded one would encode whoever
wrote it. The no-stubs rule in `seed-concepts.md` Part 1.3 already forbids it on
independent grounds: the behaviour cannot be honestly written, so the absence should
produce a residual.

**Build, when it is wanted, in this order:**

1. **Dominance.** Answer when one option is at least as good on every dimension in play.
   No weights, no numbers, no values. It covers the questions people expect answers to,
   and it is the only weighting-free verdict rule the survey found.
2. **The tradeoff as the answer.** When nothing dominates, return the conflicting
   dimensions rather than a winner. This is the Part 9.3 ambiguity path, and both ELECTRE
   and PROMETHEE chose it deliberately over forcing a total order.
3. **The goal as a supplied facet.** Let a question carry `For(...)` and let the existing
   specificity machinery select on it. The system should be able to *ask* for it — the
   machinery that turns an unknown input into "What should I multiply?" already knows how.

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

## 10. Spec amendments

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

---

## 11. Confidence

Verified against fetched primary or near-primary sources: the CP-net complexity
stratification (PSPACE-complete general, NP-complete acyclic, polynomial tree-structured);
the DL circumscription results; the ceteris paribus Γ parametrisation; the strong/weak
specificity distinction; Allen/RCC-8 complexity; the Dyer/Saaty AHP exchange; Wikidata
qualifier and rank semantics; ConceptNet's relation set and self-reported error rate;
Kennedy's relative/absolute distinction.

Lower confidence, flagged by the research passes: two qualitative-reasoning PDFs (Kuipers'
ineradicable-predictions paper and Raiman's FOG paper) did not parse, so claims about their
detailed mechanisms rest on verified titles and abstracts plus secondary discussion. ASP
preference complexity classes were recalled rather than confirmed. "SUMO does not represent
evaluative predicates" is an inference from absence of documentation, not a verified
negative. Pareto front-size figures are illustrative examples from individual studies, not
a general law.
