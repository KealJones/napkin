# Metaethics and value theory research: why "Better(Gain, Loss)" keeps breaking

Context: this is the moral-philosophy half of a two-part literature check. A prior pass covered
formal frameworks (decision theory, CP-nets, default logic, argumentation, qualitative reasoning)
and found that every one of them separates a storable conflict *structure* from a resolution
*ordering* supplied from outside, with no formalism deriving the second from the first. This pass
asks whether philosophy has anything the formal literature doesn't — and largely, where it is
honest, it reports the same gap in starker terms, plus one genuinely live technical dispute
(parity) that the formal literature doesn't have a name for.

No implementation conclusions are drawn here beyond a short note per section. This is a report of
positions and disputes, not a design decision.

---

## 1. The is/ought gap and the fact/value distinction

**Hume's text and claim.** In *A Treatise of Human Nature* (Book III, Part I, Section I), Hume
observes that moral writers proceed for a while using ordinary copulas "is" and "is not," then
"of a sudden I am surpriz'd to find, that instead of the usual copulations of propositions, *is*
and *is not*, I meet with no proposition that is not connected with an *ought*, or an *ought not*."
He calls this transition imperceptible but says it "is however of the last consequence" and that
since ought expresses a new relation, "it shou'd be observ'd and explain'd," and a reason should be
given "for what seems altogether inconceivable, how this new relation can be a deduction from
others, which are entirely different from it." The passage is famous but genuinely ambiguous: SEP's
Hume's Moral Philosophy entry notes "few passages in Hume's works have generated more discussion,"
and that it is disputed whether Hume is (a) making a narrow logical point that no set of purely
descriptive premises entails an evaluative conclusion, or (b) already gesturing at a noncognitivist
view on which moral judgments aren't truth-apt propositions at all, in which case they trivially
can't be *deduced* from anything. The standard modern reading — "no ought from an is," "Hume's
Law" — treats it as (a): a gap between kinds of representation such that no valid inference crosses
from exclusively factual premises to any evaluative conclusion.

**Searle's counterexample.** John Searle's 1964 paper "How to Derive 'Ought' from 'Is'" (Philosophical
Review) tries to close the gap using the institution of promising. From the brute fact "Jones uttered
the words 'I hereby promise to pay Smith five dollars,'" Searle builds a chain through the
institutional facts that uttering those words *constitutes* promising, that promising *constitutively*
places one under an obligation, to the conclusion "Jones ought to pay Smith five dollars" (ceteris
paribus). His point is that "brute facts" (utterances) plus constitutive rules (institutional facts
about what counts as promising) yield an "ought" without ever employing an extra evaluative premise.
Critics generally reply that the ceteris paribus clause and the institutional premises themselves
smuggle in an evaluative commitment — e.g., that institutions like promise-keeping *ought* to be
respected, or that "obligation" is already a normative predicate, not a purely descriptive one — so
the derivation only relocates the gap rather than closing it. This is essentially the standard
response but is contested; the debate over whether Searle's derivation is genuinely fact-to-value or
smuggles a hidden ought remains unsettled in the literature (see Hudson's edited volume *The
Is-Ought Question*, and later replies collected around it).

**Putnam's collapse argument.** Hilary Putnam's *The Collapse of the Fact/Value Dichotomy and Other
Essays* (2002) argues that treating fact/value as a sharp *dichotomy* (not merely a rough
distinction) is both historically contingent — traceable to logical positivism's verificationism —
and unsustainable, because "thick" ethical terms and even core epistemic terms like "coherent,"
"simple," and "warranted" are themselves entangled with evaluative judgment; you cannot state what
counts as a good explanation, or even a fact worth stating, without value-laden criteria of
significance. He argues the entanglement runs in both directions: values presuppose facts (you
can't assess a policy's fairness without knowing what it does), but supposedly pure facts
presuppose values (relevance, worth-noting, explanatory goodness). His target is less Hume directly
than the positivist legacy that turned Hume's observation into a metaphysical wall, and he explicitly
uses welfare economics as a case study of a discipline whose insistence on the dichotomy produces bad
policy analysis by pretending its background value judgments are value-free facts.

