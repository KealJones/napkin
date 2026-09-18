# Research findings summary

**Research status:** Complete. The user approved proceeding to detailed design; the design and implementation plan are now available in the sibling `design/` and `implementation/` directories.

## Findings that shape the design

1. **A concept-as-code-and-data system has close prior art.** MeTTa/Hyperon treats expressions as both data and evaluable programs and supports pattern matching, rewriting, and multiple results. It is useful to study, but its special evaluator forms and host-grounded operations are also a warning: this project must make the minimal native boundary explicit and keep every capability represented as a Concept realization.
2. **Keep the local model on the interpretation side of the boundary.** Ollama can return schema-constrained JSON through its JavaScript API. Use this for PromptInput and AskTeacher to propose Concept structures, validate those structures, then evaluate them through the Concept runtime. Avoid a separate model-driven tool registry as an action path.
3. **Start local lookup with ordinary search plus graph traversal.** SQLite FTS5 can search names and plain-English glosses; recursive CTEs can traverse stored Concept relations. These are adequate to evaluate first without a remote service or a dedicated graph database. Search results are a lookup aid; Concept relations and realizations remain the source of semantics.
4. **Realization scoring needs real feedback.** Contextual-bandit research assumes a context, a selected action, and reward feedback. It does not define success for the project. Use domain-specific evidence (exact arithmetic checks, tests, user correction/acceptance, source verification) and log it first. Do not invent one scalar score for all task types or promise meaningful statistical selection before outcome signals exist.
5. **Node permissions alone are not the sandbox.** Node describes its permission model as a seat belt for trusted code, not a security boundary against malicious code. Apple App Sandbox offers OS-enforced file/network limits and user-selected files, but its external-program limits may complicate arbitrary CLI Concepts. Docker Desktop on Mac uses a Linux VM boundary; any host folder explicitly shared is still accessible. Defer the sandbox phase, then choose and test an OS-level boundary before autonomous execution.
6. **Keep the first milestone on demand.** Per the user's steering, defer always-running Exist and autonomous sandbox actions until the Concept framework demonstrates useful thinking. Keep them as later phases, not hidden prerequisites.
7. **Prior failures came from semantic escape hatches, not missing Concepts as labels.** Soup got closest to editable concept-owned rewrites, but its phase-based realizer, opaque native/effect closures, separate effect walker, and session routing still held behavior outside editable realizations. Spoon v1 separated Concepts, Actions, Facts, Clauses, and dispatch, and gave a fixed kernel priority. Spoon v2 unified term data and added competing realizations, but used a closed realization-kind enum, a separate native registry, fixed LLM seats, and evaluator routing. See [prior-versions-audit.md](prior-versions-audit.md).
8. **Tests must challenge architecture, not only outputs.** The audit found that a prior Spoon benchmark graded its processing path rather than answer correctness; corrected grading materially reduced the score. Soup's 35 tests and typecheck passed. Spoon v1's broad workspace invocation selected a stale SCE test binary, while the rebuilt SCE integration suite passed 32/32. Spoon v2's two feedback-turn assertion failures reproduced in an isolated run. Tests should include changing a realization without changing host code, inspecting/persisting every realization, concept-only end-to-end behavior, and useful regression cases for output correctness.

## Suggested first demonstrable slice

A user can enter either Concept-expression text or ordinary language. A PromptInput realization yields a source-preserving Concept representation; the same generic evaluator composes a small set of Concepts, resolves a string value such as “three” when the realization needs a number, and returns an Answer Concept. The UI displays the parsed form, each Concept invocation and its inputs/outputs, the Answer Concept, and a natural-language rendering. This is an on-demand end-to-end proof with a durable trace and no external system actions.

The arithmetic example “What is 5 times three?” is a better first proof than adding the continuous Exist loop: it directly tests whether the AI thinks with Concepts, whether the parser preserves original wording, whether realizations compose, whether results are Concepts, and whether the trace is usable.

## Open design questions for the next phase

- Exact Concept definition/composition serialization, including source spans, prompt variables, corrections, misspellings, and fuzzy references.
- How to represent each Concept-owned realization and its context without a separate rules subsystem.
- How to make ConceptLookup discoverable through names, glosses, relations, and later optional embedding realizations.
- Which small and Teacher model variants run acceptably on the user's specific Mac.
- How to gather task-specific outcome evidence and later compare coexisting realizations.
- Which OS-level sandbox best fits shell/external-program Concepts after the framework is working.
- Exact global-memory persistence and trace retention controls.
- A subsystem-by-subsystem “Concept can own/change this behavior” audit table and its acceptance tests, to keep semantic policy out of host-side routing during implementation.

## Sources

- [MeTTa specification](https://trueagi-io.github.io/hyperon-experimental/metta/)
- [MeTTa evaluation tutorial](https://wiki.hyperon.dev/MeTTa_Programming_Language%2BMeTTa_Programming_Language_Primer%2BIntroduction_to_Evaluation)
- [Reflective Metagraph Rewriting paper](https://arxiv.org/abs/2112.08272)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama Qwen3 catalogue](https://ollama.com/library/qwen3)
- [Ollama Qwen3.5 catalogue](https://ollama.com/library/qwen3.5)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLite recursive CTEs](https://sqlite.org/lang_with.html)
- [Contextual bandit off-policy evaluation](https://proceedings.mlr.press/v70/wang17a.html)
- [Node.js Permission Model](https://nodejs.org/api/permissions.html)
- [Apple App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- [Docker Desktop for Mac permissions](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/)
- [Docker Desktop networking](https://docs.docker.com/desktop/features/networking/)
- [OpenTelemetry Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
