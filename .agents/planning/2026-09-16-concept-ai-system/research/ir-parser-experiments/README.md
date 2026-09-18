# IR parser experiments

Evidence behind the Ears contract in `design/ir-spec.md` Part 9. Every rule in that part is
either measured here or derived from a failure measured here.

Run date: 2026-09-17. Host: local Ollama 0.33.3 on macOS.

## Why these exist

The surface form of the IR is a choice that only a measurement can settle: it has to be
easy for a small local model to write consistently and easy for a human to read. Opinion
was producing circular arguments, so each contested decision was turned into an A/B with a
fixed input set and a mechanical scorer.

## Method

- **Validator is independent of the project.** `scripts/ir.mjs` is a reference parser
  written from the grammar in the spec, not imported from `packages/concept-runtime`. This
  matters: validating against the project's own parser would let the existing
  implementation define correctness, which is the thing under review.
- **Scoring is mechanical**, never eyeballed:
  - `rawValid` — the reference parser accepts the output as emitted.
  - `afterRepair` — accepted after appending missing close parens. Isolates recoverable
    paren slips from real structural failures.
  - `fidelity` — fraction of the markers the input *requires* that appear anywhere in the
    output. For the hard input those are `Correction, Ref, Ordinal, Not, Sum, GreaterThan,
    Fuzzy`. This catches output that parses but silently drops meaning.
  - `depth`, `clauses`, `avgMs`, `avgLen`.
- Temperature 0.3, 3-6 samples per cell. Generation capped at 1024 tokens with a 90s
  request timeout, for reasons in Finding 6.