**State of the disagreement.** This is not resolved. Non-cognitivists and most contemporary
naturalist realists still accept some version of the logical gap as a formal point about entailment,
even while disputing what it shows metaphysically. Putnam and other pragmatists dispute the
dichotomy's tenability at the level of concepts and practice, not the narrow entailment claim.
Searle's derivation is a genuine attempted counterexample but is widely (not universally) judged to
relocate rather than dissolve the gap.

*Bearing:* This is the same gap the formal pass found, at the deepest layer — the very distinction
between "storable relational fact" and "resolution/ordering" *is* the fact/value line, and Putnam's
point is that even the "purely factual" side of that line is not as clean as it looks.

---

## 2. Moore's open question argument and the naturalistic fallacy

**The claim.** In *Principia Ethica* (1903), Moore argues "good" names a simple, unanalyzable,
non-natural property — sui generis, not reducible to any natural property (pleasure, desire,
evolutionary fitness) or metaphysical property. He labels the error of identifying goodness with
some natural property the "naturalistic fallacy," and finds it in hedonists (Bentham), evolutionary
ethicists (Spencer), and metaphysical ethicists (T. H. Green) alike.

**The open question argument.** Take any proposed naturalistic analysis, "good = pleasant." Moore's
test: for any x already established to be pleasant, the question "but is x good?" remains a
significant, open question — not settled by the meaning of the words, the way "is a bachelor
unmarried?" is closed. If the analysis were correct, the question would be as trivial as asking
whether pleasure is pleasure; since it plainly is not trivial, the analysis fails. He runs the same
test against every proposed naturalistic (or metaphysical) definition of "good," concluding none can
succeed — good is indefinable.

