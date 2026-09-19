# Qualitative Reasoning About Quantity, Change, and Direction — Research Notes

Scope: formal content of six bodies of QR work relevant to reference-point + direction-of-change
reasoning, their concluding power, their documented failure modes, and required inputs. Research
only — no notes on target-system implementation.

## 1. Qualitative Process Theory (Forbus) and QSIM (Kuipers)

**Quantity space.** Both formalisms replace real numbers with a **totally (Kuipers) or partially
(Forbus) ordered set of symbolic landmark values**. In QSIM every quantity space contains at
minimum `{-inf, 0, +inf}`; new landmarks (e.g. a boiling point, a container's "full" level) can be
introduced *during* simulation when the system detects a qualitatively significant event, which
Kuipers treats as a distinguishing strength over static quantity spaces. A quantity's value at any
instant is described purely by its **ordinal relation** to the landmarks (equal-to, between-two)
— never a number. In Forbus's QP theory the quantity space is a **partial order of inequalities**
built from whatever conditional relations a process's preconditions assert, so it need not be
total until evidence forces it.

**Direction of change.** QSIM's core primitive is `qdir(x) ∈ {inc, std, dec}` — the sign of the
first derivative (+, 0, -). A qualitative state is a pair (qualitative value, qualitative
direction) per variable. Simulation advances by enumerating the **qualitatively distinct
successor states** consistent with the constraints (adds, mults, M+/M- monotonic-function
constraints, sums), producing a **behavior graph/tree** of possible trajectories rather than a
single trace, because at branch points multiple successor states are equally consistent.

**Qualitative proportionality (Forbus).** `Q1 Q∝+ Q2` (or `Q∝-`) asserts only that some monotonic
increasing (or decreasing) functional dependence holds between Q1 and Q2, all else equal — no
functional form, no magnitude. This is exactly a "direction of influence between two quantities"
primitive with no numeric content, and composes: multiple qualitative proportionalities on the
same quantity combine like signed contributions (see §3 for what breaks when they conflict).

**M+/M- (Kuipers).** `M+(x,y)` / `M-(x,y)` assert x is a monotonic increasing/decreasing function
of y — used to propagate direction-of-change constraints between coupled variables without
knowing the function.

**What it can conclude:** given a quantity space + a set of qualitative constraints + an initial
qualitative state, QSIM/QPT can enumerate *all* qualitatively possible successor states/behaviors,
generate a landmark ordering, and answer "can x reach landmark L while increasing" type questions.

**Known failure mode — spurious behaviors.** QSIM is *sound* (every real solution appears in the
qualitative behavior tree) but not complete in the useful sense: it also generates **spurious
qualitative behaviors that correspond to no real system**, because ordinal/directional information
under-determines curvature and simultaneity (e.g. it cannot tell whether two variables reach a
landmark at exactly the same instant or in some order, so it must branch on both). Kuipers and
collaborators call some of these predictions **"ineradicable"** — provably not removable by adding
more purely qualitative distinctions — and characterize this in "Causes of Ineradicable Spurious
Predictions in Qualitative Simulation" (Kuipers, JAIR vol. 27, arXiv:1110.0020). The practical
response (Kuipers & Berleant's **Q2/Q3, semi-quantitative simulation**) is to inject partial
numeric information (interval bounds, envelopes) specifically to prune spurious branches — i.e.
pure qualitative reasoning was judged insufficient on its own for real predictive use.

**Required input:** a structural/causal model (processes with preconditions and influences, or
constraint equations) already translated into qualitative primitives; landmark values must either
be given or be inferable from stated distinctions (zero, an equilibrium, a stated boundary).

**Fit note:** the `qdir ∈ {inc,std,dec}` + landmark-relative value is close to a ready-made pair of
primitives ("direction of change" and "position relative to reference points") for the target
system's comparison problem — but QSIM's branching-behavior-graph machinery (needed to keep
soundness under a total ordering of coupled variables over time) is far more apparatus than a
"which of two options is preferred from here" query needs. The transferable piece is the
**vocabulary**, not the simulation algorithm.

Sources: Kuipers, "Qualitative Simulation," Artificial Intelligence 29 (1986),
https://www.cs.utexas.edu/ftp/qsim/papers/Kuipers-aij-86.pdf ;
Kuipers, "Qualitative Simulation: Then and Now,"
https://www.cs.utexas.edu/ftp/qsim/papers/Kuipers-aij-93b.pdf ;
"Causes of Ineradicable Spurious Predictions in Qualitative Simulation," JAIR 27,
https://arxiv.org/abs/1110.0020 ; Forbus, "Qualitative Process Theory," MIT AI Memo,
https://dspace.mit.edu/handle/1721.1/6874 and Semantic Scholar record
https://www.semanticscholar.org/paper/Qualitative-Process-Theory-Forbus/9b1a687d836ffc318ff1e125acd5a0dd7a21f3b5 .

## 2. Order of Magnitude Reasoning: O(M), FOG, and successors

**Formalism.** Raiman's **FOG** ("Formalisation du raisonnement sur l'Ordre de Grandeur," AAAI-86)
introduces three primitive relations over quantities, given a formal semantics in **non-standard
analysis** (infinitesimals):
- **Negligibility** `A << B` — A is infinitesimal relative to B (can be dropped from a sum with B).
- **Closeness** `A ≈ B` — A and B differ by a negligible amount.
- **Comparability / same order** `A ~ B` — A and B are within a bounded ratio of one another
  (same order of magnitude), formalized as neither `A<<B` nor `B<<A`.

These three relations have inference rules (e.g. transitivity of `~`, absorption: if `A<<B` then
`A+B ≈ B`) that let a system simplify expressions — drop dominated terms, merge close quantities —
without ever assigning numbers. Mavrovouniotis & Stephanopoulos's independently-developed **O[M]**
formalism covers the same ground with **seven primitive order-of-magnitude relations** chosen so
that the standard problems (adding/multiplying quantities of different orders) can be solved
**without introducing disjunction or negation** — a deliberate design response to the ambiguity
blowup that plain sign algebra produces (§3).

**What it can conclude:** which terms in a sum dominate (hence can be dropped), whether two
quantities are "the same size" without knowing either value, and propagates comparisons through
arithmetic — genuinely useful for approximation and for deciding when a "small" effect can be
ignored relative to a "big" one.

**Failure modes:** FOG's negligibility relation is **not transitive-closed the way one might hope
across additions** — chains of "small compared to" judgments can silently accumulate into a
comparison that's wrong by orders of magnitude (this is the classic critique also raised against
loose real-world "order of magnitude" chains). Successor work ("Order of Magnitude Qualitative
Reasoning with Bidirectional Negligibility," "A Multimodal Logic Approach to O(M) QR") exists
specifically because the base FOG axioms produced **inconsistent or overly weak conclusions** in
some multi-term expressions, requiring additional machinery (belief revision frameworks, modal
logics) layered on top just to keep O(M) systems sound.

**Required input:** the algebraic/arithmetic expression relating quantities must already be known;
O(M) reasoning simplifies a known expression, it does not derive relationships from scratch.

**Fit note:** relevant mainly as a precedent that "size relative to a reference, without numbers"
is formalizable and useful, but the mechanism (non-standard analysis, arithmetic simplification)
answers a different question (magnitude comparison of known quantities) than "which direction of
movement from where I am is preferred," so it transfers as motivation, not machinery.

Sources: Raiman, "Order of Magnitude Reasoning," AAAI-86,
https://aaai.org/papers/00i00-aaai86-016-order-of-magnitude-reasoning/ ;
Semantic Scholar entry https://www.semanticscholar.org/paper/Order-of-Magnitude-Reasoning-Raiman/a15403373ac2bb2eeb0d99423772a0603b131638 ;
"A Framework for Semiqualitative Reasoning" (Mavrovouniotis/O[M] context),
https://www.tandfonline.com/doi/pdf/10.1080/088395102753559262 ;
"Order of Magnitude Qualitative Reasoning with Bidirectional Negligibility,"
https://link.springer.com/chapter/10.1007/11881216_39 .

## 3. Qualitative/Sign Algebra: What Signs Alone Can and Cannot Tell You

**The algebra.** de Kleer & Brown's confluence-based envisioning (and QSIM's constraint
propagation) both reduce a variable's state to a value in `{+, 0, -}` (sign of the quantity or of
its derivative) and combine these values via a **sign-algebra addition/multiplication table**.
Multiplication is fully determined: `(+)·(+)=+`, `(+)·(-)=-`, etc. **Addition is where it breaks**:
`(+)+(+)=+`, `(-)+(-)=-`, but `(+)+(-) = ?` (undetermined — could be +, -, or 0 depending on
unknown magnitudes). This single underdetermined case is the seed of the entire ambiguity problem
in qualitative physics, sometimes called the **"sign wall"**: whenever two opposing qualitative
influences combine (a tank being filled and drained at once, two forces in opposite directions),
the qualitative algebra alone cannot resolve the outcome, and the system must branch into all
consistent possibilities.

