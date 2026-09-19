# Multi-criteria decision theory: research notes

Scope: formal content of six bodies of work on how to compare options across multiple
criteria, what each requires as input, and an honest read on which are respected vs.
weak. No commentary on any target system's implementation — that's for the design doc
to do separately.

## 1. Pareto dominance / Pareto optimality

**Definition.** A dominates B iff A is at least as good as B on every criterion in play
and strictly better on at least one. A is Pareto-optimal (non-dominated) if no other
option dominates it. This is a *partial* order, not a total one — dominance is silent
whenever two options trade off (one better here, the other better there).

**What it gives you.** A safe, weighting-free way to shrink a choice set: throw away
everything dominated, since no rational agent (whatever their weights) should choose a
dominated option. It requires no numeric weights and no aggregation — this is exactly
why it matters for a system with no numbers.

**What it does not give you.** A verdict. Once dominated options are removed, everything
left on the "Pareto front" is mutually *incomparable* by definition — dominance cannot
rank them, full stop. Picking among the front requires an extra ingredient (weights,
priorities, or a computed tiebreak) that Pareto dominance itself does not supply.

**How big is the non-dominated set in practice?** It is usually a small fraction of the
full alternative space, but that "small fraction" is still typically *many mutually
incomparable options*, not one. Examples found: an evolutionary classifier study reduced
~250 million candidate solutions to 171 non-dominated ones; a medical dataset with ~15M
candidates had a front of 33; Monte-Carlo studies of large random multi-objective systems
found front sizes that grow only like (log N)², e.g. ~9-20 non-dominated points among
20,000-200,000 candidates. So dominance is a strong filter (it dominates over 99% of a
huge space) but a weak decider (it still commonly leaves single digits to low hundreds of
truly incomparable finalists — and a two-option question like "cash gain vs. cash loss"
sits in exactly that leftover space when the two options really do trade off).

**Known failure mode.** Most real, contested choices are precisely the two-or-more-option
comparisons where each side dominates on some dimension: the whole reason a choice
*feels hard* is that it survived the dominance filter. Pareto dominance therefore
correctly explains why some questions ("do you want more money for free, no cost") are
trivial (one option dominates) and is silent on the ones that aren't.

**Fit note.** This maps directly onto the observed asymmetry: the million-dollar gain vs.
million-dollar debt question is answerable *because* one option dominates on every
dimension in play (net worth, without countervailing costs) — no weighting needed. The
bodyweight question is not dominance-answerable because loss/gain each carries costs and
benefits that cut in different directions depending on the reference point (see §5).