**Why it's now considered flawed.** William Frankena's 1939 paper "The Naturalistic Fallacy" (Mind)
made the influential objection that Moore's argument, taken as showing naturalism false, begs the
question: it presupposes that "good" is not analytically equivalent to any natural predicate in
order to conclude that no such equivalence holds, which is exactly what the naturalist denies.
Frankena also argued Moore's label is a misnomer twice over — the fallacy isn't specifically about
*nature* (Moore's own non-natural metaphysical definitions, e.g. by idealists, are equally targeted)
and it isn't clearly a *fallacy* in the logical sense at all; he proposed renaming it the "definist
fallacy," the error (if it is one) of conflating or substituting one property for another via
definition. Separately, the **paradox of analysis** generalizes the problem: any successful
conceptual analysis "A = B" seems to face a dilemma — if A and B genuinely share meaning, the
statement should be as trivial/uninformative as "A = A," yet informative analyses don't feel
trivial; if it isn't trivial, the analysis arguably wasn't correct (didn't capture the same content).
This threatens to make Moore's open-question test into a test that *any* correct analysis of
*anything* would "fail," which undercuts its selectivity against naturalism specifically. A further
line of criticism (following Putnam-style semantic externalism about natural-kind terms) distinguishes
*concepts* from *properties*: "good" and "pleasant" can be distinct concepts (so the question stays
open at the conceptual level) while still picking out the very same property, the way "water" and
"H2O" are conceptually distinct yet co-refer — an a posteriori identity Moore's argument has no
obvious resource to rule out.

**Yet its influence persists.** SEP's Moore's Moral Philosophy entry notes that despite being widely
judged unsound as stated, "the attention it continues to receive, including from its critics,
suggests... there is something to the argument," and non-naturalists still invoke modified versions
of it. Its conclusion (moral non-naturalism, or at minimum resistance to easy reductive definitions
of "good") remains a live, respected position even though the argument that was supposed to
establish it is generally regarded as invalid or question-begging as originally stated.

*Bearing:* Directly parallel to the Napkin problem: the temptation to define `Better` reductively
(as a relation derivable from some natural facts) meets a structurally similar resistance — "is X
better?" stays open even after all the natural facts about X are fixed. Moore's argument's failure
mode (assuming what it needs to prove) is a cautionary parallel, not a solution.

---

## 3. Incommensurability and incomparability — the most important item

**Definitions (SEP, "Incommensurable Values").** *Incommensurability*: two value bearers A and B
are incommensurable (with respect to some value V) when neither is better than the other and they
are not equally good. *Incomparability*: no positive value relation holds between them at all. If
only three value relations exist — better, worse, equal — these two notions coincide. They come
apart exactly if a *fourth* positive relation is admitted: then some incommensurable pairs (not
better/worse/equal) are nonetheless comparable via that fourth relation, and only the remainder are
truly incomparable. Getting this distinction exactly right is the crux of the whole debate.

**The small-improvement / chaining argument.** Formal structure (Chang's canonical statement): (1)
A is neither better nor worse than B; (2) A+ (a marginal improvement on A) is better than A; (3) A+
is still not better than B; therefore (4) A and B cannot be related by better/worse/equal at all —
if they were equally good, A+ being better than A would make A+ better than B, contradicting (3).
Raz's illustration: a talented young person choosing between a career as a lawyer and as a
clarinetist. Neither career seems better than the other; but they don't seem equally good either,
because a slightly better lawyering job (higher pay, marginally more prestige) still doesn't seem to
tip the balance against the music career — improving one path by a hair doesn't make it beat the
other, which is exactly what should happen if they'd been tied. Parfit and Sinnott-Armstrong have
advanced versions of the same argument. The argument's direct conclusion is only incommensurability
(no fit among better/worse/equal); it doesn't by itself establish incomparability (no positive
relation whatsoever) — that further step is exactly where Chang intervenes.

**Ruth Chang's parity.** Chang's positive thesis ("The Possibility of Parity," *Ethics* 2002, and
earlier work) is that the trichotomy of better/worse/equal is not exhaustive: there is a fourth
*positive* value relation, "on a par," under which two items can be rationally comparable — genuinely
put on the same evaluative scale, weighable against each other — without either besting the other and
without being tied. Her argument has three moves: (i) items like the lawyer/clarinetist careers are
not related by better/worse/equal (via the small-improvement argument); (ii) they are nonetheless not
*incomparable* — they can be sensibly weighed, discussed, and chosen between using practical reason,
which incomparability (a bare absence of relation) shouldn't permit; (iii) the phenomenon isn't
explained away by the vagueness of comparative predicates like "better" (contra Broome, below). The
chaining argument extends this: run a sequence from Michelangelo through progressively lesser
sculptors down toward Mozart in a different art form; adjacent members of the chain seem comparable
in ways that make it implausible the endpoints are simply incomparable, supporting the claim that
"on a par" is a robust, substantive relation rather than a label for confusion.

**Precisely how parity differs from the two things it's easily confused with:**
- *vs incomparability*: incomparability is the *absence* of any positive evaluative relation — the
  items are, so to speak, off each other's scale entirely, and no principled trade-off exists. Parity
  is itself a *positive* relation: the items are on the same evaluative scale (comparable), it's just
  that the relation holding between them is a fourth kind, not one of the classical three. On
  Chang's view, parity is a species of comparability, not a euphemism for its absence, which is why
  she thinks rationally justified choice remains available in "hard choices" — the difficulty is not
  that reason has nothing to say, but that the relation reason correctly identifies isn't "better,"
  "worse," or "equal."
- *vs mere epistemic ignorance*: parity is not "we don't yet know whether A is better, worse, or
  equal to B" (an epistemic gap that further information could in principle close), nor is it vagueness
  in the meaning of "better" (an indeterminacy that a sharper definition could in principle resolve).
  It is offered as a further *metaphysical fact about the value structure itself* — even with full
  information and a perfectly precise "better than," the items would still not stand in any of the
  three classical relations. This is exactly the distinction Chang needs against Broome's rival
  explanation (next paragraph), and it is exactly the point critics contest.

**Raz's incommensurability.** Raz (in *The Morality of Freedom* and later papers) treats
incommensurability as often *constitutive* of the value or practice in question rather than a
regrettable epistemic limitation — his companionship-vs-money example: offering someone money to
temporarily abandon a spouse's companionship is not merely hard to price, the very belief that
companionship is incommensurable with money is part of what makes certain relationships (marriage)
the kind of thing they are. Treating the two as commensurable wouldn't just be practically difficult;
it would falsify or degrade the relationship's nature. This makes incommensurability partly a social
and constitutive fact, not purely a metaphysical fact about abstract value bearers.

**Critics of parity.** John Broome's rival diagnosis: apparent incommensurability is *vagueness* in
"better than" — it can be simply indeterminate (not a further fact, not a fourth relation) whether A
is better than B, in the same way it's indeterminate whether a certain man counts as "bald." His
"collapsing principle" (roughly: if it's indeterminate whether A is better than B, and a determinate
small improvement to A still leaves it indeterminate relative to B, that itself is explicable by
vagueness without needing parity) is central and contested — critics have offered counterexamples to
it. Johan Gustafsson argues, contra Chang, that the small-improvement argument doesn't succeed in
ruling out an indeterminacy/vagueness explanation, and separately defends against Chang's own
counter-objections ("argument from phenomenology," "argument from perplexity") while proposing new
counterexamples to Broome's collapsing principle — i.e., Gustafsson partly defends indeterminacy
against Chang but also complicates Broome's specific mechanism. Nicolas Espinoza argues the small
improvement argument fails outright because mere *possible* evaluative indeterminacy is enough to
block the inference to parity, without needing to show indeterminacy is actual. Erik Carlson's "Parity
Demystified" and Andersson's "Parity and Comparability" raise further technical objections to the
chaining argument specifically.

**Honest state of the debate:** unsettled, and actively worked on (Espinoza and Gustafsson both have
2020s-era papers still contesting the small-improvement argument's validity). The dispute is not
resolved by better evidence; it's genuinely a dispute about whether the value structure exhibits: (a)
determinate parity (Chang), (b) mere semantic/epistemic vagueness (Broome, Gustafsson, Espinoza), or
(c) genuine incomparability (a further possible position that both Chang and the vagueness theorists
reject, but that some pluralists gesture toward). SEP's own "Incommensurable Values" entry frames
this as live and does not adjudicate it.

*Bearing:* This is the sharpest formal analogue to the design problem. It suggests "unknown/ambiguous"
in Napkin may be conflating (at minimum) three philosophically distinct situations that the system
currently cannot tell apart: genuine parity (a real, positive, but non-ordering relation), mere
epistemic/representational vagueness (more facets would resolve it), and true incomparability (no
facets ever would).

---

## 4. Isaiah Berlin's value pluralism

Berlin's doctrine (see SEP "Isaiah Berlin," and his essays "Two Concepts of Liberty," "The Pursuit of
the Ideal") has three parts: (1) *irreducible plurality* — genuine human values (liberty, equality,
justice, mercy, knowledge, loyalty, spontaneity...) are many, and not reducible to instances or
proxies of one master value; (2) *genuine conflict* — these values "may, and often do, come into
conflict with one another," and this conflict is not a sign of confusion or of one party
misunderstanding the situation — it is, in Berlin's words, "an intrinsic, irremovable element in
human life"; (3) *no common currency* — there is no single scale on which competing values can be
weighed against each other in the abstract, no algorithm that resolves conflicts by calculation.

**Why Berlin insists this is not relativism.** Relativism (as he characterizes what he's rejecting) is
the view that one culture's or person's values are simply incommensurable *across persons/cultures*
in a way that makes cross-cultural moral understanding and judgment impossible — "I like coffee, you
like champagne; we have different tastes, that's the end of the matter." Berlin's counter: pluralism
holds instead that all these values are objective, are part of what he calls a shared human horizon
or "human nature," and that people from very different cultures and times can still *understand* — even
without endorsing — each other's value commitments, because the values in play are drawn from a
common, if large and open, human repertoire. He explicitly treats certain practices (slavery, ritual
murder, the Nazi genocide) as beyond the pale for everyone, not just relative to a culture that
condemns them, which a thoroughgoing relativist could not consistently say. So the values are
plural and often mutually irreducible, but not *arbitrary* or merely a matter of individual or
cultural taste — that is the crux of Berlin's "not relativism" claim.

**Where this gets shaky.** SEP's entry on Berlin catalogues real ambiguity here rather than resolving
it in Berlin's favor: it's unclear in his texts whether values are objective because grounded in a
substantive, universal human nature (a claim needing more metaphysical backing than Berlin supplies)
or objective merely because widely/humanly pursued (which risks collapsing back into "whatever
humans happen to value," a soft relativism). Critics also note at least three readings of
"incommensurable" in his work, ranging from weak (no quantitative common unit, but qualitative
ranking still possible) to radical (values are simply incomparable, choices among them arbitrary) —
and the radical reading is the one that threatens to make his own position indistinguishable from the
relativism/arbitrary "plumping" he explicitly rejects. Berlin's appeal, when forced to choose among
conflicting values, is to something like practical judgment or "moral sense" rather than a systematic
decision procedure — which is honest about the limits of the theory but does not resolve the tension.

*Bearing:* Berlin's "no common currency" is a value-theoretic restatement of exactly the finding from
the formal pass (no formalism derives the ordering); his "not relativism" defense is the philosophical
version of insisting that ambiguity is still meaningful and constrained, not "anything goes" — which
maps onto why Napkin treats ambiguity as a first-class surfaced state rather than silent failure.

---

## 5. Amartya Sen on incomplete orderings

Sen's target (across "Rational Fools," *Collective Choice and Social Welfare*, and later work,
summarized in the SEP-adjacent literature and his own papers such as "Maximization and the Act of
Choice") is the standard rational-choice assumption that a rational agent's preferences must form a
*complete* ordering — for any two options, the agent can say one is preferred, the other is
preferred, or they're indifferent. Sen argues incompleteness is not always a defect to be repaired by
more information or more computation; it can be the *correct*, most accurate representation of the
agent's actual evaluative state, especially where the agent faces genuinely unresolved value
conflicts (his own examples typically involve conflicting considerations of self-interest, ethics,
and group loyalty — not one that reduces cleanly to the others).

**Tentative vs assertive incompleteness.** Sen distinguishes: *tentative* incompleteness is a
placeholder — the agent (or the analyst) simply hasn't yet determined the ranking, but believes in
principle a determinate ranking exists and more deliberation, information, or reflection would reveal
it. *Assertive* incompleteness is different in kind: it is the considered, positive judgment that no
determinate ranking obtains — not "I don't know which is preferred" but "there is no fact of the
matter that further reflection would uncover; the incompleteness itself is the correct answer." This
distinction matters because standard decision theory typically only has room for the tentative kind
(treating incompleteness as a solvable epistemic problem), while Sen insists the assertive kind is
philosophically respectable and sometimes simply true of an agent's values.

**His critique of the "rationality requires completeness" assumption.** Sen argues economists and
decision theorists smuggled in completeness as a rationality *requirement* rather than an empirical or
normative finding, largely because it's mathematically convenient (complete orderings are needed for
utility representation theorems). He contends this inverts the correct relationship: refusing to rank
things that one has genuinely unresolved reasons not to rank is not irrational, and *forcing* an
arbitrary complete ranking onto a genuinely conflicted evaluative state is itself a kind of
irrationality or at least a misrepresentation — it manufactures false precision. Sen's broader project
(social choice theory, the critique of purely self-interested "rational economic man") uses this to
argue that richer, plural motivational structures in agents legitimately produce incomplete rankings
that formal models should represent as incomplete, not force-complete.

*Bearing:* This is the most direct and citable authority for treating "unknown/ambiguous" as a
terminal, correct answer in Napkin rather than a symptom that more facets or more computation should
eventually eliminate — Sen's assertive/tentative distinction gives a vocabulary for the difference
between "ambiguous because underspecified" and "ambiguous because that is the fact of the matter."

---

## 6. Bernard Williams on thick vs thin ethical concepts

Williams introduces the thick/thin distinction in *Ethics and the Limits of Philosophy* (1985). Thin
ethical concepts — good, bad, right, ought — are highly general, action-guiding/evaluative but carry
very little specific descriptive content; "good" applies across radically different kinds of things
for very different reasons. Thick concepts — cruel, courageous, generous, selfish, chaste, tactful —
combine a specific descriptive profile with an evaluative valence in a single, non-optional package:
calling an act "cruel" both describes something fairly specific about it (the intentional infliction
of suffering, indifferent to or delighting in it) and condemns it, and competent use of the word
requires grasping both at once.

**The anti-disentangling thesis.** Williams's central and most contested claim is that thick concepts
cannot be factored — "disentangled" — into a purely descriptive component plus a separable, generic
evaluative attitude (e.g., "cruel" = [neutral description D] + [negative attitude/endorsement]). His
argument is that there is no way to specify the relevant descriptive content of a thick term
*independently of an evaluative point of view* — you cannot state the extension of "cruel" (which
acts count) without already deploying some evaluative sensibility about what counts as gratuitous or
disproportionate suffering; the "neutral descriptive residue" that disentangling requires doesn't
actually exist as something specifiable without smuggling evaluation back in. On this view, an
observer with no grasp of the evaluative point of the concept could not reliably identify its
extension from "brute" facts alone — the descriptive and evaluative aspects are not two ingredients
that happen to travel together but are fused.

**The stakes and the debate.** This matters for metaethics because if thick concepts really resist
disentangling, then a purely "value-free description + separable universal evaluation" picture of
ethical language (which is what a strict fact/value dichotomy, or an is/ought-style separation, would
want) is false at the level of ordinary ethical vocabulary — evaluation is not always addable-on-top
of neutral description, sometimes it's baked in from the start. Critics (surveyed in SEP's "Thick
Ethical Concepts") push back in a few ways: some argue Williams conflates *extension-fixing*
(whether you need evaluative competence to correctly apply the term to cases) with *semantic
separability* (whether the term's meaning can still be analyzed, post hoc, as descriptive-content-plus-
attitude) — the two questions can come apart, and disentangling might survive even if a purely neutral
observer couldn't reliably sort cases. Others worry the anti-disentangling thesis makes thick concepts
resistant to internal criticism — if "chaste" or "lewd" can't be prized apart into description plus
attitude, it becomes harder to challenge the evaluative content those terms smuggle in while accepting
their descriptive deployment, which has obvious stakes for critiquing oppressive or parochial moral
vocabularies from outside the practice that uses them.

*Bearing:* If a similar fusion holds for Napkin facets and realizations, some conflicts may not
factor cleanly into "shared neutral facet + competing evaluative weighting" the way a clean
facet-matching design assumes — the facet itself may already encode a point of view.

---

## Overall assessment

Every item here reproduces, in its own vocabulary, the same shape the formal pass found: a
storable *structure* (a fact, a concept, a plurality, an ordering, a concept's descriptive content)
that stubbornly resists yielding a resolution *procedure* from within itself, and multiple
serious, mutually incompatible accounts of why. The one place where philosophy adds something the
formal literature didn't have a term for is Chang's parity — a positive claim that "ambiguous"
sometimes names a real fourth relation rather than either a solved tie or an unresolved gap — but
that claim is itself unsettled and actively disputed by philosophers (Broome, Gustafsson, Espinoza)
using essentially the same "maybe it's just vagueness" move that a formal system might reach for.
Sen's tentative/assertive distinction is the most directly actionable-sounding idea, precisely because
it is not trying to resolve conflicts but to legitimate *not* resolving them. None of this hands over
an algorithm. As the user anticipated, that is the honest result.

---

## Sources

- David Hume, *A Treatise of Human Nature*, Book III, Part I, Section I (is/ought passage).
- SEP, "Hume's Moral Philosophy" — https://plato.stanford.edu/entries/hume-moral/
- John Searle, "How to Derive 'Ought' from 'Is'," *Philosophical Review* 73 (1964) — summarized via https://philpapers.org/rec/SEAHTD-2 and https://link.springer.com/article/10.1007/s10677-012-9353-8
- Hilary Putnam, *The Collapse of the Fact/Value Dichotomy and Other Essays* (Harvard UP, 2002) — https://www.hup.harvard.edu/books/9780674013803 ; review at https://mises.org/mises-review/collapse-fact-value-dichotomy-and-other-essays-hilary-putnam
- SEP, "Moore's Moral Philosophy" — https://plato.stanford.edu/entries/moore-moral/
- William Frankena, "The Naturalistic Fallacy," *Mind* 48 (1939) — discussed in https://en.wikipedia.org/wiki/William_Frankena and https://plato.stanford.edu/entries/moral-non-naturalism/
- SEP, "Incommensurable Values" — https://plato.stanford.edu/entries/value-incommensurable/
- Ruth Chang, "The Possibility of Parity," *Ethics* 112 (2002) — https://philarchive.org/rec/CHATPO-5
- Ruth Chang, "Conflicting Reasons in the Small-Improvement Argument" — http://fas-philosophy.rutgers.edu/chang/6conflicting_reasons_in_the_small-improvement_argument.pdf
- Joseph Raz, *The Morality of Freedom*; "Incommensurability and Agency" — https://philpapers.org/rec/RAZIAA
- Johan Gustafsson, "Indeterminacy and the Small-Improvement Argument" — https://johanegustafsson.net/papers/indeterminacy-and-the-small-improvement-argument.pdf
- Nicolas Espinoza, discussed at https://philarchive.org/archive/RALTAF-2 (and Inquiry, "Epistemicism and commensurability")
- Erik Carlson, "Parity Demystified" — http://fas-philosophy.rutgers.edu/chang/5carlsonparitydemystified.pdf
- Henrik Andersson, "Parity and Comparability — a Concern Regarding Chang's Chaining Argument" — https://link.springer.com/article/10.1007/s10677-015-9621-5
- SEP, "Isaiah Berlin" — https://plato.stanford.edu/entries/berlin/
- Isaiah Berlin, "Two Concepts of Liberty"; "The Pursuit of the Ideal" (in *The Crooked Timber of Humanity*)
- Amartya Sen, "Maximization and the Act of Choice," *Econometrica* 65 (1997) — https://www-cs.stanford.edu/~epacuit/classes/rationality-fall2010/sen-max.pdf
- Amartya Sen, "Rational Fools," *Philosophy & Public Affairs* 6 (1977); *Collective Choice and Social Welfare* (1970, expanded 2017)
- SEP, "Thick Ethical Concepts" — https://plato.stanford.edu/entries/thick-ethical-concepts/
- Bernard Williams, *Ethics and the Limits of Philosophy* (1985), ch. 8

## Confidence note

High confidence on: Moore's open-question argument structure, Frankena's objection, the
small-improvement argument's formal structure, Berlin's three-part doctrine and his explicit
rejection of relativism, Williams's thick/thin distinction and the anti-disentangling thesis — these
are all directly sourced from SEP entries fetched during this research and are stable, well-documented
positions.

Medium confidence on: the precise current balance of the Chang/Broome/Gustafsson/Espinoza dispute
(the field is small, active, and I relied on search-engine summaries of papers plus one SEP fetch
rather than reading each paper in full; the characterization of who currently has the stronger
position, if anyone does, should be treated as my synthesis, not a settled verdict reported by any
single source) — and Sen's tentative/assertive incompleteness terminology (I was not able to fetch
Sen's primary text directly and am relying on secondary-source search summaries of his terminology;
the substance — that Sen distinguishes principled from provisional incompleteness and denies
completeness is required for rationality — is corroborated across multiple independent search results
and is consistent with his well-known published positions, but exact wording should be checked
against Sen's own papers, e.g. "Maximization and the Act of Choice," before quoting it directly).

Lower confidence / worth independent verification: the fine-grained content of Searle's "ceteris
paribus clauses" and exactly how he blocks the "you smuggled in a value premise" objection — I did not
fetch the original 1964 article text, only secondary summaries.