**How bad it gets — quantified.** The `?` value doesn't stay local: because system variables are
coupled through further equations, a single unresolved `+/-` combination propagates into multiple
live hypotheses, each of which independently hits further `?` combinations downstream. This
produces a **branching, combinatorial explosion of "envisionments"/behavior-graph nodes**, many of
which are *spurious* — consistent with the qualitative constraints but not realizable by any real
system (see §1). The field's own framing: qualitative reasoning "can generate ambiguous behaviors
due to the lack of quantitative information, and it is fundamentally impossible to totally remove
ambiguities with only qualitative methods" — and QSIM's own developers built **Q2/Q3
semi-quantitative extensions** and Kuipers/Berleant explicitly to re-inject numeric bounds because
pure sign/qualitative propagation could not be trusted to converge to a tractable, non-spurious
behavior set on realistic models. This is widely cited as the central reason qualitative physics
did not scale to practical diagnosis/design systems despite two decades of active research
(1984-2000s) — it produces technically-sound but practically-useless "behavioral sprawl."

**What sign algebra CAN conclude reliably:** direction of a product/quotient (multiplication and
division never introduce `?`), and any addition/subtraction where both terms share known matching
sign or one is known to dominate (which is exactly what O(M)/FOG's negligibility relation is
introduced to establish, see §2 — i.e. sign algebra and order-of-magnitude reasoning are
complementary: one is powerless exactly where the other is designed to help).

