# First Runtime Test Plan

## Acceptance scenarios

1. **Round-trip full Concept unit:** Save and reload identity, gloss, relation expressions, and multiple realization expressions from SQLite with structural equality.
2. **Expression grammar:** Parse/render direct primitives, nested applications, named and positional arguments, quoted strings with escapes, booleans, null, and variables; malformed syntax reports a useful position.
3. **Arithmetic end-to-end:** Evaluate `Question(Multiply(Number(5), Number(String("three"))))` to `Answer(15)` using only the stored concepts and retain the original `"three"` expression in the trace.
4. **Mutation:** Replace `Multiply`'s stored realization with one that adds; without changing/rebuilding runtime source, the same expression returns `Answer(8)`.
5. **New composition:** Add an unseen `Double` Concept that composes `Multiply(x, 2)` and invoke it without changing host code.
6. **Alternate Concept and context:** Add two realizations to an ordinary Concept, constrain them by context, and show that the matching context is selected without a host enum/name switch.
7. **Trace completeness:** Every nested Concept call has stable identity, parent event, caller, context, input/evaluated arguments, realization identity, output, outcome, and timing; stored trace can be queried after evaluation.
8. **Budget/error behavior:** Unknown Concepts, unmatched realizations, code errors, and recursion/depth exhaustion return explicit failures and persist failed-call trace events.
9. **Architecture check:** Runtime sources contain no dispatch cases on semantic Concept names and no registry mapping Concept names to functions.

## TDD execution

- Add the expression and persistence acceptance tests first and run them to verify expected failures.
- Implement expression algebra/parser/unit validation and SQLite store.
- Add evaluator and tracing tests, run red, then implement structural selection/composition and generic code realization execution.
- Add bootstrap Concepts and integrated CLI test, then run all checks and the demo.

## Commands

- `pnpm test`
- `pnpm typecheck`
- `pnpm format:check`
- `pnpm demo -- 'Question(Multiply(Number(5), Number(String("three"))))' --trace`

The local CLI uses SQLite's built-in driver and does not require Ollama for the direct-expression milestone.
