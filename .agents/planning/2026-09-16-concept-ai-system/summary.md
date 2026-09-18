# Concept-Centered AI: Planning Summary

The design and implementation plan are complete. The central rule is that the Concept graph owns semantic behavior: Concept units contain their own relation and realization expressions, and the generic runtime must not grow a parallel planner, action registry, tool catalog, or per-Concept routing logic.

## Design decisions

- Concepts are the shared form for meaning, thought, action, prompt interpretation, and output. A Concept may have multiple context-sensitive realizations.
- Realizations, relationships, input interpretations, failures, and results are Concept expressions. Human-readable glosses are searchable text, not canonical meaning.
- A small generic TypeScript evaluator handles the structural Concept algebra, budgets, persistence, the generic host boundary, and trace events. It contains no task-specific Concept-name switches.
- Start on demand and prove a direct Concept-expression arithmetic request before adding local Ollama language conversion and response rendering.
- Keep persistent global memory as the default, with isolated conversations that do not retain their transcript while still allowing shared Concept learning.
- Select among realizations with context and task-specific evidence. Do not version whole Concepts or use a universal success score.
- Local web research and Teacher learning are Concept-driven. File/process actions and continuous `Exist` come after the core framework; host file access stays unavailable until the user explicitly enables it.
- The local web UI observes and edits the same Concept units and displays live/historical traces. The UI and trace store may remain outside the Concept graph.
- Port the runtime to Rust only after the TypeScript format and behavior have passed the acceptance suite.

## Artifacts

- [Original idea](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/rough-idea.md)
- [Requirements and decisions](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/idea-honing.md)
- [Research summary](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/research/summary.md)
- [Prior-version audit](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/research/prior-versions-audit.md)
- [Detailed design](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/design/detailed-design.md)
- [Implementation plan and progress checklist](/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/implementation/plan.md)

Topic-specific research notes cover Concept-first prior art, local models and lookup, macOS isolation and `Exist`, realization selection and tracing, and architecture alternatives.

## Next step

Begin **Step 1** in the implementation plan: build the self-contained Concept unit/store and generic evaluator, then prove the direct-expression arithmetic turn with a complete Concept-level trace. Do not start the local-language parser, web interface, autonomy loop, or sandbox before this first architecture test passes.

## Main implementation gate

Before accepting a milestone, verify that an ordinary Concept can be added or changed, persisted, inspected, composed, selected, and executed without adding a Concept-name branch or separate semantic registry to the host. Each step in the checklist must end with a wired demo and tests for that gate.
