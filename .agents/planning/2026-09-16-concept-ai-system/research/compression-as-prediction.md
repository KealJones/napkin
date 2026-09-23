# Compression as prediction

Status: idea note, not a spec. Written 2026-09-23. Nothing here is built.

## Sources

- Nathan Barry, "Can gzip be a language model?", 2026-06-14:
  https://nathan.rs/posts/gzip-lm/
- Delétang et al., "Language Modeling is Compression", arXiv:2309.10668:
  https://arxiv.org/abs/2309.10668 (the equivalence the post builds on)

## What the post does

Every predictor is a compressor and every compressor is a predictor. DEFLATE finds repeats
in a 32 KiB window, so text that continues the context compresses well. The post turns that
into generation with nothing but `zlib`:

- Score a candidate continuation by `len(gzip(context + candidate))`. Shorter means more
  likely.
- Integer byte lengths are a coarse signal, so greedy byte-by-byte picking is noisy. Beam
  search fixes most of it: keep `beam_width` candidates, extend each by every byte seen in
  the corpus, score, keep the best, repeat for `horizon` bytes, commit, restart.
- Only the last `tail` bytes of generated text are visible when scoring. Without that the
  model copies what it just wrote.
- Primed on tiny Shakespeare. No weights, no training. The author's verdict: it clearly
  knows something about the text, and it is not coherent.

## Why it fits Cnocept better than a neural net

Started from "could Cnocept hold a neural model built out of Concepts". A forward pass can:
`Multiply`, `Add` and `GreaterThan` are seeded, and a neuron is a composed realization.
Training fights the design. Parts are append-only (`concept-spec.md` 3.1), so every weight
update appends a realization that has to stop winning (3.2). Each weight is inspectable
but means nothing alone, which is the opacity Part 9.1 exists to keep out.

A gzip model has neither problem:

- **One Code primitive.** `Compress` is the floor. Scoring, the tail window and beam search
  compose: `Score($ctx, $cand) := Length(Compress(Concat(Tail($ctx), $cand)))`.
- **Training is appending.** The model is the corpus. Learning means adding text, which is
  what an append-only store is good at.
- **The trace explains it.** Every choice is a compressed length that can be read off the
  trace.

Still a toy. Every candidate byte is a full compress call through a traced evaluator, under
the step budget (`concept-spec.md` 8.4).

## The useful part: the graph is already a compressor

The equivalence runs the other way too. The graph compresses what it knows:

- derived relations are computed, not stored (`concept-spec.md` 5.3),
- defaults are lower-arity realizations (6.4),
- a realization declared on a parent is shared by every child through inheritance.

That suggests **minimum description length** as the test for growing the graph.

### Generalisation (`emergent-judgment-plan.md` 3.4)

Anti-unification proposes a pattern once it covers *k* successful instances. MDL replaces
the fixed *k* with a measured condition: accept the generalised realization when

```
len(pattern) + sum(len(bindings)) < sum(len(instances))
```

measured on the same serialized expression form. The pattern pays for itself only when it
saves more than it costs. Two instances with a long shared structure qualify; ten instances
that share one head do not. The counterexample guard and `IsA`-never-`SynonymOf` stay as
they are.

### Consolidation (`memory-spec.md` 11)

Same test for turning repeated evidence into a belief or a habit: consolidate when the
consolidated form plus its exceptions is shorter than the raw evidence it covers.

### Surprise (`emergent-judgment-plan.md` 3.6)

Surprisal is code length. How surprising a turn is could be measured as how many bytes the
graph needs to describe it beyond what it already predicts. A turn the graph predicts well
costs little; a turn full of unknown Concepts and unmatched patterns costs a lot.

## Open questions

1. **What "length" means for an expression.** Node count is cheap and structural. Serialized
   characters rewards short names, which is wrong. `zlib` of the serialization is closest to
   the post but noisy at small sizes, the same quantization problem the post hit.
2. **Whether MDL should gate or rank.** As a hard gate it replaces *k*. As a ranking it only
   orders proposals for the Teacher.
3. **What it costs.** Measuring description length on every proposal adds work to the
   learning path; it needs a budget like everything else.