**Fit note:** this is the sharpest, most transferable *warning*: any design that combines two
independent "direction of change" facts by addition-like composition (e.g. two options each
pushing a value in some direction, or multiple relations feeding one verdict) will hit the same
`+/-` wall the moment two opposing directions must be combined into one verdict, unless the design
either (a) avoids combining directions arithmetically and instead keeps a single dominant relation
per decision, or (b) accepts `unknown` as a first-class, non-explosive output value instead of
branching into all possibilities (which is exactly the three-valued open-world stance already
described in the target system — a plausible way to sidestep the historical explosion rather than
solve it).

Sources: de Kleer & Brown, "Foundations of Envisioning," https://mlanthology.org/aaai/1982/dekleer1982aaai-foundations/
and https://dekleer.org/Publications/Scanned%20AIJ.pdf ; overview of the sign-algebra
"ambiguity/state-space explosion" and "sign wall" framing via search synthesis of Kuipers-lineage
literature and Cambridge AI EDAM discussion "A method to reduce ambiguities of qualitative
reasoning for conceptual design applications," https://www.cambridge.org/core/journals/ai-edam/article/abs/method-to-reduce-ambiguities-of-qualitative-reasoning-for-conceptual-design-applications/8E30ABE10F0AE4F70683F333F58171E6 ;
Kuipers, "Causes of Ineradicable Spurious Predictions," https://arxiv.org/abs/1110.0020 (title and
abstract verified directly; full-text extraction failed in this session — treat detailed
mechanism claims here as recalled/synthesized from secondary discussion, not directly quoted from
the PDF, which could not be parsed as text in this session).

## 4. Allen's Interval Algebra and RCC-8: Qualitative Reasoning That Worked

**The algebras.** Allen's interval algebra defines **13 mutually exclusive, jointly exhaustive**
relations between two time intervals (before, meets, overlaps, starts, during, finishes, equals,
and their inverses). RCC-8 (Region Connection Calculus) defines **8 mutually exclusive, jointly
exhaustive** topological relations between two regions (disconnected, externally connected,
partially overlapping, equal, tangential/non-tangential proper part and inverses). Both are
**relation algebras with a composition table**: given R1(A,B) and R2(B,C), the table gives the
(possibly disjunctive) set of relations consistent for (A,C), and constraint propagation
(path-consistency) over a network of such relations is the core reasoning service.

**Why these succeeded where general qualitative physics did not:**
1. **Fixed, small, jointly-exhaustive-and-pairwise-disjoint (JEPD) relation sets.** There is no
   open-ended landmark discovery, no numeric magnitude hiding underneath — the ontology of
   possible relations is closed and complete by construction, so there is no analog of the `?`
   sign-algebra gap: every pair of intervals/regions has *exactly one* base relation.
2. **Reasoning reduces to constraint satisfaction over a known, tabulated composition table**,
   which is standard CSP machinery with well-understood (if sometimes NP-hard) complexity, rather
   than open-ended simulation with dynamically appearing landmarks.
3. **The domains (time ordering, topological containment) are inherently ordinal/topological, not
   quantities-in-disguise** — there is no numeric derivative or magnitude the calculus is
   approximating, so there's no information loss versus a "real" quantitative model the way there
   is when qsim approximates real-valued physics.
