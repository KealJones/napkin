# Realization selection, success evidence, and tracing

## What research says about success-weighted selection

Contextual bandit work formalizes repeated selection among actions given a context, followed by feedback on the action that was actually chosen. It does not remove the need to define a reward signal. The primary [contextual bandit off-policy evaluation paper](https://proceedings.mlr.press/v70/wang17a.html) studies how hard it is to estimate the value of a new selection policy from data gathered by a different policy, and shows estimators with bias/variance tradeoffs. In other words, a raw historical win rate can be misleading when contexts differ, feedback is sparse, or alternatives were not tried in comparable contexts.

For this system, “success” must be task/context specific. Possible evidence includes:
- Exact evaluator result for arithmetic.
- Tests or an explicit task outcome for generated code.
- User acceptance/correction for language interpretation.
- Validated sources and facts for research.
- Confirmation that the intended prior-memory item was retrieved.

These are candidate signals, not settled requirements. A single scalar score across math, coding, language, and research would erase important differences. The first version should record evidence and let the user inspect it. Automated statistical ranking can be introduced only when a Concept provides a clear feedback signal for its task and the system logs which realization was selected, in what context, and under what selection policy. Keep realizations side by side; do not require whole-Concept versioning.

## Traceability

The user's observability request fits an event trace:
- A conversation has a trace identifier.
- Each Concept invocation gets a unique occurrence identifier, parent/caller identifier, Concept identity, realization identity, contextual inputs, arguments, outputs, start/end time, status, and source spans when derived from prompt text.
- Candidate realizations and the selection basis are logged before execution; returns, errors, and externally observed outcomes are logged afterward.
- The chat displays the prompt-to-Concept mapping and streams Concept events as they happen; the history/dashboard replays the same stored trace.

Ollama supports streaming responses, but structured output is useful for accepting a completed parse because it can be validated as one object. The system can stream its own explicit Concept events while the model runs, then append the model response as an event. A Concept trace provides inspectable system reasoning steps; it should not pretend to record hidden internal neural computations that were not expressed as Concept operations.

OpenTelemetry defines spans and span events for representing the duration and nested events of an operation. It may be useful as a transport or vocabulary for tracing, but the system's own durable Concept execution event schema should remain the canonical log because arguments, Concept IDs, realizations, and graph links are domain-specific. See the [OpenTelemetry trace API](https://opentelemetry.io/docs/specs/otel/trace/api/).

## Sources

- [Contextual bandit off-policy evaluation (PMLR)](https://proceedings.mlr.press/v70/wang17a.html)
- [OpenTelemetry Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [Ollama streaming](https://docs.ollama.com/api/streaming)

