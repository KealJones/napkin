# Prior versions audit: Soup, Spoon v1, Spoon v2

**Purpose:** Identify what was useful in the prior implementations and where their architecture diverged from the current requirement that Concepts be the universal semantic and operational substrate. This is an architecture audit, not a judgment of code quality. The user explicitly authorized reading these three repositories. No source files in them were changed.

## Findings at a glance

| Version | What it proved | The boundary that undermined Concept universality |
|---|---|---|
| Soup (TypeScript) | A concept can own multiple composable rewrite realizations; learned rules can be persisted; natural language can be translated to a Soup expression and a user-visible trace. | Runtime behavior is split into hardcoded realization phases, opaque native/effect closures, a second effect walker in the session, and session-level task/correction routing. Native/effect implementations are omitted from Concept serialization. |
| Spoon v1 (Rust) | Typed actions, programs, effects, permissions, memory, CLI/server, and planning can form a substantial working system. | `Concept`, `Action`, `Fact`, `Clause`, `Intent`, and `Value` are separate semantic types. A clause dispatcher and typed planner route behavior; a fixed Rust kernel takes priority over CAN action resolution. |
| Spoon v2 (Rust) | The term model can unify entities, operations, facts, programs, rules, holes, and primitive payloads as atomic/compound Concepts; multiple realizations can coexist and be scored; evaluation can produce detailed traces. | Realizations are a closed enum interpreted by a fixed evaluator. `Native` is a key into a separate Rust function registry; neural and external realizations require separate injected seats/runners. The brain still owns fixed Ears/Mouth/Teacher roles and a hardcoded turn pipeline. |

## Soup

### What worked

- The TypeScript `Concept` owns its realization list, and a `SoupRule` stores a composable expression body. The tests cover concept-owned rules, ownership checks, persistence of serializable rules, and code generation to Python and TypeScript. See [concept.ts](</Users/kealjones/Git/Personal/soup/src/concept.ts:56>) and [concept.test.ts](</Users/kealjones/Git/Personal/soup/test/concept.test.ts:1>).
- The natural-language “ears” interface emits a Soup expression rather than executing the user request itself, and the `Turn` includes the heard expression, answer, natural-language response, trace, gaps, and parse source. See [ears.ts](</Users/kealjones/Git/Personal/soup/src/ears.ts:21>) and [session.ts](</Users/kealjones/Git/Personal/soup/src/session.ts:15>).
- `pnpm test`: **35 passed, 0 failed**. `pnpm typecheck`: **passed**.

### Where it diverged

- Realization selection is not open semantic composition: [Concept.realize](</Users/kealjones/Git/Personal/soup/src/concept.ts:241>) receives a hardcoded phase (`special`, `shape`, `native`, `general`) and filters implementation kinds in a prescribed order. The generic realizer invokes that sequence at [realizer.ts](</Users/kealjones/Git/Personal/soup/src/realizer.ts:87>).
- A native/effect realization is an in-memory TypeScript closure, not an inspectable or reloadable realization definition: [NativeRealization](</Users/kealjones/Git/Personal/soup/src/concept.ts:127>) and [EffectRealization](</Users/kealjones/Git/Personal/soup/src/concept.ts:153>) both return `undefined` from `toJSON()`. `Knowledge.saveConcepts` therefore persists only the `SoupRule` kind and filters out builtin rules too; see [knowledge.ts](</Users/kealjones/Git/Personal/soup/src/knowledge.ts:99>).
- External effects are not realized through the same evaluator. [fulfillEffects](</Users/kealjones/Git/Personal/soup/src/session.ts:139>) recursively searches the expression for an `EffectRealization` and executes its handler, followed by special search-result interpretation. The session is therefore a second semantic execution path.
- Session code recognizes `PlanSource`, `Correction`, `ClarificationNeeded`, and pending choices directly ([session.ts](</Users/kealjones/Git/Personal/soup/src/session.ts:63>)); this behavior cannot be changed solely by editing a Concept realization. Soup also marks implementation concepts as `internal` and excludes them from the vocabulary given to the language model ([ears.ts](</Users/kealjones/Git/Personal/soup/src/ears.ts:60>), [planner.ts](</Users/kealjones/Git/Personal/soup/src/planner.ts:33>)).

