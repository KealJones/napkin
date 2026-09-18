# Concept-first runtimes and related work

## Findings

### MeTTa / Hyperon is a close formal analogue, not a template to copy

The official MeTTa specification describes a recursively composed atom language with symbols, variables, grounded atoms, and expressions. Its tutorial states that programs and data share the same expression shape, enabling programs to inspect and rewrite programs. Definitions are reduction rules, expressions may return several results, and evaluation includes built-in operations. See the [MeTTa specification](https://trueagi-io.github.io/hyperon-experimental/metta/) and the [Hyperon tutorial on evaluation](https://wiki.hyperon.dev/MeTTa_Programming_Language%2BMeTTa_Programming_Language_Primer%2BIntroduction_to_Evaluation).

This shows that composable code/data, rewriting, pattern matching, and multiple results are practical concepts to study. It also highlights a risk aligned with this project's failure history: MeTTa has special evaluator forms and grounded atoms with behavior supplied by the host language. That may be a sensible interpreter design, but it makes the boundary between the universal representation and native execution something this project must keep visible and small. The user has already allowed a generic runtime for loading and running Concept realizations, while requiring capabilities themselves to remain Concepts.

The theoretical paper [Reflective Metagraph Rewriting as a Foundation for an AGI “Language of Thought”](https://arxiv.org/abs/2112.08272) develops MeTTa as metagraph rewrite rules. It is relevant as a representation idea, but it is a theoretical proposal rather than evidence that a complete autonomous system has been delivered.

### Equality saturation helps with equivalent rewrites, not all ambiguity

The [egg equality-saturation paper](https://doi.org/10.1145/3815481) describes e-graphs as compact representations of equivalent expressions. Rewriting adds equivalent forms instead of destructively replacing the input, then extraction selects a form using a cost function.

This is a useful pattern for preserving alternatives, but it assumes alternatives are equivalent under the rewrite system. The project's meanings may be contextually different, not equivalent: Fetch as a network request, ordinary retrieval, or an activity involving a dog cannot simply be optimized into one winner. Context resolution and evidence about task outcomes need a separate Concept-level process.

## Implications for the design

- Keep one recursive Concept form for definitions, composition, relations, and realizations. The body of a rule-like realization is itself a composition of Concepts; do not build a separate privileged rules catalogue.
- Keep a generic evaluator/dispatcher as the minimum host runtime. System effects such as file access, HTTP, shell, model calls, and search should be realizations owned by Concepts.
- Preserve alternative interpretations and realizations. Context chooses or retains alternatives; equivalence-rewrite machinery, if useful later, applies only where equivalence can be justified.
- Treat the evaluator's low-level native boundary as explicit and auditable. Do not let the model call an unrelated tool registry directly, which would create another action path outside the Concept graph.
- Record source text, candidate resolution, chosen realization, and outcome as trace data. The trace store itself may stay outside the Concept network per user direction.

## Open questions for design

- How should a reusable Concept definition and an invocation/composition share the same data model?
- Which kinds of realization body should the first evaluator support: Concept composition, a minimal host operation, or both?
- How should candidate selection represent context and uncertainty without a privileged dispatcher table?
- Can a tiny stable host interface be specified so a later Rust evaluator can run the same serialized Concept network?

## Source notes

The MeTTa tutorial page is explicitly marked draft / AI-generated, so treat it as introductory material. The repository's [implemented MeTTa specification](https://trueagi-io.github.io/hyperon-experimental/metta/) is the more authoritative source for syntax and special interpreter forms.

