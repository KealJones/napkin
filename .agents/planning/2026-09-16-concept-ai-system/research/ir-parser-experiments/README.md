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

---

## 8. Interrogative placement: wrapper vs in place

`results/05`, qwen3.5:4b, 7 inputs x 6 samples, three variants.

The question was where a question word goes. **A** wraps the proposition
(`What(Need(We(), $_))`), **B** puts it in the argument slot when an argument is unknown and
wraps only when the whole value is unknown, **C** always puts it in a slot and uses an
explicit `Is(x, What())` for value questions.

| variant | valid | fidelity |
|---|---|---|
| A, wrapper | **100%** | 65% |
| B, in place with wrap for values | 86% | 69% |
| C, always in place | 69% | **70%** |

Per input, valid/N and fidelity:

| input | A wrapper | B in place | C strict |
|---|---|---|---|
| "What is todays date?" | 6/6 50% | 3/6 33% | 5/6 **67%** |
| "What is 5 times three?" | 6/6 67% | 6/6 67% | 5/6 **94%** |
| "what do we need to finish this?" | 6/6 **100%** | 5/6 83% | 5/6 **100%** |
| "who wrote this file?" | 6/6 58% | 6/6 **100%** | 6/6 **100%** |
| "which tests fail on which platforms?" | 6/6 **100%** | 6/6 **100%** | 2/6 33% |
| "who ate what at the party?" | 6/6 50% | 6/6 **100%** | 6/6 94% |
| "tell me what changed in which files and whether it broke the build" | 6/6 **60%** | 4/6 40% | 0/6 27% |

**No variant wins, and the aggregate is misleading.** A has perfect validity while producing
the wrong meaning on the case that motivated the change:

```
"who ate what at the party?"
A:  Who(Ate($_, $_))          valid, and wrong — only "who" is asked; the second
                              unknown becomes an anonymous hole with no interrogative
B:  Ate(Who(), What())        correct
```

That is the decisive observation, and it matches Finding 1: **A fails silently while B and C
fail loudly.** A's bad output parses, satisfies every structural check, and quietly means
something the user did not ask. B's and C's failures are malformed lines the parser rejects
and a repair pass can attack.

Where each is genuinely better:

- **Argument-position holes** — in place wins decisively, 100% against 58%.
- **Multi-hole questions** — in place wins, 100% against 50%, and A cannot express them at
  all without losing which interrogative owns which hole.
- **Value questions and long mixed messages** — the wrapper wins, and C collapses entirely
  on the mixed input.

B's specific failure is worth separating from its design. The bad samples look like
`Today() = Date()`, an assignment with a call on the left, which is not legal in the line
form at all. That is the producer garbling the surface syntax rather than misapplying the
interrogative rule, so it is plausibly a prompt-example problem rather than an intrinsic
cost. Untested.

**Decision.** B is kept, on the design argument (a wrapper restructures the message, which
the IR forbids elsewhere), on the two cases that motivated the change, and on the
loud-versus-silent asymmetry. Its weakness on value questions is recorded as needing prompt
work rather than a design change, and that is a hypothesis this run does not confirm.

---

## 9. Two prompt rules, and the placeholder-name effect

`results/06` and `results/07`, qwen3.5:4b, 7 question inputs x 6 samples.

Reading the raw output of Finding 8 showed the dominant failure was not *where* the
interrogative went but that it **often was not emitted at all**. "What is 5 times three?"
produced `Multiply(5, Number("three"))` in 6 of 6 samples: a bare proposition,
indistinguishable from asserting it. Two mechanical checks followed.

| variant | clean | has interrogative | fidelity | lexical errors |
|---|---|---|---|---|
| base | 67% | 67% | 65% | 4 |
| + two rules | 86% | 86% | 72% | **0** |
| + repair retry | 86% | 90% | 72% | 13 |
| **+ no placeholder names** | **100%** | **100%** | **86%** | **0** |

### The two rules

1. *If the message asks a question, the output must contain an interrogative*, with the
   failing case shown explicitly as wrong.
2. *Every name must start with a capital letter and be followed by parentheses.*