**Lesson:** Concept-owned rewrite definitions and an inspectable evaluation trace are worth retaining. A closure attached to a Concept is still a hidden implementation channel when the interface cannot show, serialize, replace, or compose it as a realization.

## Spoon v1

### What worked

- The predecessor established real, integrated capabilities: typed IR, registered kernel operations, SQLite persistence, a REPL/server, effect limits, and tests for arithmetic, JSON, files, shell, and sandbox checks. The pivot document records **345 tests passed** at that time ([PIVOT_PLAN.md](</Users/kealjones/Git/Personal/spoon/PIVOT_PLAN.md:5>)).
- The current audit run of `cargo test --workspace` ran substantial groups successfully (including 42 kernel tests, 15 store tests, 28 offline ears tests, and 14 mouth tests) but **did not pass as a whole**: its SCE test binary had a stale compiled-in corpus path and three tests could not read the fixture. A focused rebuild and `cargo test -p spoon-lang --test sce` then passed **32/32**; `corpus_parse_rate` was 136/158 (86.1%). The fixture exists at `data/bench/ace_corpus.json`. See [sce.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-lang/tests/sce.rs:13>) for the embedded path.

### Where it diverged

- The core schema has a separate `Concept` record and `Action` record; `Action` holds typed inputs/output, effect, implementation enum, grammatical role, phrasing, tier, and usage data ([can.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-core/src/types/can.rs:88>), [can.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-core/src/types/can.rs:203>)). Facts, clauses, intents, responses, and runtime values are also separate types. The design therefore cannot represent every semantic object by composing the same Concept form.
- The kernel is a fixed primitive registry. `Kernel::new` calls `register_all`, functions are stored in `HashMap<ActionId, PrimFn>`, and `call_action_at` gives a kernel primitive priority over looking up the corresponding CAN action ([kernel/mod.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-core/src/kernel/mod.rs:187>), [eval.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-core/src/kernel/eval.rs:68>)). The user-visible Action can describe the primitive, but cannot own or replace its actual implementation in the shared semantic substrate.
- Dispatch pattern-matches a separate `Act` enum and routes assertions, commands, questions, and rules through different hardcoded functions ([dispatch/mod.rs](</Users/kealjones/Git/Personal/spoon_old copy/crates/spoon-mind/src/dispatch/mod.rs:84>)). This is a parallel action/control model, not a Concept choosing and composing its own realization.

**Lesson:** Keep the integrated IO, persistence, effect boundaries, and end-to-end discipline. Do not carry forward separate action/fact/clause semantic universes, nor “registered primitive wins” dispatch.

## Spoon v2

### What worked

- V2’s central term model is closest to the desired substrate: atomic, compound, and hole terms share one recursive `Concept` type, with ground values as atomic payloads ([concept.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-concept/src/concept.rs:9>)). The design explicitly aimed to make entities, relations, expressions, programs, and inference rules Concepts ([PIVOT_PLAN.md](</Users/kealjones/Git/Personal/spoon/PIVOT_PLAN.md:15>)).
- Concept records can hold several competing realizations and their success/activation evidence ([meta.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-concept/src/meta.rs:221>)); composed and rule realizations are genuinely expressed in Concept form. The evaluator records alternatives, attempts, outcomes, depth, and effects in a trace.
- The project’s own log documents a key evaluation correction: a previous benchmark measured the Ears path and number of gaps rather than whether the answer was correct; once result grading was added, it found **280/336**, not the implied full capability ([STATUS.md](</Users/kealjones/Git/Personal/spoon/STATUS.md:182>)). It also records a Teacher few-shot contamination false positive and **0/5** honest string-reversal attempts ([STATUS.md](</Users/kealjones/Git/Personal/spoon/STATUS.md:245>)). This is valuable evidence for designing explicit end-to-end acceptance checks.