4. **Directly useful, bounded application niches** (temporal databases, GIS, natural-language
   temporal parsing, robot topology) where full numeric coordinates are unavailable or unnecessary
   — the qualitative answer *is* the desired answer, not a lossy stand-in for a numeric one.

**Complexity caveat (limits even here):** consistency-checking for full Allen algebra and RCC-8 is
NP-complete in general (tractable subclasses exist, e.g. the "pointizable"/ORD-Horn fragments);
combining the two calculi (spatio-temporal) can push complexity up to PSPACE- or EXPSPACE-complete
or even undecidable depending on the interaction primitives chosen — i.e. even the "success story"
calculi degrade when composed or extended carelessly.

**Fit note:** the transferable lesson is architectural, not formal: qualitative calculi work well
when the relation vocabulary is **closed, small, and JEPD**, and reasoning is **table-lookup
composition**, not simulation. A "reference point + direction" scheme for comparisons should aim
for the same shape — a small closed set of relations (e.g. above/at/below a reference; moving
toward/away/along) with a composition table, rather than open-ended magnitude arithmetic that
reintroduces the sign-algebra `?` problem.

Sources: Gerevini & Nebel, "Qualitative Spatio-Temporal Reasoning with RCC-8 and Allen's Interval
Calculus: Computational Complexity," ECAI 2002, https://gki.informatik.uni-freiburg.de/papers/gerevini-nebel-ecai02.pdf ;
"A Survey of Qualitative Spatial and Temporal Calculi," https://arxiv.org/pdf/1606.00133 ;
Wikipedia, "Spatial-temporal reasoning," https://en.wikipedia.org/wiki/Spatial_reasoning .

## 5. Homeostasis / Set-Point Framings in KR

**Control-theoretic formalism.** The standard homeostasis model (physiology, adopted informally in
some KR/agent work) is a **closed control loop**: a set point (target value), a sensor (current
value), a comparator computing an **error = current - target**, and an effector whose output is a
function of error sign and magnitude. A 2020 npj Digital Medicine paper formalizes this precisely
as a **proportional-integral (PI) controller** fit to real glucose-monitor data, i.e. showing
homeostasis is literally modeled as classical control theory, not qualitative symbolic reasoning —
"good" is deviation-from-set-point in either direction, and the loop's job is to drive error to
zero regardless of which direction it currently points.

**Relevance to KR of "healthy ranges."** The recurring idea across this literature is: health/
good-state is not "high" or "low" on some scale, it's **proximity to a target band**, and a
deviation is bad **symmetrically** — both too much and too little are failures relative to the
same reference. Some more recent physiological work (Homeostasis Threshold Deviation theory) even
allows the set point itself to be non-fixed/adaptive rather than a hard constant, i.e. the
"reference" can itself shift with context — directly analogous to the target system's own
observation that a verdict depends on *where the reference point is*, not just on distance from a
fixed universal target.

**What's notably thin:** despite homeostasis being an old and central biological concept, there is
comparatively little **symbolic/qualitative KR work** that treats "distance from a set point, with
either-direction badness" as a reusable *representational primitive* independent of control theory
— most treatments are either purely numeric (control theory, as above) or purely narrative
(physiology textbooks). This is a gap: the "V-shaped" or "single-peaked" value-over-a-range idea is
well-known in economics (see §6) but not heavily formalized as a qualitative KR construct on its
own terms.

**Fit note:** the set-point/error framing is a clean formal precedent for "goodness is symmetric
deviation from a reference, not monotonic in a raw quantity" — exactly the shape of the bodyweight
example in the prompt. Its formal apparatus (numeric PI control) is overkill, but the **shape** of
the primitive (reference + signed deviation + direction-dependent verdict near the reference) is
worth taking as a template.

Sources: "Homeostasis as a proportional-integral control system," npj Digital Medicine,
https://www.nature.com/articles/s41746-020-0283-x (also PMC7244502) ; "The pathogenic theory of
homeostasis threshold deviation (HTD)...," https://academic.oup.com/lifemeta/article/4/6/loaf029/8209604 ;
"Population correlations do not support the existence of set points for blood levels of calcium or
glucose," https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5789653/ (a useful skeptical counterpoint —
even the biological "set point" model is empirically contested).

## 6. Ideal Points, Aspiration Levels, and Satisficing

