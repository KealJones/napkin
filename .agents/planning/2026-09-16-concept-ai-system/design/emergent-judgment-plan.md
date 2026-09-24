# Emergent prediction, choice, preference, and implication

Status: draft 1, 2026-09-22, nothing built. Companion to `concept-spec.md`,
`judgment-research.md`, and `memory-spec.md`. Nothing here overrides any of them; where it
touches `judgment-research.md`'s recommendations it says so and stays inside them. It
overlaps `memory-spec.md` in several places; section 7 says which document owns what.

---

## 1. What an LLM is actually doing

It is tempting to treat prediction, choice, preference, and "filling in what was implied"
as four capabilities. In a transformer they are one thing viewed four ways.

| Capability | What it is inside an LLM |
|---|---|
| prediction | a learned conditional distribution, P(next token given context) |
| implication | the high-probability continuation of what was left unsaid; defaults are just statistics of co-occurrence |
| relevance | attention: a query compares itself against every earlier position and pulls in the ones that match, weighted and normalised |
| similarity and generalisation | embeddings: things used in similar contexts end up near each other, so a new case borrows from its neighbours |
| preference | RLHF: pairwise human comparisons train a reward model, and the policy is pushed toward what won |
| choice | sampling from the distribution, with temperature deciding how often the less likely option is taken |

Three things are worth taking from that, and one thing worth refusing.

**Take:** it is all learned from a corpus of examples. Relevance is context-dependent
weighting, not a fixed lookup. Generalisation comes from compressing many examples into
shared structure.

**Refuse:** that the result has to be smeared across weights. Every one of those
mechanisms has a discrete, inspectable counterpart that fits Napkin's rules. The cost is
that Napkin needs several explicit mechanisms where the transformer has one opaque one.
The gain is that every inference has a path you can read, and a wrong inference has a
specific thing you can fix.

---

## 2. The thesis

Napkin already produces the corpus. **The trace is the training data.** Every turn
generates labelled examples: in this context, for this call, these candidates existed,
this one was selected, it produced this outcome, and the user's next turn accepted,
corrected, or retried it. An LLM company pays enormous amounts to get data shaped like
that. Napkin writes it as a side effect of running, and then throws it away at the end of
the process.

So the plan is five mechanisms, all reading from one durable evidence store, all
deterministic given the state of the graph and the evidence:

| Mechanism | Transformer analogue | Napkin form |
|---|---|---|
| **Evidence** | the training corpus | the persisted trace, read as a Concept |
| **Expectation** | learned defaults / next-token prediction | expectations: `Expects`, `Requires`, with contexts and evidence |
| **Relevance** | attention | bounded spreading activation over relations and co-usage |
| **Generalisation** | embeddings, compression | anti-unification of successful realizations into parent Concepts |
| **Choice** | sampling plus RLHF | dominance, then evidence with facet back-off, then the ambiguity policy |

"Deterministic" here means *replayable and explainable*, not *never wrong*. Given the same
graph and evidence, the same inference happens, and every assumed or chosen thing carries
the path that produced it. Where exploration uses randomness, the seed is recorded.

---

## 3. The five mechanisms

### 3.1 Evidence: the corpus

The trace records the selected realization by value, its context, its outcome, and its
caller. Today it lives in memory for one run. Persist it, append-only, as the spec already
says it should be (`concept-spec.md` Part 13, trace: durable, append-only). This is not a
fourth store. It is the third store actually being durable.

This is the same step as `memory-spec.md` build step 1 (stamps). The join key: every trace
event for a turn carries the `seq` of that turn's `Said` stamp, so turn-level signals (a
`Correction`, a retry, an explicit choice) are read from the next `Said` relation, not from
a second copy of the parse kept separately in the trace.

Reading it is a Concept (`concept-spec.md` Part 15.1), so every mechanism below reads
evidence through ordinary realizations, and the policies stay editable.

Signals, cheapest and most grounded first:

| Signal | Grounded? | Source |
|---|---|---|
| outcome: success, residual, failure | yes | already traced |
| external check: tests pass, code compiles, type-checks, HTTP 200 | yes | a realization that runs the check |
| used downstream: the result fed a later step that succeeded | yes | trace parentage |
| implicit negative: next turn is a `Correction`, a retry, or a `Ref` back with "no" | weak | the parse of the next turn |
| explicit choice: the user picked between shown options | strong | ambiguity policy's `ask` branch |

