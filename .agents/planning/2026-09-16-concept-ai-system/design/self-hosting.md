# Writing itself in Rust

A target, and the reason it is the right one.

---

## 1. Why this target

Every other test of this system needs a human to judge the answer. Is that a good
description of chess? Did it choose well? Even the honest refusals are judgement calls.

This one is not. Either the Rust compiles and the tests pass, or it does not. The
benchmark is a number that goes up, nobody has to adjudicate it, and the system cannot
talk its way into a passing grade.

It is also self-referential in a way that keeps it honest: the thing being translated is
the thing doing the translating, so every capability it lacks shows up as a concrete
failure rather than as an abstract gap.

## 2. What is already proven

**The codebase is expressible as Concepts.** `ir-spec-appendix-code.md` translates the
runtime's own source node for node, and uses only **43 distinct constructs**. That is the
whole vocabulary a first pass needs, and it is small.

**Emission works.** `--as <Facet>` teaches an existing Concept to write itself in a named
context, verified end to end:

```
Execution   If(GreaterThan(3, 1), Multiply(6, 7), Add(1, 1))  ->  42
TypeScript  If(GreaterThan(3, 1), Multiply(6, 7), Add(1, 1))
            ->  "if ((3 > 1)) { (6 * 7) } else { (1 + 1) }"
```

`Rust` is already a seeded facet under `TargetLanguage`. `Text(Rest($parts))` assembles
source, and its arguments emit under the same facet, so nesting composes without any
construct knowing about any other.

## 3. Ownership is a context, not a Concept

The obvious objection is that Rust needs ownership and a Concept graph has no idea what
borrowing is. That objection is wrong, and the correction matters more than the example.

Ownership is not a property of a variable. The same `x` is owned in one place and borrowed
three lines later. Recording it on the Concept would be storing a situational verdict as a
fact about the thing — the identical error as `Better(Gain(), Loss())`
(`judgment-research.md` Part 1).

It is a **facet**, and facets already conjoin:

```
Reference($x)  in Rust()                    ->  Text($x)
Reference($x)  in Rust(), Borrowed()        ->  Text("&", $x)
Reference($x)  in Rust(), MutableBorrow()   ->  Text("&mut ", $x)
```

`Rust() + Borrowed()` carries more facets than `Rust()` alone, so specificity selects it
with no new mechanism. The apparent wall is the machinery that already exists.

What this relocates rather than removes: **deciding which facet is in play where** is still
whole-program analysis. The representation is settled; the inference is not. That is the
same split the judgment research found everywhere — structure is representable, the
selection comes from outside it.

## 4. The compiler is a Teacher with ground truth

Here the analogy to preference breaks, in the system's favour.

For a value question, nothing tells you that you chose wrong. That is why
`judgment-research.md` Part 8.3 concludes those gaps may be **assertively** incomplete —
settled as having no answer.

Ownership is **tentatively** incomplete. More information settles it, and the information
source is a program you can run in a loop:

1. emit under a guessed facet set;
2. `cargo check`;
3. read the error — it names the binding and usually the direction;
4. flip a facet, re-emit.

The system already has a Teacher. This is a Teacher that is free, exact, never invents
anything, and is available a thousand times an hour.

**The general form is the point.** Any domain carrying a verifier — a type checker, a test
suite, a compiler, a linter — is a domain where this system can close its own gaps without
a model and without a person. That is a much stronger claim than "it can learn Rust," and
it suggests verifier-backed domains are where to aim next, not where to stop.

## 5. The ladder

Each rung is independently useful and independently verifiable.

| # | Rung | Verified by |
|---|---|---|
| 1 | **Importer**: TypeScript source to Concept expressions. The appendix is the spec for what it should produce; the TS compiler API supplies the AST, so this is a translator rather than a parser. | round trip — import, emit TypeScript, compare to the original |
| 2 | **Construct vocabulary in Rust**: 43 realizations under `Rust()`, not 4. Now a command rather than a project. | `cargo check` on hand-picked snippets |
| 3 | **Ownership facets**: `Owned`, `Borrowed`, `MutableBorrow`, `Shared`, and the realizations that vary on them. | compiles, or names the binding that does not |
| 4 | **The compile loop**: guess, check, flip, re-emit. | the error count falls |
| 5 | **The pure modules**: `expression.ts` and `match.ts`, roughly 700 lines of functions over primitives and trees, no I/O, no async. | the ported tests pass |

Rung 5 is the first real milestone. Rungs 1 and 2 are mechanical and could start today.

## 6. Honest limits

**This is transpilation, not design.** The output will be TypeScript-shaped Rust —
faithful, compiling, and not what a Rust programmer would have written. Idiomatic Rust is a
different program, and no facet fixes that.

**Three constructs have no clean mapping** and will need real decisions rather than
realizations: `async`/`await` onto an executor, exceptions onto `Result`, and structural
typing onto traits. Each is a design question the graph cannot answer by emitting harder.

**The 30 `code()` bodies are the port, not the evaluator.** Every seeded realization is a
JavaScript closure. Either embed a JS engine, or rewrite them as native functions and let
`Code(...)` mean "a host function" rather than "JavaScript" — which is what the spec
already says it means (`concept-spec.md` Part 17.1 lists `Code` as structural, and says
nothing about the language).

**And the honest framing of the whole thing:** succeeding here proves the system can
mechanically translate between two formal languages given a verifier. It does not prove it
understands programming. It is a real capability and a narrow one, and worth stating that
way before the demo makes it look like more.