- Six inputs, weakest to hardest: `simple` (arithmetic), `deictic` (today's date), `count`
  (letters in a word), `multi` (four sentences, a misspelling, two relative durations),
  `hard` (the "weights, er the scores" request: retraction, vague word, negation, ordinal,
  two history references, aggregation, comparison), `meta` (a long, self-referential,
  mid-sentence-corrected request).

## Findings

### 1. Nested bindings fail silently; flat fails loudly

`results/01`. A variant where each binding nests the rest of the message in a `body=`
argument produced this:

```
Let(name=$weights, value=Correction(...), body=Let(...), body=Let(...), body=Question(...))
```

Three `body=` arguments on one `Let`. Syntactically valid, semantically void. A consumer
reading the first `body=` silently discards two thirds of the message.

The flat variant's only failure mode was a missing paren, which the parser rejects loudly
and a repair pass fixes. **Losing loudly beats losing silently**, and that asymmetry, not
the raw validity numbers, is what decided the form.

Also notable: on the multi-sentence input the nested variant ignored its own instruction and
wrote flat six times out of six. The model prefers flat even when told otherwise.

### 2. All-named arguments cost validity and length for nothing

`results/01`. Named 87% valid vs positional 100%, and about 60% more characters. Naming
every argument gives a small model one more thing to be inconsistent about per call.

Spec: positional by default, named only where role order is genuinely ambiguous.

### 3. Broadcast beats lambda for aggregation

`results/02`. With `Sum(Map($items, Lambda($x, Property($x, $f))))` in the vocabulary,
every sample got "add em up" wrong, emitting `Sum($measure)` — summing the field *name*
rather than the values. With `Property(collection, key)` reading a field from every item,
it was correct.

The lifting belongs in the realization, written once, not in the producer, re-derived and
mis-derived per request.

### 4. Explicit completeness instructions were the largest fidelity gain

`results/02`. Adding "mark every retraction / negation / vague word; write a clause for
every distinct thing; do not drop any" moved the hard input from 86% to 100% marker
coverage, with three of three samples structurally identical.

### 5. Model size: 4b is the sweet spot, 9b regresses

`results/03`, variant F, 6 inputs x 6 samples per model.

| model | rawValid | afterRepair | fidelity | avgMs |
|---|---|---|---|---|
| qwen3.5:2b | 78% | 81% | 64% | 1.4s |
| **qwen3.5:4b** | 83% | **97%** | **87%** | 1.8s |
| qwen3.5:9b | 92% | 94% | 81% | 2.9s |

Per input, afterRepair and fidelity:

| input | 2b | 4b | 9b |
|---|---|---|---|
| simple | 6/6 100% | 6/6 100% | 6/6 100% |
| deictic | 6/6 100% | 6/6 100% | 6/6 100% |
| count | 2/6 33% | 6/6 100% | 6/6 100% |
| multi | 6/6 100% | 6/6 96% | 6/6 100% |
| hard | 5/6 64% | 6/6 100% | 6/6 93% |
| meta | 4/6 13% | 5/6 43% | 4/6 23% |

9b is worse than 4b on fidelity and 1.6x slower, regressing specifically on `hard` and
`meta`. The larger model is more inclined to restructure and summarise, which is the wrong
instinct for a job that is pure faithful transcription. 2b collapses on `count`.

**Do not upgrade the Ears model.** Spend the budget on the prompt and the repair pass.

### 6. Unbounded generation is not safe

With `num_predict: -1`, qwen3.5:0.8b entered a runaway on the `meta` input and never
returned; the run had to be killed. The correct fix for an arbitrary 384-token cap is a
generous cap plus a request timeout, not an infinite one. All later runs used 1024 tokens
and a 90s timeout.

### 7. Assignment lines beat one big expression

`results/04`, qwen3.5:4b, 6 inputs x 6 samples.

| variant | rawValid | afterRepair | fidelity | avgLen |
|---|---|---|---|---|
| F, one `Utterance(...)` expression | 94% | 97% | 78% | 195 |
| **G, one `$name = expr` line per phrase** | **97%** | **100%** | **82%** | 201 |

Per input, rawValid and fidelity:

| input | F single | G lines |
|---|---|---|
| simple | 6/6 100% | 6/6 100% |
| deictic | 6/6 100% | 6/6 100% |
| count | 6/6 100% | 6/6 92% |
| multi | 5/6 96% | 6/6 75% |
| hard | 5/6 81% | **6/6 100%** |
| meta | 6/6 27% | 5/6 40% |

The aggregate margin is modest and F is better on `multi`, so this is not a landslide. G
was chosen because it wins on validity, wins decisively on the hardest input, and has two
structural advantages the aggregate does not show:

- **No outer paren.** The only hard failure measured on 4b was an unbalanced `Utterance(`
  that swallowed every following clause. Line form removes that token from the output.
- **Fault isolation.** One malformed line is one malformed clause and the rest still parse.
  In a single expression, one slip anywhere destroys everything.

Winning output for `hard`, reproduced three times out of three:

```
$weights = Correction(Field("weights"), Fuzzy(Field("scores")))
$probes  = Qualify(Ref("those probe things i sent you"), Not(Ordinal(1)), Ordinal(2))
$total   = Sum(Property($probes, $weights))
Question(GreaterThan($total, Ref("this time")))
```

## Correction: the `deictic` fidelity target was under-specified

The `deictic` input ("What is todays date?") was scored against required markers
`["Question", "Today"]`, and every model scored 100% on it. **That score measured almost
nothing.**

`Question(Today())` carries no interrogative, so "when is today", "what is today", and "who
is today" all satisfy it, and it conflates the subject (`Date`) with a temporal qualifier
(`Today`). The design has since replaced it: the interrogative marks the question and there
is no `Question` wrapper, so the correct target is `WhatIs(Date(Today()))` — see
`../../design/ir-spec.md` Part 9.7.

What this does and does not affect:

- **The `deictic` fidelity column overstates.** Treat its 100% as unmeasured rather than
  passed.
- **Every `Question`-based target is now stale**, since the vocabulary changed after these
  runs. Re-measuring fidelity requires updating the prompts as well as the targets and
  re-running.
- **The decisive findings are unaffected**, because they rest on validity and repairability,
  which do not depend on the marker targets at all, and on `hard` and `multi`, whose targets
  were structural. Specifically: nested bindings failing silently, assignment lines beating
  one wrapped expression, 4b beating 9b, and the completeness-instruction gain all stand.

The scripts are deliberately left as they were run. Editing them to targets that were never
used would make the stored JSON inconsistent with the code that produced it, which is worse
than a documented overstatement.

## Known weak spot

The `meta` input scores 13-43% fidelity at every model size. It is the only input that
fails *structurally* rather than syntactically: long, self-referential, corrected
mid-sentence, and containing a file path. Everything else is at or near 100% on 4b.

This is a genuine gap, not noise, and it is not fixed by a bigger model. Likely
requirements: the `Self()` referent listed as open in the spec, and clause-level
decomposition so a long message is parsed in segments rather than in one pass.

## Files

```
scripts/ir.mjs     independent reference parser + depth/heads/arity helpers
scripts/ab.mjs     round 1: flat vs nested vs named vs no-depth-rule
scripts/r2.mjs     round 2: lambda vs broadcast, completeness instructions
scripts/scale.mjs  model size curve
scripts/lines.mjs  single expression vs assignment lines
results/*.json     full raw output of every sample, including the text emitted
```

Every `results/*.json` keeps the verbatim model output per sample, so the scorers can be
changed and the data rescored without re-running any model.

## Reproducing

```bash
cd scripts
node ab.mjs    > ../results/01-round1-flat-vs-nested-vs-named.json
node r2.mjs    > ../results/02-round2-broadcast-and-completeness.json
SAMPLES=6 node scale.mjs > ../results/03-model-size-curve.json
MODEL=qwen3.5:4b SAMPLES=6 node lines.mjs > ../results/04-single-expression-vs-lines.json
```

Needs Ollama on `127.0.0.1:11434` with `qwen3.5:2b`, `qwen3.5:4b`, `qwen3.5:9b` pulled.
Override with `MODEL`, `MODELS`, `SAMPLES`, `TEMP`.