Sources: [Pareto Optimality — ScienceDirect Topics](https://www.sciencedirect.com/topics/engineering/pareto-optimality); [Multicriteria Optimization and Decision Making (arXiv survey)](https://arxiv.org/pdf/2407.00359); [Multi-objective optimization pt.1: Pareto dominance](https://medium.com/@deneb.acyg/multi-objective-optimization-part-1-pareto-dominance-64bb140d162a); [Methodology to Select Solutions from the Pareto-Optimal Set (GECCO)](https://www.cs.york.ac.uk/rts/docs/GECCO_2007/docs/p789.pdf); frontier-size figures via [ResearchGate figure](https://www.researchgate.net/figure/Number-of-Pareto-dominated-and-Pareto-optimal-alternatives-top-chart-number-of_fig4_337137282) and general MCDA survey sources above.

## 2. Multi-Attribute Utility Theory (MAUT) and the weighting problem

**Formal content.** MAUT (Keeney & Raiffa) assumes each criterion has a single-attribute
utility function u_i(x), and under conditions like mutual preferential/utility
independence, the overall utility is a weighted additive (or multiplicative) form:
U(x) = Σ w_i · u_i(x_i). Ranking then reduces to computing U for each option and sorting
— a total order, unlike Pareto dominance.

**Why weight elicitation is the weak point.**
- Eliciting a *complete* multi-attribute utility function is exponential in the number of
  attributes, so real applications lean on simplifying independence assumptions that may
  not hold.
- Weight elicitation is commonly done by asking people to rate importance, but "true MAUT
  weights reflect trade-offs, not how strongly people feel about a topic" — treating
  weights as popularity/importance scores (a very common practitioner mistake) silently
  changes what's being measured.
- Elicited weights are sensitive to the elicitation method itself (swing weighting,
  pairwise comparison, direct rating, etc. give different numbers for the same person),
  which is a reliability problem, not just an accuracy one.
- Results inherit whatever imprecision existed in the input judgments, producing "utility
  intervals" rather than clean rankings once you're honest about elicitation noise.

**What it requires as input that a fact-graph wouldn't have.** Numeric weights per
criterion (a global scalar per goal/context) and numeric per-attribute utility curves —
both invented by a person for the purpose of the calculation, not facts that exist prior
to being asked. This is exactly the failure mode already identified: `Better(Gain, Loss)`
attempted to store a *conclusion* of an implicit MAUT calculation as if it were a fact,
and it broke because the weights that produced that conclusion are goal- and
context-relative, not fixed.

**Fit note.** MAUT is the formalization of "just add up how much you care about each
thing," and it names precisely why that fails here: the weights are exactly the unknown,
context-dependent thing the system has no mechanism for representing, let alone storing
as a stable fact.

Sources: [Multi-Attribute Utility Theory — Umbrex](https://umbrex.com/resources/frameworks/decision-making-frameworks/multi-attribute-utility-theory/); [Missing consequences in multiattribute utility theory](https://www.sciencedirect.com/science/article/abs/pii/S0305048307000758); [Generalized Ordinal Priority Approach... (arXiv)](https://arxiv.org/pdf/2407.17099); [Best-Worst Disaggregation (arXiv)](https://arxiv.org/pdf/2410.12678).

## 3. Lexicographic and semi-lexicographic orderings

**Formal content.** Rank criteria in a strict priority order c1 > c2 > c3 .... Compare
two options on c1 alone; if tied, move to c2; and so on. No numbers, no aggregation, no
trade-offs — a criterion lower in priority can *never* outweigh one higher, regardless of
magnitude. This is the "dictionary order" generalization, and it composes cleanly with
partial information (you only need enough of the ranking to break the tie you're facing).

**Semi-lexicographic (threshold) variant.** Real comparisons are rarely knife-edge equal,
so the semi-lexicographic (L*) form adds a just-noticeable-difference / discrimination
threshold: two options are treated as "tied" on a criterion if they differ by less than a
threshold, and only a difference exceeding the threshold breaks the tie at that level.
This trades a clean formal property (transitivity can fail with thresholds — near-ties
can chain into a contradiction) for realism.

**Where it fits and where it breaks.** It is a good match for domains with a genuine,
stable priority order the decision-maker would defend even in extreme cases (e.g.,
safety > cost > convenience, where no amount of cost savings justifies a safety
regression). It breaks down exactly where the priority order is *itself*
context-dependent — which is the same problem MAUT weights have, just pushed into an
ordering instead of a weight vector. It also breaks when a criterion low in priority
should be allowed to compensate for a *tiny* deficit high in priority (an all-or-nothing
top criterion can produce brittle, unintuitive verdicts on marginal cases) — that's what
the semi-lexicographic threshold is patching.

**What it requires as input.** A total, context-fixed priority ordering over criteria.
Nothing numeric is needed, which is attractive for a numberless system, but the ordering
itself must be supplied and must not silently vary by context, or you're back to the
original problem (which ordering applies now?).

**Fit note.** This is the closest of the classical MCDA tools to "qualitative" — it needs
an order, not numbers — but the open problem is precisely that a fixed order over
{accumulation, generosity, enjoyment} for money, or over whatever governs bodyweight
preference, doesn't exist independent of the current goal.

Sources: [The lexicographic method in preference theory (Mandler, Economic Theory)](https://link.springer.com/article/10.1007/s00199-020-01256-2); [Lexicographic orders and preference representation](https://www.sciencedirect.com/science/article/abs/pii/S0304406899000403); [A modified lexicographic semi-order model using the best-worst method](https://www.researchgate.net/publication/326590214_A_modified_lexicographic_semi-order_model_using_the_best-worst_method); [Expanding and confusing space of alternatives: a case for lexicographic preferences](https://www.sciencedirect.com/science/article/abs/pii/S0022249622000104).

## 4. Outranking methods (ELECTRE, PROMETHEE) and TOPSIS, AHP

**ELECTRE / PROMETHEE (outranking).** Instead of collapsing criteria into one utility
number, these build a "concordance/discordance" or preference-flow relation: A outranks B
if enough weighted criteria favor A (concordance) and no criterion opposes it too
strongly (discordance/veto). This deliberately allows *incomparability* to survive in the
output — closer in spirit to Pareto dominance than to MAUT. Known problems: outranking
relations can be intransitive (A outranks B, B outranks C, but C outranks A), can be
sensitive to irrelevant alternatives, don't scale past roughly a hundred alternatives, and
don't produce a clean score per option (only pairwise relations), which limits their use
as a "compute the answer" black box. PROMETHEE has more recent uptake than ELECTRE.

**TOPSIS.** Score each option by (normalized, weighted) distance from a hypothetical
"ideal" point and a hypothetical "worst" point; rank by closeness to ideal relative to
worst. Simple and popular, but it still needs the same numeric weights as MAUT, and
critically it has no principled way to weigh the two distances against each other — a
structural, not just parametric, weakness that's been flagged directly in the
literature. Different MCDA methods (TOPSIS, VIKOR, PROMETHEE) frequently produce
*different rankings for the same data*, which is itself evidence the "right" ranking is
sensitive to arbitrary methodological choices, not just to the facts.

**AHP (Analytic Hierarchy Process).** Pairwise-compare criteria and options on a 1-9
verbal/numeric scale, derive weights from the dominant eigenvector of the comparison
matrix, and aggregate hierarchically. AHP is the most-used MCDA method in the literature
by volume, but it carries the most substantive published criticism of any method here:
- **Rank reversal**: adding a new, non-dominating alternative to the choice set can flip
  the ranking of the *original* alternatives — a violation of a property (independence of
  irrelevant alternatives) that most people would consider a precondition for calling
  something a rational ranking procedure. First raised by Watson & Freeling (1982), later
  formalized by Belton & Gear and traced to AHP's hierarchic-composition assumption; no
  fix is broadly accepted decades later.
- **Dyer (1990, Management Science), "Remarks on the Analytic Hierarchy Process"**:
  argued the rankings AHP produces are arbitrary artifacts of the hierarchic-composition
  procedure itself, not of the underlying preferences — a direct attack on AHP's validity
  as a preference-measurement instrument, not just an implementation quibble. This drew
  published rebuttals from Saaty and from Harker & Vargas in the same journal, and the
  exchange (Dyer vs. Saaty/Harker/Vargas) is the canonical "is AHP legitimate" fight in
  the field — it was never resolved to consensus.
- Elicitation itself (the pairwise 1-9 scale) has also been separately questioned as
  producing inconsistent judgment matrices in practice, requiring post-hoc "consistency
  ratio" checroundtable and, then, redoing the elicitation.

**Honest read.** AHP is the most cited/used but also the most contested; treat its
popularity as adoption momentum, not as an endorsement of its formal soundness — the
rank-reversal and Dyer critiques are substantive and unresolved, not fringe objections.
ELECTRE/PROMETHEE are more defensible for genuinely preserving incomparability rather
than forcing a total order, but pay for that with intransitivity risk and no score
output. TOPSIS is simple to compute but has no real defenders on the "why this distance
metric, why these two reference points" question — it's popular because it's easy to
implement, not because it's theoretically distinguished.

**What all four require as input that a fact graph doesn't have.** Either (a) numeric
weights per criterion (ELECTRE, PROMETHEE, TOPSIS, AHP all need this, even though AHP
derives them "consistently" from pairwise judgments rather than asking directly), or (b)
pairwise judgment matrices (AHP) which are themselves just weights in a more elaborate
costume, or (c) concordance/veto thresholds (ELECTRE) which are extra tunable parameters
with no natural source in a fact base.

Sources: [Widely Used MCDA Methods (Danielson)](https://people.dsv.su.se/~mad/Popular_MCDA_Methods.pdf); [Are MCDA Methods Benchmarkable? (MDPI)](https://www.mdpi.com/2073-8994/12/9/1549); [A Comprehensive Literature Review of the Rank Reversal Phenomenon in AHP (Maleki, J. Multi-Crit. Decis. Anal.)](https://onlinelibrary.wiley.com/doi/10.1002/mcda.1479); [On rank reversal in decision analysis](https://www.sciencedirect.com/science/article/pii/S0895717708002860); [A critical analysis of the eigenvalue method used in AHP](https://www2.math.upenn.edu/~kazdan/210/LectureNotes/Saaty/Saaty-Bana..pdf); [Remarks on the Analytic Hierarchy Process (Dyer, Management Science, INFORMS)](http://pubsonline.informs.org/doi/pdf/10.1287/mnsc.36.3.249); [Reply to "Remarks on the AHP" — Harker & Vargas](https://www.researchgate.net/publication/227446173_Reply_to_Remarks_on_the_Analytic_Hierarchy_Pro-cess_by_J); [ELECTRE-Score (arXiv)](https://arxiv.org/pdf/1905.06089).

## 5. Reference-dependent preference: prospect theory and regret theory

**Prospect theory (Kahneman & Tversky, 1979).** People evaluate outcomes as *changes
from a reference point*, not as absolute end states. The value function v(x - r) (r =
reference point) is concave for gains (diminishing sensitivity, risk-averse), convex for
losses (risk-seeking to avoid a sure loss), and steeper on the loss side than the gain
side — loss aversion, roughly a 2:1 asymmetry in the original estimates. A probability
weighting function (overweighting small probabilities, underweighting large/moderate
ones) is layered on top for choice under risk. This is the single most-cited paper in
economics and underpins Kahneman's 2002 Nobel.

**The core formal point for this research question.** Whether a given delta counts as a
"gain" or a "loss" is *not a property of the outcome* — it is a property of the (outcome,
reference point) pair. The same objective end-state is a gain relative to one reference
and a loss relative to another, and the value function treats those two framings
asymmetrically (loss looms larger). This is precisely the mechanism that would explain
why "gain weight / lose weight" cannot have a fixed valence: the reference point (a
healthy baseline, or the person's current weight) determines which direction is which,
and the asymmetric shape of the value function means the "same" move can be preferred or
disprefered purely by virtue of which side of the reference point you start on.

**Regret theory (Loomes & Sugden 1982; independently Bell 1982, Fishburn 1982).**
Choice under uncertainty is modeled with a utility term that depends not just on the
realized outcome but on the *comparison* to the outcome the untaken alternative would
have produced: regret is a function of (realized outcome − foregone outcome), added
into or subtracting from the plain-outcome utility. The **minimax regret** decision rule
(Savage, 1951) picks the option minimizing the worst-case regret across states, and
notably requires no probabilities at all — only a way to compute, for each state, the gap
between what you got and what you could have gotten. Formally this is the same
family move as prospect theory: value is not intrinsic to an outcome, it is a function of
outcome *and* a comparison point (here, the foregone alternative rather than a fixed
reference level).

**What this requires as input.** A comparison/reference point that is external to the
option being evaluated (a baseline weight, a foregone alternative, a status quo) plus a
direction-sensitive (asymmetric) value function over displacement from that point. Note
this is *not* a weight and *not* a priority order — it's a structural fact about which
side of a reference point you're on, which is a very different, and much cheaper, kind of
input than a MAUT weight vector.

**Fit note.** This is likely the most load-bearing research item for the open problem:
it gives formal precedent for "the verdict depends on where you currently stand relative
to a reference, not on a stored preference fact," and explains why storing `Better(Gain,
Loss)` at any level of scoping was doomed — gain/loss isn't a category an option belongs
to, it's a relationship between the option and wherever the agent currently is.

Sources: [Prospect Theory (Kahneman & Tversky 1979, original PDF via MIT)](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Kahneman_Tversky_1979_Prospect_theory.pdf); [Prospect theory — Wikipedia](https://en.wikipedia.org/wiki/Prospect_theory); [Loss aversion — Wikipedia](https://en.wikipedia.org/wiki/Loss_aversion); [Regret (decision theory) — Wikipedia](https://en.wikipedia.org/wiki/Regret_(decision_theory)); [Regret Theory: An Alternative Theory of Rational Choice Under Uncertainty (Loomes & Sugden, Economic Journal 1982)](https://academic.oup.com/ej/article-abstract/92/368/805/5220411); [Regret Theory: A Bold Alternative to the Alternatives (Economic Journal)](https://academic.oup.com/ej/article/125/583/493/5076997).

## 6. Qualitative (non-numeric) decision procedures

**Qualitative decision theory (Dubois, Prade, et al.).** A research program explicitly
trying to rank actions "without resorting to any numerical representation of utility or
uncertainty, and without any scale on which both could be mapped" — i.e., without
assuming preference and belief are commensurable enough to multiply together the way
expected utility does. It replaces probability with a *comparative possibility* /
possibility-theory representation of uncertainty (an ordinal "more possible than"
relation rather than a numeric probability), and replaces expected utility with min-based
or max-based aggregation rules (borrowed from possibilistic logic) evaluated purely
by relative rank of outcomes, not by their cardinal value. The key axiom is **ordinal
invariance**: preference between two acts depends only on the relative *rank order* of
their consequences in each state, so any order-preserving relabeling of utility values
leaves the decision unchanged. This connects directly to nonmonotonic/preferential
inference (rational closure, System P) used in AI knowledge representation — the same
mathematics used for "normally, birds fly" reasoning gets reused for "normally, prefer
this."

**What it requires as input.** An ordinal ranking of outcomes per state (not numeric
utilities) and an ordinal/possibilistic ranking of state likelihoods (not probabilities).
This is a much better fit for a system with no numbers than MAUT/TOPSIS/AHP — but it
still needs *some* per-state ranking to exist; it doesn't manufacture a ranking where the
facts genuinely don't determine a total order (which is the crux of the open problem: the
system needs to represent "there is no fact settling this," and qualitative decision
theory's honest answer in that situation is to also produce ties/incomparability, same as
Pareto dominance).

**Ordinal-invariance limitation worth flagging.** Since only the ordering of outcomes
matters, these procedures are provably insensitive to *how much* better one outcome is
than another. In min/max aggregation this produces "drowning effects" — a single
worst-case outcome can dominate the verdict regardless of how many other outcomes favor
the alternative (a known weakness of min-based possibilistic aggregation, analogous to
maximin's insensitivity to how bad the worst case is elsewhere on the table).

**Fit note.** Of everything surveyed, this family is the most structurally compatible
with a factless, three-valued, open-world system: it operates on rank/order information
that could plausibly be derived from relations already in a knowledge graph, rather than
requiring invented numbers. It does not, on its own, solve the "where does the ranking
come from" problem — it only guarantees that *if* a ranking exists, the aggregation
doesn't need numbers to use it.

Sources: [Qualitative Decision Theory: from Savage's Axioms to Non-Monotonic Reasoning (Dubois, Fargier, Prade — J. ACM, PDF)](https://www.irit.fr/~Henri.Prade/Papers/JACM02.pdf); [Qualitative decision theory with preference relations and comparative uncertainty (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0004370203000377); [Decision-making Under Ordinal Preferences and Comparative Uncertainty (UAI)](https://dl.acm.org/doi/10.5555/2074226.2074245); [Toward a logic for qualitative decision theory](https://www.academia.edu/684766/Toward_a_logic_for_qualitative_decision_theory); [Qualitative Models for Decision Under Uncertainty without the Commensurability Assumption (arXiv)](https://arxiv.org/pdf/1301.6694).

## Cross-cutting summary

| Method | Needs numbers? | Produces total order? | Main defect |
|---|---|---|---|
| Pareto dominance | No | No (partial) | Silent on incomparable pairs |
| MAUT | Yes (weights + utility curves) | Yes | Weights unreliable/context-fake |
| Lexicographic | No (order only) | Yes (with threshold caveats) | The order itself is context-dependent |
| ELECTRE/PROMETHEE | Yes (weights+thresholds) | No (outranking relation) | Intransitivity, no score, doesn't scale |
| TOPSIS | Yes (weights) | Yes | Arbitrary distance-metric choice |
| AHP | Yes (derived from pairwise judgments) | Yes | Rank reversal; Dyer's validity critique unresolved |
| Prospect/regret theory | No (needs a reference point, not weights) | N/A — describes valuation, not aggregation | Only reframes gain/loss; doesn't itself rank multi-criteria bundles |
| Qualitative decision theory | No (ordinal only) | Yes, if an ordering exists | Min/max drowning effect; doesn't manufacture missing rankings |

The recurring theme: every method that produces a definite verdict needs either a numeric
weight, a fixed priority order, or a pairwise judgment matrix supplied from outside the
facts — none of which a knowledge graph produces on its own. The two exceptions that
don't need an externally invented ranking are Pareto dominance (which instead declines to
rank incomparable pairs) and prospect/regret theory (which explains why the same option
can be a gain or a loss depending on reference point, without itself claiming to resolve
multi-criteria tradeoffs).