Effect on the case that motivated them, "What is 5 times three?": **0/6 → 6/6** carrying an
interrogative, fidelity 67% → 100%. Rule 2 took lexical errors — `Finish(this)`,
`WhichOf(tests, Platforms)`, `Is(result, What())` — from 4 to 0.

Both are also **checkable after the fact**, not merely hoped for in the prompt. A question
whose parse contains no interrogative is a detectable error, which is the pattern that has
worked throughout: catch it mechanically rather than trusting the instruction.

### Repair retry is not worth it

Feeding the validator's complaint back for one retry moved interrogative coverage 86% → 90%
and fidelity not at all, while lexical errors rose from 0 to 13.

The retried samples show why, and it is instructive: under correction pressure the model
began copying the vocabulary listing **literally**, emitting `Tell(to, content)` — the
placeholder parameter names from the prompt's own vocabulary section, reproduced as if they
were a real expression.

### Placeholder parameter names cost 16 points of fidelity

That observation was tested directly. The only change was rewriting the vocabulary from

```
Fact(x)  Do(x)  Tell(to, content)  Whether(proposition)  Date(when)  Multiply(a,b)
```

to a form carrying no invented parameter names

```
Fact(...)   Do(...)   Tell(...)  as in Tell(Me(), Answer())
Whether(...)   Date(...)   Multiply(...)
```

Nothing else differed. Result: clean 90% → **100%**, fidelity 70% → **86%**, and the hardest
input went from 2/6 clean at 7% fidelity to **6/6 clean at 57%**.

The effect is larger than literal copying accounts for, since neither variant emitted
`(to,` in this run. Placeholder names appear to degrade the surrounding output too: the
weaker variant produced `ChangedFiles() = Tell(You(), What(ChangedFiles()))`, an assignment
with a call on its left, which is not legal in the line form at all. The stronger variant
did not.

**Caveat:** n=6 per cell. The effect is large and consistent across inputs, but this is one
run and the mechanism is inferred rather than demonstrated.

### Cumulative

From the Finding 8 baseline to here, changing only the prompt: validity 67% → 100%,
fidelity 65% → 86%, lexical errors 4 → 0.

This also closes a loop. The original critique of the old parser prompt argued that its
instruction "never copy a name from a syntax illustration" was a tell — that the fix was to
remove the placeholder names rather than warn about them. That was reasoning at the time.
It is now measured, at 16 points of fidelity.

---

## 10. 27b as the Ears: no better, three times the cost

Finding 5 tested 2b, 4b and 9b and concluded the Ears should not be upgraded. 27b was never
tried, and two things had changed since that made it worth asking again: the vocabulary
block was removed from the prompt, so the task became rendering the idea rather than
choosing from a list, and the prompt gained rules and examples it did not have then.

Six messages, one sample each, current prompt, `qwen3.5:4b` against `qwen3.8:27b`.

| | 4b | 27b |
|---|---|---|
| identical readings | 5 of 6 | |
| average | 2.9s | 9.0s |
| total | 17.3s | 54.1s |

Both produced the same reading for the clock question, the two `How` questions, the
arithmetic, and — exactly, character for character — the long multi-clause case that was
the hardest input in the original experiments:

```
Let($measure, Correction(Field("size"), Field("length")),
  Let($files, Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2)),
    Let($total, Sum(Property($files, $measure)),
      Do(Tell(Me(), Whether(GreaterThan($total, Ref("before"))))))))
```

The one divergence went to neither. On "gimmie synonyms for happy" the 4b wrote a spurious
`Fuzzy` marker and treated the adjective as a back-reference; the 27b wrote
`Give(Me(), $words)` — adding a request that the message does not contain. That is the
same failure Finding 5 recorded for the 9b, "more inclined to restructure and summarise",
and inventing content is worse than marking it badly.

**Finding 5 stands and now covers 27b.** Do not upgrade the Ears. The extra capacity is
spent on restructuring, which is precisely the instinct this task does not want, and the
cost is three times the latency on every turn.

Caveat: one sample per message against six messages is indicative. It is enough to rule
out a large improvement and not enough to measure a small one.
