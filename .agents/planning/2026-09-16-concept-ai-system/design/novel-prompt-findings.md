# What breaks on novel input

Forty-five prompts through the parser, ten through the whole pipeline, chosen to be things
nobody had tried. Raw data in `research/novel-prompts/`.

The prompt that started it: *"can you write me a typescript function that says hello
world"* parsed as `Can(Write(Function(), String("hello world")))`, and the system set about
learning the auxiliary verb "can", discovering among other things that it is a place in
Turkey. Then: *"I could not work that out. I do not know how to Can."*

---

## 1. The parser is not the problem

35 of 35 parsed, 1 failed a check. That was the working hypothesis and it is wrong. The
readings are mostly good:

```
what's the difference between a list and a set   What(Difference(List(), Set()))
what day is it and what time is it               Sequence(What(Day()), What(Time()))
that was wrong                                   Correction($_, "that was wrong")
```

Everything below is downstream of a correct parse.

---

## 2. The worst bug: answers from the model, not the graph

*"which is bigger, a mouse or an elephant"* answered **"An elephant is bigger than a
mouse."** The result it answered from:

```
Answer(GreaterThan(Size(Ref("a mouse")), Size(Ref("an elephant"))))
```

Nothing evaluated. The `Ref` never resolved, so `Size` was residual because its argument
was, and `GreaterThan` because its argument was. Innermost-only attribution correctly
blamed the `Ref`; a `Ref` is a Marker, so nothing was learnable; `unrealized` came back
empty; the Mouth concluded it had an answer and handed the unevaluated expression to a
language model, which answered out of its own head.

**It was right, which is what makes it serious.** A system that sometimes answers from the
graph and sometimes from the model, with no way to tell which, is not a graph-backed system.

The cause was conceptual: *"is anything learnable"* had been standing in for *"did this
compute"*, and they are different questions. There is now a direct test — `holdsResidual`
— asking whether the result still contains an expression that never ran.

**Fixed**, with one correction on top. The first version also rejected
`Describes(Promise(), ...)`, which is the best answer the system gives: describing works
*because* the subject is residual (`concept-spec.md` Part 4.0). A description is an answer
about something uncomputed, not an uncomputed answer.

---

## 3. The specified request vocabulary was never seeded

`seed-concepts.md` Part 10 specifies frames and modifiers. The graph had none of them:

| Specified | Seeded before |
|---|---|
| `Do`, `Tell`, `Fact` | no |
| `Qualify`, `Ordinal`, `Field` | no |
| `Fuzzy`, `Aside`, `Correction`, `Emphasis`, `Misspelling` | yes |

The markers existed; the frames did not. So a request had nothing to land in, and the
parser reached for whatever word came first — `Can`, `Would`. The Ears prompt's own
flagship example emits `Do(Tell(Me(), ...))`, `Qualify(...)` and `Ordinal(...)`: five
Concepts the graph had never heard of.

**Fixed.** Frames, modifiers, and politeness seeded, the last as a `Marker` so it is
recorded and never executed.

```
write me a typescript function that says hello world
  before  Write(HelloWorld())                                  typescript and function gone
  after   Write(Function(TypeScript(), Says("hello world")))

can you write me ...
  before  Can(Write(Function(), String("hello world")))
  after   Sequence(Can(), Do(Write(Function(TypeScript(), Says("hello world")))))
```

---

## 4. Structure keeps being mistaken for missing behaviour

*"dont tell me the time, tell me the date"* answered **"I do not know how to Not."**

`Not` takes an argument and realizes nothing, which is exactly the shape of missing
behaviour. So is `Describes`. So is every `Result` wrapper, every `Modifier`, every
`Frame`. Each time one surfaces it gets added to an exemption list, and that list has now
needed four additions in one session: `Result`, then `Modifier`, `Frame`, `Politeness`.

**Fixed for now, and the shape is wrong.** A denylist that keeps growing is a missing
distinction. What the system actually needs is a positive mark — structure is declared
structural, and only unmarked Concepts are candidates for behaviour. Worth doing before the
list needs a fifth entry.

---

## 5. Taught compositions cycle across declarations

*"what is half of 90"* → `BudgetExceeded(kind="depth", limit=64)`. The Teacher taught
`Half` in terms of `Division`, `Division` in terms of `Quotient`, and the chain closed.

The guard against circular bodies runs inside one `Concept(...)` declaration. These are
three declarations, each innocent alone. This is the third time in one session that an
invariant enforced at one door was walked around at another — the same shape as the synonym
forward cycle, and as the realization-store bypass.

**Not fixed.** The depth budget catches it, so it is loud rather than silent, but the right
fix is a reachability check at the point of *saving* a realization rather than at the point
of parsing a declaration.

---

## 6. The prompt is saturated

Adding rules now costs accuracy elsewhere. Adding a worked example for requests fixed the
TypeScript case and simultaneously broke an unrelated one:

```
give me three examples of a bird  ->  Sequence(Do(Write(Function())), ...)
```

It copied the example. Removing the concrete example and stating the rule abstractly fixed
that and left the rule working — but the lesson generalises. The prompt is 5,863 characters,
23 rules and 21 examples, and the measured experiments warned about this directly: "under
correction pressure the model began copying the prompt's own vocabulary literally."

**This is a ceiling, not a bug.** Every future parse failure will be tempting to fix with
one more rule, and beyond some point each rule costs more than it buys. Two ways out worth
considering: fewer, more general rules, or a second pass that repairs a parse rather than a
longer prompt that prevents it.

---

## 7. Smaller things, measured and unfixed

**Digits become words.** `"take 10"` → `Number("ten")`, `"three examples"` → `Three()`. A
rule was added and did not hold; the behaviour is unstable between runs.

**Interrogatives used as role labels.** `"remind me to call mum tomorrow"` →
`Remind(Who(Me()), When(Tomorrow()), What(Call(Mum())))`. An interrogative is a hole
(`seed-concepts.md` Part 10) — this is a statement written as three questions. A rule was
added and did not hold.

**Options captured then discarded.** The multiple-choice prompt binds all four options and
then asks `What(Ref($today))`, ignoring them. The parse keeps the information; the
expression throws it away.

**No path from a request to a target language.** `--as TypeScript` teaches Concepts to emit
source, and nothing connects *"write me a typescript function"* to that facet. The
machinery exists and chat cannot reach it. This is the most valuable unbuilt thing here.

**The system knows nothing about itself.** *"what can you do"* → `Can(Capabilities())`, then
learning `Capabilities` from the web. It has no Concept for its own abilities, though the
graph could answer it directly — the realizable Concepts *are* the capabilities.

---

## 8. Score

Ten prompts, whole pipeline, before and after this session's fixes.

| | before | after |
|---|---|---|
| correct | 4 | 4 |
| **invented an answer** | **1** | **0** |
| honest refusal | 3 | 5 |
| crashed the budget | 0 | 1 |

The headline number did not move, and that is the honest summary: this session removed a
category of dishonesty rather than adding capability. The system is not better at answering;
it is better at not pretending. Given that the alternative was a graph-backed system quietly
answering from a language model, that is the right trade — but nobody should read it as
progress on the thing the prompts were testing.