Grounded signals should outweigh self-reported ones. This is the direct answer to
`judgment-research.md` Part 9.5: grounding comes from the world pushing back, and tests,
compilers, and user corrections are the world pushing back.

Blame stays narrow, per `concept-spec.md` Part 9.4: a turn-level signal only adjusts
selections that were made by tie-break. Uniquely specific selections record nothing.

### 3.2 Expectation: how implication works

What an LLM does when it "knows" a jam website needs a checkout is complete a pattern it
has seen many times. The symbolic version of that is old and good: Minsky's frames and
Schank's scripts. Called expectations here because `frame` already means the request frames
`Do`, `Fact` and `Tell` (`seed-concepts.md` Part 10). An expectation is a Concept with
slots, and each slot can carry a default. What was implied but not said is **an expected
slot the prompt left empty**.

Napkin already has half of this. A default is a lower-arity realization
(`concept-spec.md` Part 6.4), and defaults are selectable by context. What is missing is
the relation that says a slot is expected at all.

A small, closed relation family, per the Allen/RCC lesson in `judgment-research.md` Part 6:

| Relation | Meaning |
|---|---|
| `Expects(x)` | usually present; absent is worth assuming or asking about |
| `Requires(x)` | must be present; absent means the thing is incomplete |
| `Excludes(x)` | must not be present |

These are contextual relations (already built), so `Expects(Checkout())` can hold on
`Website` in the context `Sell($x)` and nowhere else.

The completion step walks the realized request, collects the expectations of the Concepts
involved, and for each expected-but-absent slot produces one of two things:

```
Assumed(Checkout(), because=Expects(Checkout()))       a default existed
What(Price(Jam()))                                     no default; ask or research
```

An expected slot with no default is a hole, not a new kind of thing: it is written with an
interrogative where the unknown is, exactly like any other hole (`seed-concepts.md`
Part 10). It goes through the ambiguity policy's ask branch like any other hole. The runtime
already uses "gap" for residuals and unresolved references, so a separate `Gap` Concept
would have been a second name for something that already exists.

Three rules keep this honest.

1. **The Ears never does this.** Fidelity is preserved: the parse still says exactly what
   was said. Implication is added at realization, as a separate, marked layer.
2. **Every assumption is marked** with `Assumed(...)` and the relation that licensed it.
   The Mouth can say "I assumed a checkout page since you're selling something," and the
   user can retract it with an ordinary `Correction`. This is where hallucinations become
   traceable: an invented detail is either an `Assumed` with a named source or a bug.
3. **`Assumed` is `Lossy()` to project**, like the markers, so under `Describe()` the
   assumption stays visible as an assumption.

Where expectations come from, in the order they should be trusted:

1. **Evidence.** In the context `Sell($x)`, turns went on to involve `Checkout` in 7 of 9
   cases.
2. **Generalisation** (3.4). Every past `Website(Sell($x))` decomposition had a checkout.
3. **The Teacher, as distillation.** When learning an expectation-bearing Concept (`Website`,
   `Recipe`, `Trip`), ask for its `Expects` and `Requires`, the same way
   `concept-spec.md` Part 12 already asks for a relation's properties. This is how an
   LLM's knowledge gets pulled into inspectable form at bootstrap, before evidence exists.
   Teacher-sourced expectations carry that provenance, and evidence can overturn them.

### 3.3 Relevance: the attention analogue

Attention answers: given where I am, which other things matter right now? The discrete
version is **spreading activation** (Collins and Loftus, 1975). Start from the Concepts in
the prompt, push activation along relations, decay it with distance, and see what lights
up.

Spreading is the second term of one `Activation` Concept shared with `memory-spec.md`
Part 10.1, which supplies the base-level term. This is ACT-R's activation equation,
A_i = B_i + sum over j of W_j * S_ji (Anderson and Lebiere, 1998): `B_i` is the base-level
term from Part 10.1, recency and frequency of use; the sum is the spread computed here. One
Concept, two terms, one set of consumers.

```
Activate(List(Website(), Sell(), Jam()), context)
  Checkout      0.61   Sell -> Transaction -> Checkout
  Jar           0.44   Jam -> IsA(Preserve) -> PackagedIn(Jar)
  ProductPage   0.40   Website + Sell, co-used 5 times
```

Edges come from two places: relations in the graph, and **co-usage** derived from the
evidence store (Concepts that appeared in the same successful turn). Relation contexts
gate the spread, so `Moment` spreads toward music only in a music context.

