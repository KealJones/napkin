# First Runtime Progress

## Setup

- [x] Read the design and implementation milestone.
- [x] Check for repository instructions and existing implementation; none were present.
- [x] Confirm Node.js 24, pnpm 11, Ollama, and Rust are available.
- [x] Create the implementation tracking directory and initialize local Git metadata.
- [x] Write acceptance tests first and verify they fail before implementation.
- [x] Implement the integrated Concept runtime, SQLite store, seed Concepts, and CLI.
- [x] Run the complete first-milestone test suite and direct arithmetic demo.
- [ ] Run final typecheck, format checks, dependency check, and demo from a clean database.

## Decisions

- Keep the TypeScript host to the generic code ABI, Concept store, structural match/substitution operations, budgets, and trace sink. The evaluation loop executes from the stored RuntimeEntry Concept.
- Represent the prompt and configured runtime entry as ordinary Concepts. Runtime-entry selection is configurable without a concept-name dispatch table.
- Keep the initial demo independent of Ollama availability; local-language conversion follows after the structural runtime works.
- Use direct JavaScript expression or function source as a generic code realization body. Only trusted local source may run until OS isolation is implemented.

## Test-driven log

- **RED:** The first test run failed because all runtime modules were absent, as expected.
- **GREEN:** Added eleven acceptance tests; current results are 11 passing, 0 failing.
- **Integration:** The direct expression demo returns Answer(15), with PromptInput, RuntimeEntry, arithmetic calls, selected realizations, arguments, outputs, parent links, and timing in SQLite trace data.
- **Architecture correction:** The evaluator's recursive call/match/realization loop now lives in the RuntimeEntry Concept source persisted by the seed; the TypeScript evaluator only loads and runs that Concept through the generic ABI.
