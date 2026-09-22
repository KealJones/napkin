# Legacy

Superseded, and kept anyway. Nothing here should be used to decide anything — each document
is listed with what replaced it and the reason it is still worth having.

The test applied: **does it record a decision, a measurement, or a reason that is not
written down anywhere current?** Build logs and scratch notes from a runtime that was
rebuilt failed that test and were deleted; git has them if anyone ever wants them.

| Document | Superseded by | Why it is kept |
|---|---|---|
| `detailed-design.md` | `design/concept-spec.md` and `design/ir-spec.md` | The original baseline, and the only place the early shape is written down — including a searchable `gloss` field on every Concept, which the implementation never had and the specs explicitly refuse. Useful for seeing what the design moved away from. |
| `architecture-options.md` | `design/concept-spec.md` | The options considered before the substrate was settled, and why the others lost. |
| `realization-selection-and-tracing.md` | `design/concept-spec.md` Part 9 | The first pass at selection. Part 9 is a strict improvement and this is where its reasoning started. |
| `local-models-and-concept-lookup.md` | `research/ir-parser-experiments/README.md` | Written before anything was measured. Kept because it shows what was believed before the experiments, and several of those beliefs turned out to be wrong. |
| `research-plan.md` | the research it planned | What was intended to be investigated, against what actually got investigated. |
| `research-summary.md` | `design/README.md` | A status document saying research was complete. The findings it summarises are still live in `research/`. |
| `planning-summary.md` | `design/README.md` | Same: a status snapshot, superseded by an index that says which documents are current. |
| `implementation-plan.md` | the implementation | The staged build plan. Mostly executed. Useful for what was deferred on purpose rather than forgotten. |

## Deleted rather than kept

`.agents/scratchpad/Cnocept/first-runtime/` — three scratch notes and twenty-four build
logs, 2,195 lines, from the first runtime. That runtime was rebuilt from the specs, and the
notes describe storing Concepts in SQLite with a `gloss` field: two decisions that no longer
exist. The logs were `tsc` and test output. Nothing in it recorded a reason.