**Coombs' ideal-point model (1950).** In preference theory, an alternative's value to a person is
**not monotonic in an attribute** but is a decreasing function of the **distance between the
attribute's value and the person's ideal point** on that dimension — i.e. exactly a single-peaked,
symmetric-around-a-target value function, formalized decades before "optimal range" language
became common in KR. Later work (multi-attribute ideal-point models, "multiple ideal point"
models) generalizes to several ideal points per person/context, and connects this to Euclidean/
spatial voting models where a voter prefers the candidate closest to their ideal position, not the
most extreme one.

**Non-monotonic ("bliss point") utility in economics.** Standard consumer theory assumes
monotonicity (local non-satiation) but explicitly documents an exception: past a **satiation
point**, further quantity reduces utility, producing a genuinely single-peaked utility function
over an "economic region" (below satiation) and a "wasteful region" (beyond it). This is the
formal ancestor of "more is better up to a point, then worse."

**Simon's satisficing and aspiration levels.** Simon's bounded-rationality model replaces
utility-maximization with **threshold-checking against an aspiration level**: a decision-maker
evaluates options sequentially and **stops at the first option meeting or exceeding the
threshold**, rather than computing a value for every option and picking the max. The aspiration
level itself is **dynamic**: it rises when good options are found easily, falls when the search is
failing — i.e. the reference point (aspiration level) is itself state-dependent, updated by
experience, not fixed. This is formally distinct from the ideal-point model (which asks "how close
to the target" for a graded verdict) — satisficing asks a **binary** "does this clear the bar,"
where the bar itself moves. Recent work (arXiv:2507.07052, "Quantifying Bounded Rationality:
Formal Verification of Simon's Satisficing Through Flexible Stochastic Dominance") formalizes
satisficing rigorously in decision-theoretic terms, confirming it remains an active, still-being-
formalized topic rather than settled machinery.

**Fit note:** these three (ideal point, satiation/bliss point, aspiration level) are the clearest
precedent for the exact shape of the target problem: a **verdict-relevant reference** (ideal
point/aspiration level/satiation point) that is not a fixed universal constant, combined with a
**value function that is not monotonic in the raw quantity** but depends on position/direction
relative to that reference. The aspiration-level version additionally supplies a precedent for the
reference point being **adaptive/context-set rather than hardcoded**, which maps onto the "even for
money the verdict flips if you're already in debt" observation in the prompt.

Sources: Coombs ideal-point discussion via "A Multiple Ideal Point Model," https://journals.sagepub.com/doi/10.1509/jmkr.39.1.73.18931
and https://spinup-000d1a-wp-offload-media.s3.amazonaws.com/faculty/wp-content/uploads/sites/38/2019/12/A-Multiple-Ideal-Point-Model_Capturing-Multiple-Preference-Effects-from-within-an-Ideal-Point-Framework.pdf ;
"Local nonsatiation" and satiation/bliss-point discussion, https://en.wikipedia.org/wiki/Local_nonsatiation ,
EconGraphs "Monotonicity," https://www.econgraphs.org/textbooks/intermediate_micro/scarcity_and_choice/preferences_and_utility/monotonicity ;
Stanford Encyclopedia of Philosophy, "Bounded Rationality," https://plato.stanford.edu/entries/bounded-rationality/ ;
Wikipedia, "Satisficing," https://en.wikipedia.org/wiki/Satisficing ;
"Quantifying Bounded Rationality: Formal Verification of Simon's Satisficing Through Flexible
Stochastic Dominance," https://arxiv.org/pdf/2507.07052 .

## Cross-Cutting Honest Assessment

Qualitative reasoning as a subfield (QPT, QSIM, envisioning, O(M)) had a concentrated burst of
activity from the early 1980s through the 1990s and did **not** graduate into widespread practical
deployment for the reason repeated across nearly every source above: **sign/interval-based
propagation is locally sound but globally under-determined**, and the underdetermination compounds
combinatorially rather than staying bounded. The field's own remedies (Q2/Q3 semi-quantitative
simulation, O(M)'s non-standard-analysis grounding, belief-revision layers on FOG) are all attempts
to buy back the numeric information the qualitative abstraction had thrown away — which is a strong
signal that "purely qualitative, purely symbolic" is not, on its own, sufficient for reliable
multi-step inference about quantity. The two areas that avoided this fate (Allen's algebra, RCC-8)
did so by keeping the relation vocabulary **closed, small, and disjoint**, and by reasoning through
**table lookup/constraint propagation** rather than open-ended derivative/magnitude arithmetic.
Preference-side work (ideal points, satiation, aspiration levels) never tried to be a general
qualitative-physics-style calculus at all — it stayed narrowly scoped to "distance/threshold
relative to one reference point," which is very likely why it never hit the ambiguity-explosion
wall the physics-oriented QR tradition did.
