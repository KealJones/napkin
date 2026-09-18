# First Runtime Implementation Context

## Summary

Build the first runnable TypeScript slice from the approved Concept-first design. The workspace currently contains planning documents only, has no pre-existing application conventions, and has no local `AGENTS.md`, `CODEASSIST.md`, or README instructions. Node.js 24, pnpm 11, Ollama, and Rust are installed. The starting project directory was not a Git repository; a local repository has now been initialized.

## Requirements and acceptance criteria

- Store each Concept's identity, searchable gloss, Concept-valued relations, and every realization together as one self-contained unit.
- Use one composable expression algebra for applications, named/positional arguments, variables, and primitive payloads.
- Persist the canonical Concept units and execution trace in local SQLite.
- Evaluate direct Concept expressions through Concept-owned realizations without a Concept-name dispatch table or external semantic rule/native registry.
- Keep the realization's executable source in its owning Concept; a generic code ABI may execute it.
- Demonstrate `Question(Multiply(Number(5), Number(String("three"))))` -> `Answer(15)` while retaining the word `"three"` in the input trace.
- Prove editing a realization in the store changes behavior without changing host source.
- Trace each invocation with parent/caller, context, input arguments, selected realization, result, and outcome.
- Provide a CLI demo and tests for persistence, composition, mutation, alternate Concepts, and tracing.
- No placeholders, disconnected modules, concept-name switches, or fake success paths.

## Implementation map

- `src/concept/expression.ts`: expression algebra, parser, stable renderer.
- `src/concept/unit.ts`: self-contained Concept unit serialization and validation.
- `src/store/sqlite-store.ts`: SQLite canonical Concept/trace storage.
- `src/runtime/evaluator.ts`: structural evaluator, contextual realization matching, trace capture, generic code ABI.
- `src/bootstrap/seed.ts`: inspectable seed Concepts whose relations/realizations are ordinary stored Concept expressions.
- `src/bootstrap/runtime-entry-source.ts`: seed source for the evaluator loop; the installed RuntimeEntry Concept owns the executable copy.
- `src/cli.ts`: minimal CLI bootstrap, expression entry, result/trace output.
- `src/*.test.ts`: acceptance tests for the integrated runtime.

## Dependency map

CLI -> seed/open SQLite store -> generic evaluator -> Concept-owned realization expressions/code ABI -> SQLite trace -> CLI renderer. The host may parse/serialize expressions, perform generic structural matching, enforce budgets, run generic realization source, persist units, and emit trace. Meaning-specific behavior belongs in stored Concept units.

## Existing documentation

- `.agents/planning/2026-09-16-concept-ai-system/design/detailed-design.md` is the design authority.
- `.agents/planning/2026-09-16-concept-ai-system/implementation/plan.md` defines the milestone sequence and first-step acceptance.
- `.agents/planning/2026-09-16-concept-ai-system/research/prior-versions-audit.md` captures prior failure modes, especially hidden dispatch/registries and semantic behavior outside Concepts.

## Decisions and open points

- Use the built-in `node:sqlite` available in the installed Node 24 runtime to avoid a native package dependency in the initial store. The project's engine requirement will state Node >= 22.13.
- Use TypeScript plus Node's built-in test runner; only TypeScript and Node type declarations are needed for development.
- The universal realization envelope and generic source ABI are bootstrap machinery. The envelope must not define a closed list of realization kinds; bodies can be compositions or code expressions. The evaluator loop itself now runs from the configured runtime-entry Concept.
- The JavaScript VM used by the generic code ABI is not a security boundary. Only trusted local realization source is suitable until OS isolation is implemented. This first slice does not claim ordinary-language parsing, UI, long-term conversation memory, sandboxing, or autonomous `Exist`; those remain later integrated milestones in the approved plan.