### Where it diverged

- `RealizationSpec` is a closed Rust enum (`Native`, `Composed`, `Rule`, `Neural`, `External`) ([meta.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-concept/src/meta.rs:99>)). The evaluator switches on these variants and calls different implementation paths. That means Concept realizations are data *inside* a separately privileged evaluator taxonomy rather than a universal Concept language capable of expressing how realizations work.
- A stored `Native` is only a `NativeId`. Startup binds that key to a function in a separate `NativeRegistry`, which assembles native modules and registers them outside the Concept store ([EVALUATION.md](</Users/kealjones/Git/Personal/spoon/docs/EVALUATION.md:166>), [spoon-natives/lib.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-natives/src/lib.rs:26>), [seed.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-natives/src/seed.rs:25>)). The evaluator accepts a native realization only if its registry binding exists ([eval.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-eval/src/eval.rs:542>)). This is the same structural escape hatch as v1, but hidden behind a unified term representation.
- The central `Brain` is composed from fixed `Ears`, `Mouth`, and `Teacher` seats ([brain.rs](</Users/kealjones/Git/Personal/spoon/crates/spoon-brain/src/brain.rs:69>)); the pivot plan explicitly says the interior must never use a model to choose and Teacher must not author executable bodies by default ([PIVOT_PLAN.md](</Users/kealjones/Git/Personal/spoon/PIVOT_PLAN.md:26>), [PIVOT_PLAN.md](</Users/kealjones/Git/Personal/spoon/PIVOT_PLAN.md:33>)). This is an intentional separate cognitive architecture, not just the minimal host required to run Concepts.
- The latest project status reports strong native-ear benchmark scores, but those are bounded task suites. In the audit run, `cargo test --workspace` **failed** in `spoon-brain/tests/feedback_turns.rs`: the corrected shape had two candidates where the test expected one, and a negative-feedback test did not send its expected Teacher reading request. The full workspace run stopped there, so the remaining tests were not verified.

**Lesson:** V2’s uniform term model, concept-owned realization records, multiple candidates, effect metadata, trace, and outcome feedback are useful foundations. The `RealizationSpec` closed enum, native function registry, seats, and fixed evaluator turn control are exactly where a unified-looking data model can still depend on privileged scaffolding. A green benchmark cannot establish architecture fidelity or broad capability.

## Audit implication for the new project

The decisive question for every proposed subsystem is not “is this represented somewhere as a Concept?” It is: **Can the relevant behavior be added, inspected, composed, selected, and changed by editing ordinary Concepts and their realizations, without editing a separate semantic registry or routing module?**

The user has explicitly allowed a small host harness, a separate trace store, and non-Concept UI. Those are not themselves violations. The known failure pattern is that semantic policy or an entire class of capability migrates into host-side switches, code registries, fixed seats, or hidden closures. The later design should therefore list each host operation, what Concept realizes it, what the generic host must do, and an end-to-end proof that changing the Concept changes behavior without changing host code.

## Verification commands and outcome

- Soup: `pnpm test` — 35 passed, 0 failed; `pnpm typecheck` — passed.
- Spoon v1: `cargo test --workspace` — did not pass because it selected a stale `spoon-lang/tests/sce.rs` binary with an obsolete embedded corpus path; after a focused rebuild, `cargo test -p spoon-lang --test sce` passed 32/32. Other executed workspace groups listed above passed before the stale binary stopped the workspace run.
- Spoon v2: `cargo test --workspace` — failed in `spoon-brain/tests/feedback_turns.rs` (two failing assertions). `cargo test -p spoon-brain --test feedback_turns` reproduced the same two failures; the remaining workspace tests were not reached.

All three test runs were read-only with respect to source. Cargo may have refreshed local build artifacts under each project's `target/` directory.