One transformer detail matters a lot here. Attention normalises: a token that matches
everything gets diluted. The graph needs the same thing, or hub Concepts like `Thing` and
`Data` light up for every query. **Divide outgoing activation by fan-out** (the same idea as
IDF in search): this is ACT-R's fan effect, S_ji = S - ln(fan_j) (Anderson, 1974). That
single rule is the difference between a relevance signal and noise.

Relevance is then reused everywhere a "what's related" question already exists:

- which expectations the completion step consults (3.2),
- the Ears vocabulary band 1, replacing the substring match with activation,
- the Teacher's lookup, so it is shown what matters rather than what matched lexically,
- dormancy (`memory-spec.md` Part 10.2): what falls below threshold,
- `Ref` resolution: inside step 3 of `memory-spec.md` Part 8.2 ("the most recently
  focused"), activation ranks the candidates. The resolution order itself is owned there,
  not here; activation is not a second resolution policy. "It" resolves to the most
  activated candidate among those step 3 offers, with the path recorded.

Bounded by budget, like everything else. Deterministic, and every surfaced Concept comes
with the path that surfaced it.

### 3.4 Generalisation: how "jam is like honey" gets learned

An LLM generalises by compressing many examples into shared weights. The discrete
counterpart for a term language is **anti-unification**: the least general generalisation
of two expressions (Plotkin, 1970). Give it two successful decompositions:

```
Website(Sell(Jam()),     Pages(Home(), Shop(Jam()),     Checkout()))
Website(Sell(Candles()), Pages(Home(), Shop(Candles()), Checkout()))
```

and it returns the most specific pattern covering both:

```
Website(Sell($good), Pages(Home(), Shop($good), Checkout()))
```

That is a new realization with a variable, which is exactly the thing the realization
format already holds. The learner proposes:

- a parent Concept (named by the Teacher, say `SmallBatchGood`), with `IsA` from `Jam`
  and `Candles`,
- the generalised realization declared **on the parent**,
- the generalised realization's stamp sourced from a generalisation stamp, the same form
  `memory-spec.md` Part 11 uses for consolidation: the stamp carries the evidence count and
  span, rather than a relation pointing at the examples. A relation pointing at the examples
  would dangle if they are later collected; the stamp form lets them be collected safely
  (`memory-spec.md` Part 10.3, safety property 3).

The existing selection order makes this safe by construction. Inheritance distance comes
first (`concept-spec.md` Part 9.2), so Jam's and Candles' own specific realizations still
beat the parent's generalisation. The generalisation only fires for a child with nothing
of its own. Ask about honey, the Teacher (or research) says `Honey IsA SmallBatchGood`, and
honey gets the entire site decomposition by inheritance with no model call for structure.

Guards against over-generalising:

- **Coverage.** Propose only when the pattern covers at least *k* successful instances.
- **No counterexample.** A failed instance matching the pattern blocks it.
- **`IsA`, never `SynonymOf`.** The `Identity ≡ Chore` collapse came from transitive
  synonymy. Generalisation shares through inheritance, which shares deliberately and does
  not chain sideways.

Structural similarity handles analogy retrieval, the "which past case is this like"
question that feeds anti-unification: two Concepts are similar in proportion to the
relations and realization paths they share, weighted by specificity. It is a ranking,
never a merge.

### 3.5 Choice and preference

This stays inside `judgment-research.md`. That document separates two things, and so does
this plan.

**Value verdicts** (`Better(Gain(), Loss())`) are never stored. The research is right, and
nothing here changes it. Verdicts come from dominance, then from a supplied `For(goal)`,
then from surfacing the tradeoff.

**Behavioural evidence** is a different kind of thing: which default a person accepted,
which of two equally specific realizations produced a result that got used. That is not a
claim about the world. It is an observation, stored in the trace like any other outcome,
and turned into an ordering **at query time** by a realization. This is the same move as
`concept-spec.md` Part 5.3: derive, do not materialise. Observed frequencies are also not
the MAUT weights the research warns against. Those are *elicited importance*, which people
report unreliably. These are *observed choices*.

The materialisation rule, stated once: behavioural evidence is derived at query time; it is
stored as a fact only when doing so lets the evidence behind it be collected, which is what
`memory-spec.md` Part 11 consolidation does (for example `Likes(GrannySmith())`). The
false-abstraction risk is the same one noted there: repeated eating is evidence for liking,
not proof, so consolidation thresholds apply.

The choice procedure, in order:

1. **Generate candidates.** Competing realizations, alternative readings, and options
   proposed by relevance (3.3). The option set is a claim, per research Part 9.2, so
   write `Only(...)` down when the question implies it.
2. **Evaluate each under `Hypothetical()`.** A facet that declares
   `Suppresses(Effectful())`, exactly like `Describe()`. The same general rule, no new
   mechanism. This is simulation: run the option without touching the world. It is the same
   facet `memory-spec.md` needs for hypotheticals: `Believe` (`memory-spec.md` Part 5.4) is
   declared `Effectful()`, so content evaluated under `Hypothetical()` cannot be believed,
   with no special case inside `Believe`.
3. **Critique.** Run the completion step (3.2) against each candidate's result. Unmet
   `Requires` and `Expects`, residual count, and failures become the dimensions. This is
   the system discussing the prompt with itself, and it is traced.
4. **Dominance.** If one candidate is at least as good on every dimension and strictly
   better on one, take it. No weights.
5. **Evidence with facet back-off.** Among non-dominated candidates, prefer the one with
   better evidence in this context. If there is too little evidence for the exact facet
   set, back off: drop facets one at a time, most specific subsets first, until evidence is
   sufficient or no context remains. This is Katz back-off from n-gram language models, and
   it is a concrete answer to the open question in `concept-spec.md` Part 19 about
   generalising preference across contexts. A per-person preference is just a
   `For(User(...))` facet, so it backs off to the general case automatically.
6. **Ambiguity policy.** Still tied: pick, ask, or explore, as `concept-spec.md` Part 9.5
   already specifies. Deliberation has a budget, and the budget is a facet (research
   Part 9.4).

**Exploration** is the temperature analogue. Always taking the current favourite means a
worse early winner can never be dethroned. Occasionally trying a less-preferred candidate,
only in low-stakes contexts and never with nobody watching an effectful action, gathers
the evidence to correct that. The seed is recorded, so the run is still replayable.

### 3.6 Prediction proper

With a durable evidence store, next-step prediction is straightforward: sequences of heads
within a context, counted, with the same back-off as 3.5. Given `Do(Write(Function()))`,
how often did `Do(Write(Test()))` follow?

Prediction pays for itself three ways:

- **Surprise as a learning signal.** A result that contradicts a strong expectation is an
  agenda item, alongside residuals. Residuals say "I could not do this." Surprise says "I
  did this and it went differently than it usually does." That is the predictive-coding
  idea, and it gives `Exist` a second source of work.
- **Proactive gaps.** "You'll probably want tests for that" is a high-probability next step
  offered, not taken.
- **Agenda ranking.** `Exist` works first on the gaps whose heads appear most often in real
  prompts, instead of alphabetically or breadth-first. That is the demand-driven learning
  that avoids the diverging frontier in `design/README.md`.

---

## 4. Implementation plan

Each phase ends in something demonstrable end to end, per the no-stubs rule. Order is
chosen so each phase has the data the next one needs.

### Phase 0: Durable evidence

The foundation. Without a corpus, nothing below learns.

- Persist trace events, append-only, alongside the graph. Keep the by-value realization
  snapshot, and add a stable realization hash so evidence survives forgetting.
- Record per selection: candidate count, and whether tie-break (not specificity) decided.
- Record turn-level signals by reading the *next* turn's parse: `Correction`, retry of the
  same request, explicit choice.
- Add a trace-reading Concept (`Evidence(...)` or similar) whose realization queries the
  store by concept, realization, facets, and outcome.
- CLI: `napkin --evidence Multiply` prints counts by context.

**Demo:** run ten turns, restart the process, query the evidence, see it survived.

### Phase 1: Evidence-backed tie-break with facet back-off

Smallest behaviour change, and it proves back-off works before anything depends on it.

- Replace tier 3 in `runtime/select.ts` (recency, standing in for evidence) with evidence,
  falling back to recency when there is none.
- Implement back-off over facet subsets, with a minimum-evidence threshold per level.
- **Design decision to settle here:** the host must not learn a seventh identity. Either
  treat outcome ordering as structural (it is about the form of past evaluations, like
  recency already is) with thresholds read generically from relations, or route tie-break
  through a realization reached via the universal parent. The first is simpler and
  probably right for now. Write the choice down either way.

**Demo:** two equally specific realizations; the user corrects one twice; the other wins
next time. Then ask in a context sharing one facet with the first, and watch back-off carry
the preference over.

**Design decision, settled:** tier 3 is computed as a structural property of past
evaluations, the same way recency already was, rather than routed through a realization
reached via the universal parent. The alternative would need a Concept named `Evidence` or
`Score` to mean something specific to the evaluation loop, which is a seventh structural
identity, the exact thing Part 2.1 and Part 17.1 forbid. Computing
`(realizationHash, context, outcome) -> preference` in the host, generically, with no
Concept name ever appearing in that code, keeps the loop at six identities while still
giving every realization a `tracePath`-backed way to read its own history through
`api.events` (an ordinary host facility, not a special case). The minimum-evidence
threshold (`MIN_EVIDENCE` in `runtime/evidence.ts`) is one constant used at every facet-
subset level, rather than a relation read off some Concept: nothing yet needs the threshold
to vary by identity or by facet depth, and if that need appears, reading it from a relation
is a small, local change to one file, not a redesign. Reading it from relations would have
been the more extensible choice; the constant is the simpler one, and simple is right for a
threshold nothing has asked to differ yet.

One further decision this phase forced: concept-spec Part 9.4's signal table lists no
positive counterpart to "the realization failed, or produced a residual", only breakage is
scored, never success. Tier 3 follows that literally: a realization nobody ever pushed back
on scores 0, indistinguishable from a realization with no evidence at all. That is
deliberate, not an oversight, it keeps the mechanism a detector of bad choices rather than
a store of value verdicts (Part 5 guardrail), and it means the weak, self-reported turn-
level signal (a retry or an explicit rejection) has to carry real weight, since a
technically-successful realization the user kept asking again about would otherwise never
lose to its rival. Both a grounded failure and a weak follow-up subtract one point each, at
equal weight, for that reason.

### Phase 2: Expectations and implication

The most visible win.

- Seed the relation family `Expects`, `Requires`, `Excludes`, with their properties.
- Seed `Assumed(x, because=...)`, with its projection `Lossy()`.
- Write the completion step as a realization: collect expectations, find absent slots, emit
  `Assumed` where a default exists and a hole (an interrogative, `seed-concepts.md`
  Part 10) where not.
- Extend the Teacher protocol: when learning an expectation-bearing Concept, ask for its
  expectations, with contexts.
- Teach the Mouth to voice assumptions briefly, and route the resulting hole through the
  ambiguity policy (ask interactively, research in the background).

**Demo:** "make me a website to sell jam" produces `Assumed(Checkout())`,
`Assumed(ProductPage(Jam()))`, and `What(Price(Jam()))`; the system asks for the price and
says what it assumed. A follow-up "no checkout, just a contact form" retracts the
assumption through an ordinary `Correction`.

### Phase 3: Relevance

Amplifies Phase 2 and fixes several existing weak spots at once.

- Implement `Activate(...)` as a realization: bounded spreading activation over relations
  plus co-usage edges from Phase 0, gated by relation contexts, normalised by fan-out.
- Return ranked Concepts with their activation paths.
- Wire it into: the completion step's expectation selection, Ears vocabulary band 1, Teacher
  lookup, and ranking within `Ref` resolution's step 3 (`memory-spec.md` Part 8.2).

**Demo:** "what about the other one" resolves to the right referent with the path shown;
the jam prompt surfaces `Jar` and `Checkout` with readable reasons; a hub Concept like
`Data` does not dominate every result.

### Phase 4: Generalisation

The engine that lets training accumulate.

- Implement anti-unification over expressions (least general generalisation, with
  consistent variable naming for repeated differences).
- As an `Exist` job: cluster successful realizations by head and shape, anti-unify, and
  propose a parent plus generalised realization when coverage is at least *k* with no
  failing instance.
- Name the parent via the Teacher; attach `IsA`, and source the generalised realization's
  stamp from a generalisation stamp (`memory-spec.md` Part 11).
- Membership for new cases (`Honey IsA SmallBatchGood`) comes from research or the Teacher
  at learning time, using structural similarity to suggest the candidate parent.

**Demo:** build jam and candle sites. Ask for a honey site. Honey gets the full
decomposition by inheritance; the trace shows the inherited realization and the examples
it was generalised from; zero Teacher calls were spent on site structure.

### Phase 5: Deliberation and choice

Needs Phases 2 through 4, and a grounded graph. `judgment-research.md` Part 11 is clear that
grounding comes before any preference machinery, so a first seed import slice
(`../research/seed-dataset-sources.md`, reframed per its corrections) should land before
this phase, not after it.

- Seed `Hypothetical()` with `Suppresses(Effectful())` (the same facet `memory-spec.md`
  needs for `Believe`, Part 5.4, so no special case is needed there).
- Write `Deliberate(options, goal)` as a realization: evaluate under `Hypothetical()`,
  critique with the completion step, apply dominance, then evidence with back-off, then
  the ambiguity policy. (Named to avoid the `Choose` and `Better` preference relations the
  research says not to seed.)
- Deliberation budget as a facet.
- Exploration with a recorded seed, disabled for effectful actions and unattended runs.

**Demo:** two layout candidates for the jam site; critique finds one missing a checkout it
`Requires`; dominance picks the other; the trace reads as an argument you can follow.

### Phase 6: Prediction and surprise

Last, because it needs volume.

- Next-step counts over head sequences within contexts, with the same back-off.
- Surprise events when a result contradicts a strong expectation; add them to the agenda.
- Rank the `Exist` agenda by how often each gap's head appears in real prompts.
- Offer, never take, high-probability next steps.

**Demo:** after several "write a function" then "write tests" sequences, the system offers
tests; `napkin --agenda` ranks common gaps above rare ones.

---

## 5. Guardrails

- No host code names a semantic Concept. Every policy above is a realization. The six
  structural identities stay six.
- No stored value verdicts. Preference is derived from observations at query time.
- Every assumption and every choice is marked with what licensed it.
- The Ears stays faithful. Implication is realization's job.
- Learned abstractions live on parents, so specificity keeps them from overriding what a
  Concept knows about itself.
- Grounded signals outrank self-reported ones.
- Everything is budgeted.

---

## 6. Risks and open questions

- **Sparse evidence early.** Teacher distillation (3.2, point 3) is the bootstrap. The
  risk is that Teacher-sourced expectations harden before evidence can correct them;
  provenance plus back-off thresholds should prevent that, but it needs watching.
- **Rich-get-richer.** Whatever wins early collects evidence and keeps winning.
  Exploration exists for this; the right rate is unmeasured.
- **Blame assignment.** Narrow blame (tie-broken selections only) is sound but may learn
  slowly. Downstream-use signals help.
- **Over-generalisation.** Anti-unification can produce a pattern that is technically
  consistent and practically wrong. Coverage *k* and the counterexample block are
  starting points, not answers.
- **Activation noise at scale.** Fan-out normalisation is the main defence. Whether it is
  enough at ten thousand Concepts is unknown until there are ten thousand Concepts.
- **Taste.** "Cool" and "modern" ground only in user choices and distilled norms. That is
  the same place an LLM's taste comes from, but it arrives much slower here, and the plan
  does not pretend otherwise.

---

## 7. Shared with memory-spec.md

Several mechanisms above are one piece of design covered from two angles. This table says
which document owns the decision and what the other one contributes.

| Concern | Owner | Other doc's role |
|---|---|---|
| Stamps and durable evidence | shared | `memory-spec.md` build step 1 and this plan's Phase 0 are the same step |
| Activation | shared | `memory-spec.md` Part 10.1 supplies the base-level term, this plan's 3.3 the spreading term; one `Activation` Concept |
| `Ref` and focus resolution | `memory-spec.md` Part 8.2 | owns the resolution order; activation (3.3) only ranks candidates inside step 3 |
| Consolidation and generalisation | shared shape | same provenance form: a stamp carrying evidence count and span, per `memory-spec.md` Part 11 |
| `Hypothetical()` | this plan, 3.5 | the facet itself; `memory-spec.md` Part 5.4 declares `Believe` `Effectful()`, so it is suppressed under the facet with no special case |
| Materialisation rule | this plan, 3.5 | stated there; `memory-spec.md` Part 11 consolidation is the one sanctioned case |

Merged build order, folding this plan into `memory-spec.md`'s build order (its Part 18):

1. Ears eval harness.
2. Stamps, durable trace, `Said` (`memory-spec.md` build step 1 = this plan's Phase 0).
3. Indexes (`memory-spec.md` build step 2).
4. Individuals and `Believe` (`memory-spec.md` build steps 3-4).
5. First grounding import slice (`../research/seed-dataset-sources.md`, reframed).
6. Unified `Activation` (`memory-spec.md` build step 7 + this plan's Phase 3).
7. Evidence tie-break with back-off (this plan's Phase 1).
8. Expectations (this plan's Phase 2) and focus/processes (`memory-spec.md` build steps
   5-6).
9. Consolidation and generalisation (`memory-spec.md` build step 8 + this plan's Phase 4).
10. Deliberation (this plan's Phase 5) and prediction (this plan's Phase 6).
