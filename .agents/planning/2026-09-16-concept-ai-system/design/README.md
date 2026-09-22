# Which document to trust

Written 2026-09-22, after a long session that invalidated parts of several specs. The
point of this file is that a reader should never have to guess whether a claim is current.

**Rule of thumb:** `concept-spec.md` and `ir-spec.md` are the design. The code is the
implementation and has drifted from them in both directions — sometimes the code is wrong
and sometimes the spec is. Every known divergence is listed below.

---

## Current and trustworthy

| Document | What it is | Caveats |
|---|---|---|
| **`concept-spec.md`** (1483 lines) | The Concept unit, relations, realizations, contexts, selection, evaluation, description, learning, persistence. The primary source. | Three corrections below. |
| **`ir-spec.md`** (1010 lines) | The expression language, grammar, markers, the Ears contract, the code IR. | One correction below. Part 8.3 was unimplemented until 2026-09-21 and now is. |
| **`seed-concepts.md`** (395 lines) | What the graph starts with, and Part 12's deliberate omissions. | Two corrections below. Part 10's request vocabulary was specified and unseeded until 2026-09-22. |
| **`ir-spec-appendix-code.md`** (678 lines) | A page of the runtime translated node for node into the IR. 43 constructs. | Fully current, and now doubles as the importer's specification and test. |
| **`judgment-research.md`** (806 lines) | Why preference cannot be stored as a fact. Six literatures, the philosophy, and Part 14 on contextual relations. | Current. Part 14.2 says "not built" — it was built on 2026-09-22, see below. |
| **`self-hosting.md`** (160 lines) | Writing the runtime in Rust. Why that target is verifiable where others are not. | Current. Rung 1, the importer, is done. |
| **`novel-prompt-findings.md`** (179 lines) | 45 prompts through the parser, 10 through the pipeline. What breaks on input nobody tried. | Current, and the most useful single document for "what is actually wrong". |

Research, all current and all sourced:

- `research/ir-parser-experiments/README.md` — 10 findings on parser design. Finding 5 and
  Finding 10 together cover 2b, 4b, 9b and 27b: **do not upgrade the Ears model.**
- `research/judgment/*.md` — decision theory, preference representation, qualitative
  reasoning, prior systems, metaethics, practical reason.
- `research/novel-prompts/*` — raw data behind `novel-prompt-findings.md`.

---

## Superseded

**`detailed-design.md`** (332 lines, last touched 2026-09-17). The original baseline,
written before the two specs. Keep for history, do not use for decisions. It is wrong on
at least:

- a "searchable human-readable **gloss**" on every Concept — there is no gloss field and
  never was one in the implementation (`concept-spec.md` Part 4, contradiction 1 and 13);
- `relations: Expr[]` — a relation is now `{ claim, context? }`;
- it predates facets, residual evaluation as specified, the Ears contract, the Teacher
  protocol, and everything about learning.

---

## Known divergences, spec against code

Listed so nobody re-derives them. Each is a real change made with evidence; the specs have
not been edited to match.

| Where | Spec says | Truth as of 2026-09-22 | Why |
|---|---|---|---|
| `seed-concepts.md` Part 2 table, `concept-spec.md` Part 5.3 line 515 and Part 1100 | `SynonymOf` is `Symmetric()` **and `Transitive()`** | Symmetric only | Synonymy is the textbook non-transitive near-equivalence. At 554 Concepts the closures ran and made `Identity` equivalent to `Chore`. |
| `concept-spec.md` Part 1 | `relations` is a list of expressions | `{ claim, context? }`; absent context means anywhere | Polysemy. `Moment` is a stretch of time *and* a band, and the subject cannot disambiguate itself. `judgment-research.md` Part 14. |
| `judgment-research.md` Part 14.2 | contextual relations "not built" | built | Same day. The section header is stale, the analysis is not. |
| `ir-spec.md` Part 9 | the Ears contract is entirely about form | true, and the code had added a VOCABULARY block anyway | Removed 2026-09-21. It was a crib for Part 8.3's re-parse loop, which was never implemented and now is. |
| `concept-spec.md` Part 17.1 | `Code` is structural and says nothing about a language | true, and the runtime assumed JavaScript | `Code` now declares `language=`, a Runtime declares what it `speaks`, and a foreign body is refused rather than run. |
| `seed-concepts.md` Part 10 | `Do`, `Tell`, `Fact`, `Qualify`, `Ordinal` are the request vocabulary | they exist now; they did not until 2026-09-22 | Requests had no frame, so the parser grabbed the leading modal and the system tried to execute "can". |
| `seed-concepts.md` Part 12 | preference omitted for tie-break evidence | omitted because the graph lacks **grounding**, formalism second | `judgment-research.md` Part 9.5. |

---

## Things learned this session that are not in any spec

The ones that will cost a day to rediscover.

**An invariant enforced at a parse point gets walked around at a write point.** Three times:
the Teacher's declaration guard did not cover `forwardSynonym`; the same guard does not see
cycles formed across separate declarations; the realization store has no cycle check at all.
The rule belongs where realizations are **stored**.

**Anything that turns an expression into text is a place a gap can hide.** Three instances:
`unrealized` standing in for "did this compute" let the Mouth answer a mouse-versus-elephant
comparison from the model's own knowledge, correctly, which is worse than wrongly. `Text()`
formatted unreduced arguments into a string, so the result looked computed. The Mouth
narrated both. Check for residuals *structurally*, never by asking whether anything is
learnable.

**A limit invisible at small scale becomes a correctness bug at large scale.** The Ears
vocabulary was an alphabetical prefix — fine at 150 Concepts, and at 572 it silently cut
everything after "Requirement", including `Time` and the interrogative `What`.

**The Ears prompt is saturated.** 5,863 characters, 23 rules, 21 examples. Adding a worked
example fixed one case and broke an unrelated one by being copied verbatim. Every future
parse bug will tempt one more rule.

**A denylist that keeps growing is a missing distinction.** The "do not teach behaviour for
this" exemption needed four additions in one session: `Result`, `Modifier`, `Frame`,
`Politeness`. It should be a positive mark on structural Concepts.

**Breadth-first relation crawling diverges.** 554 Concepts known, 1,115 named and unknown.
The frontier grows about twice as fast as it can be closed, so "teach it everything" is not
a reachable state by that method.

**Two models, and only two.** Ears `qwen3.5:4b`, Teacher `qwen3.8:27b`. Measured across
four sizes: bigger parsers restructure and invent, which is the one instinct parsing does
not want.

---

## Where the work stands

Done and verified: chat answers and learns; TypeScript emission from the same graph that
interprets; the TypeScript importer reads the whole runtime with nothing unmapped; 159
tests.

Not done, in the order I would take them:

1. **`Function` and `Says` have no rendering**, so "write me a typescript function that
   says hello world" still stops at `write(Function(Says("hello world")))`. Teachable now,
   where it was structurally impossible before.
2. **Cycle detection at the store**, closing the third instance of the parse-point problem.
3. **Rung 2 of self-hosting** — 43 Rust realizations, which is a `--as Rust` run.
4. **The structural mark**, replacing the growing denylist.
