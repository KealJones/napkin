# Appendix: a full page of code, conceptualized

Complete translation of `packages/concept-runtime/src/bootstrap/runtime-entry-source-example.js`
(234 lines of JavaScript) into the IR defined in `ir-spec.md`.

Purpose: prove the claim in Part 1 that one IR serves both producers. Nothing here is
simplified, summarised, or elided. Every early return, every mutation, every `await`, and
the order of every statement survives.

The producer here is a mechanical translator, so the shallowness rules in Part 9 do not
apply: depth is whatever the source requires, and it reaches 12 levels in places.

JavaScript is shown above each fragment so the correspondence can be checked directly.

Every IR block below is machine-validated against the grammar in Part 3 by
`../research/ir-parser-experiments/scripts/check-appendix.mjs`, using the reference parser
rather than the project's own. Root node and nesting depth per fragment:

| fragment | root | depth |
|---|---|---|
| `expression` | `Func` | 11 |
| `raise` | `Func` | 4 |
| `isApplication` | `Func` | 6 |
| `field` | `Func` | 7 |
| `argumentsInPatternOrder` | `Func` | 14 |
| `specificity` | `Func` | 9 |
| `select` | `Func` | 10 |
| `evaluate` | `Async` | 19 |

The module wrapper is the one block not checked, because it contains a prose placeholder
for the seven function declarations rather than repeating them.

## Vocabulary used beyond Part 10.2

| Node | Meaning |
|---|---|
| `Var($x, v)` | mutable declaration (`let`), as opposed to `Let` for `const` |
| `Index(obj, i)` | computed member access, `obj[i]` |
| `Pair(k, v)` | an `Object(...)` entry whose key is computed or not identifier-shaped; a known identifier key uses a named argument instead (`ir-spec.md` Part 3.3) |
| `Add`, `Sub` | JavaScript `+` and `-`, including string concatenation for `+` |
| `Or`, `NotEquals` | `||` and `!==` |
| `Async(f)` | marks a function async; wraps the `Func` or `Lambda`, not its parameter list |

`If` appears in both statement and expression position; the IR does not need a separate
ternary node.

Object literals below are written with `Pair` throughout, because these fragments were
translated before the named-argument form in `ir-spec.md` Part 3.3 was settled. Every key
here is a known identifier, so `Object(apply=Object(head=$head, args=...))` is the preferred
spelling and reads closer to the source; the `Pair` form remains correct and is retained so
the validated blocks are not invalidated by a cosmetic rewrite.

---

## Module and outer function

```js
import { whatever } from 'some-fake-package';

export const runtimeEntrySource = async (args, api) => {
  const input = args[0];
  const useContext = args[1];
  let steps = 0;
  ...
  return evaluate(input, api.entryConcept, api.rootEventId, 0, useContext);
};
```

```
Module(Sequence(
  Import(List($whatever), "some-fake-package"),
  Export(Let($runtimeEntrySource, Async(Lambda(List($args, $api), Sequence(
    Let($input, Index($args, 0)),
    Let($useContext, Index($args, 1)),
    Var($steps, 0),

    <the seven function declarations below, in source order>

    Return(Call($evaluate,
      $input,
      Member($api, "entryConcept"),
      Member($api, "rootEventId"),
      0,
      $useContext)))))))))
```

---

## expression(head, fields)

```js
function expression(head, fields) {
  return {
    apply: {
      head,
      args: Object.keys(fields).map((name) => ({ name, value: fields[name] }))
    }
  };
}
```

```
Func($expression, List($head, $fields),
  Return(Object(
    Pair("apply", Object(
      Pair("head", $head),
      Pair("args",
        Call(Member(Call(Member($Object, "keys"), $fields), "map"),
          Lambda(List($name),
            Object(
              Pair("name", $name),
              Pair("value", Index($fields, $name)))))))))))
```

The `{ head }` shorthand expands to an explicit `Pair("head", $head)`. Shorthand is surface
sugar in JavaScript and carries no meaning the IR needs to keep.

---

## raise(head, fields, message)

```js
function raise(head, fields, message) {
  const error = new Error(message);
  whatever();
  error.value = expression(head, fields);
  throw error;
}
```

```
Func($raise, List($head, $fields, $message),
  Sequence(
    Let($error, New($Error, $message)),
    Call($whatever),
    Assign(Member($error, "value"), Call($expression, $head, $fields)),
    Throw($error)))
```

`Assign(Member(...), ...)` is the property mutation. Representable, and per Part 10.5 not
yet Concept-evaluable.

---

## isApplication(value)

```js
function isApplication(value) {
  return typeof value === "object" && value !== null && "apply" in value;
}
```

```
Func($isApplication, List($value),
  Return(And(
    And(Equals(TypeOf($value), "object"),
        NotEquals($value, null)),
    In("apply", $value))))
```

`&&` is left-associative, so the nesting of `And` mirrors the source grouping rather than
flattening to a variadic `And`.

---

## field(value, name)

```js
function field(value, name) {
  if (!isApplication(value)) return undefined;
  const argument = value.apply.args.find((item) => item.name === name);
  return argument && argument.value;
}
```

```
Func($field, List($value, $name),
  Sequence(
    If(Not(Call($isApplication, $value)), Return(Undefined())),
    Let($argument,
      Call(Member(Member(Member($value, "apply"), "args"), "find"),
        Lambda(List($item), Equals(Member($item, "name"), $name)))),
    Return(And($argument, Member($argument, "value")))))
```

---

## argumentsInPatternOrder(pattern, actual)

```js
function argumentsInPatternOrder(pattern, actual) {
  if (!actual.every((argument) => argument.name !== undefined)) return actual;
  return pattern.apply.args.map((expected) => {
    const formalName = expected.name || (
      expected.value && typeof expected.value === "object" && "variable" in expected.value
        ? expected.value.variable
        : undefined
    );
    return actual.find((argument) => argument.name === formalName);
  });
}
```

```
Func($argumentsInPatternOrder, List($pattern, $actual),
  Sequence(
    If(Not(Call(Member($actual, "every"),
            Lambda(List($argument),
              NotEquals(Member($argument, "name"), Undefined())))),
      Return($actual)),
    Return(Call(Member(Member(Member($pattern, "apply"), "args"), "map"),
      Lambda(List($expected), Sequence(
        Let($formalName,
          Or(Member($expected, "name"),
             If(And(And(Member($expected, "value"),
                        Equals(TypeOf(Member($expected, "value")), "object")),
                    In("variable", Member($expected, "value"))),
                Member(Member($expected, "value"), "variable"),
                Undefined()))),
        Return(Call(Member($actual, "find"),
          Lambda(List($argument),
            Equals(Member($argument, "name"), $formalName))))))))))
```

The ternary inside the `||` becomes an `If` in expression position. Same node as the
statement `If` above it.

---

## specificity(value)

```js
function specificity(value) {
  if (typeof value !== "object" || value === null) return 1;
  if ("variable" in value) return 0;
  return 1 + value.apply.args.reduce(
    (sum, argument) => sum + specificity(argument.value),
    0
  );
}
```

```
Func($specificity, List($value),
  Sequence(
    If(Or(NotEquals(TypeOf($value), "object"), Equals($value, null)), Return(1)),
    If(In("variable", $value), Return(0)),
    Return(Add(1,
      Call(Member(Member(Member($value, "apply"), "args"), "reduce"),
        Lambda(List($sum, $argument),
          Add($sum, Call($specificity, Member($argument, "value")))),
        0)))))
```

Recursion is an ordinary `Call` to the enclosing binding. Nothing special is needed for it.

---

## select(unit, call, useContext)

```js
function select(unit, call, useContext) {
  const candidates = [];
  for (const candidate of unit.realizations) {
    if (!isApplication(candidate) || candidate.apply.head !== "Realization") {
      raise("InvalidRealization", {
        concept: unit.identity, realization: candidate
      }, "A realization must use the generic Realization expression");
    }

    const pattern = field(candidate, "pattern");
    const body = field(candidate, "body");
    const contextPattern = field(candidate, "context");
    const evaluateArguments = field(candidate, "evaluateArguments");
    const evaluateResult = field(candidate, "evaluateResult");
    const resultContext = field(candidate, "resultContext");
    if (pattern === undefined || body === undefined) {
      raise("InvalidRealization", {
        concept: unit.identity, realization: candidate
      }, "A realization requires pattern and body expressions");
    }
    if (evaluateArguments !== undefined && typeof evaluateArguments !== "boolean") {
      raise("InvalidRealization", {
        concept: unit.identity, field: "evaluateArguments"
      }, "evaluateArguments must be a boolean");
    }
    if (evaluateResult !== undefined && typeof evaluateResult !== "boolean") {
      raise("InvalidRealization", {
        concept: unit.identity, field: "evaluateResult"
      }, "evaluateResult must be a boolean");
    }

    const bindings = {};
    if (!api.match(pattern, call, bindings)) continue;
    if (contextPattern !== undefined && !api.match(contextPattern, useContext, bindings)) {
      continue;
    }
    candidates.push({
      expression: candidate, pattern, body, contextPattern, resultContext, bindings,
      evaluateArguments: evaluateArguments !== false,
      evaluateResult: evaluateResult === true,
      specificity: contextPattern === undefined ? 0 : specificity(contextPattern)
    });
  }
  candidates.sort((left, right) => right.specificity - left.specificity);
  return candidates[0];
}
```

```
Func($select, List($unit, $call, $useContext),
  Sequence(
    Let($candidates, List()),

    ForOf($candidate, Member($unit, "realizations"), Sequence(

      If(Or(Not(Call($isApplication, $candidate)),
            NotEquals(Member(Member($candidate, "apply"), "head"), "Realization")),
        Call($raise, "InvalidRealization",
          Object(Pair("concept", Member($unit, "identity")),
                 Pair("realization", $candidate)),
          "A realization must use the generic Realization expression")),

      Let($pattern,           Call($field, $candidate, "pattern")),
      Let($body,              Call($field, $candidate, "body")),
      Let($contextPattern,    Call($field, $candidate, "context")),
      Let($evaluateArguments, Call($field, $candidate, "evaluateArguments")),
      Let($evaluateResult,    Call($field, $candidate, "evaluateResult")),
      Let($resultContext,     Call($field, $candidate, "resultContext")),

      If(Or(Equals($pattern, Undefined()), Equals($body, Undefined())),
        Call($raise, "InvalidRealization",
          Object(Pair("concept", Member($unit, "identity")),
                 Pair("realization", $candidate)),
          "A realization requires pattern and body expressions")),

      If(And(NotEquals($evaluateArguments, Undefined()),
             NotEquals(TypeOf($evaluateArguments), "boolean")),
        Call($raise, "InvalidRealization",
          Object(Pair("concept", Member($unit, "identity")),
                 Pair("field", "evaluateArguments")),
          "evaluateArguments must be a boolean")),

      If(And(NotEquals($evaluateResult, Undefined()),
             NotEquals(TypeOf($evaluateResult), "boolean")),
        Call($raise, "InvalidRealization",
          Object(Pair("concept", Member($unit, "identity")),
                 Pair("field", "evaluateResult")),
          "evaluateResult must be a boolean")),

      Let($bindings, Object()),

      If(Not(Call(Member($api, "match"), $pattern, $call, $bindings)),
        Continue()),

      If(And(NotEquals($contextPattern, Undefined()),
             Not(Call(Member($api, "match"), $contextPattern, $useContext, $bindings))),
        Continue()),

      Call(Member($candidates, "push"),
        Object(
          Pair("expression", $candidate),
          Pair("pattern", $pattern),
          Pair("body", $body),
          Pair("contextPattern", $contextPattern),
          Pair("resultContext", $resultContext),
          Pair("bindings", $bindings),
          Pair("evaluateArguments", NotEquals($evaluateArguments, false)),
          Pair("evaluateResult", Equals($evaluateResult, true)),
          Pair("specificity",
            If(Equals($contextPattern, Undefined()),
               0,
               Call($specificity, $contextPattern))))))),

    Call(Member($candidates, "sort"),
      Lambda(List($left, $right),
        Sub(Member($right, "specificity"), Member($left, "specificity")))),

    Return(Index($candidates, 0))))
```

Both `continue` statements keep their exact position, so the guard-then-skip control flow is
preserved rather than being rewritten as nested conditions.

---

## evaluate(value, caller, parentEventId, depth, activeContext)

The largest function: a `try`/`catch`, mutable locals, `await`, `Promise.all` over a mapped
async lambda, an `If` in expression position choosing between two awaited calls, and a
rethrow that carries a Concept expression on the error.

```js
async function evaluate(value, caller, parentEventId, depth, activeContext) {
  if (value === null || typeof value !== "object") return value;
  if ("variable" in value) {
    raise("UnboundVariable", { name: value.variable }, "Unbound variable");
  }

  const head = value.apply.head;
  const eventId = api.startEvent({
    concept: head, caller, parentEventId,
    useContext: activeContext, input: value,
    arguments: value.apply.args.map((argument) => argument.value)
  });
  ...
}
```

```
Async(Func($evaluate, List($value, $caller, $parentEventId, $depth, $activeContext),
  Sequence(
    If(Or(Equals($value, null), NotEquals(TypeOf($value), "object")),
      Return($value)),

    If(In("variable", $value),
      Call($raise, "UnboundVariable",
        Object(Pair("name", Member($value, "variable"))),
        "Unbound variable")),

    Let($head, Member(Member($value, "apply"), "head")),

    Let($eventId, Call(Member($api, "startEvent"),
      Object(
        Pair("concept", $head),
        Pair("caller", $caller),
        Pair("parentEventId", $parentEventId),
        Pair("useContext", $activeContext),
        Pair("input", $value),
        Pair("arguments",
          Call(Member(Member(Member($value, "apply"), "args"), "map"),
            Lambda(List($argument), Member($argument, "value"))))))),

    Try(
      Sequence(
        Assign($steps, Add($steps, 1)),

        If(GreaterThan($depth, Member($api, "maximumDepth")),
          Call($raise, "BudgetExceeded",
            Object(Pair("kind", "depth"), Pair("limit", Member($api, "maximumDepth"))),
            "Maximum evaluation depth exceeded")),

        If(GreaterThan($steps, Member($api, "maximumSteps")),
          Call($raise, "BudgetExceeded",
            Object(Pair("kind", "steps"), Pair("limit", Member($api, "maximumSteps"))),
            "Maximum evaluation steps exceeded")),

        Let($unit, Call(Member($api, "getConcept"), $head)),
        If(Not($unit),
          Call($raise, "UnknownConcept",
            Object(Pair("identity", $head)),
            Add("No Concept unit exists for ", $head))),

        Let($selected, Call($select, $unit, $value, $activeContext)),
        If(Not($selected),
          Sequence(
            Call(Member($api, "finishEvent"), $eventId,
              Object(Pair("output", $value), Pair("outcome", "residual"))),
            Return($value))),

        Call(Member($api, "updateEvent"), $eventId,
          Object(Pair("selectedRealization", Member($selected, "expression")))),

        Var($bindings, Member($selected, "bindings")),
        Var($bodyArguments, Member(Member($value, "apply"), "args")),

        If(Member($selected, "evaluateArguments"), Sequence(
          Assign($bodyArguments,
            Await(Call(Member($Promise, "all"),
              Call(Member(Member(Member($value, "apply"), "args"), "map"),
                Async(Lambda(List($argument), Sequence(
                  Let($evaluated,
                    Await(Call($evaluate,
                      Member($argument, "value"),
                      $head, $eventId, Add($depth, 1), $activeContext))),
                  Return(If(Equals(Member($argument, "name"), Undefined()),
                    Object(Pair("value", $evaluated)),
                    Object(Pair("name", Member($argument, "name")),
                           Pair("value", $evaluated))))))))))),

          Let($evaluatedCall,
            Object(Pair("apply", Object(Pair("head", $head),
                                        Pair("args", $bodyArguments))))),

          Call(Member($api, "updateEvent"), $eventId,
            Object(Pair("evaluatedArguments",
              Call(Member($bodyArguments, "map"),
                Lambda(List($argument), Member($argument, "value")))))),

          Assign($bindings, Object()),

          If(Not(Call(Member($api, "match"),
                   Member($selected, "pattern"), $evaluatedCall, $bindings)),
            Call($raise, "NoApplicableRealization",
              Object(Pair("concept", $head), Pair("afterArgumentEvaluation", true)),
              "The selected pattern no longer matches after argument evaluation")),

          If(And(NotEquals(Member($selected, "contextPattern"), Undefined()),
                 Not(Call(Member($api, "match"),
                       Member($selected, "contextPattern"), $activeContext, $bindings))),
            Call($raise, "NoApplicableRealization",
              Object(Pair("concept", $head), Pair("context", $activeContext)),
              "The selected context pattern no longer matches after argument evaluation")))),

        Let($body, Call(Member($api, "substitute"), Member($selected, "body"), $bindings)),

        Let($resultContext,
          If(Equals(Member($selected, "resultContext"), Undefined()),
             $activeContext,
             Call(Member($api, "substitute"),
                  Member($selected, "resultContext"), $bindings))),

        Var($result,
          If(And(Call($isApplication, $body),
                 Equals(Member(Member($body, "apply"), "head"), "Code")),
            Await(Call(Member($api, "runCode"),
              $body,
              Call($argumentsInPatternOrder, Member($selected, "pattern"), $bodyArguments),
              $activeContext,
              $eventId,
              Async(Lambda(List($expression, $context),
                Call($evaluate, $expression, $head, $eventId, Add($depth, 1),
                  If(Equals($context, Undefined()), $activeContext, $context)))))),
            Await(Call($evaluate, $body, $head, $eventId, Add($depth, 1), $resultContext)))),

        If(Member($selected, "evaluateResult"),
          Assign($result,
            Await(Call($evaluate, $result, $head, $eventId,
                       Add($depth, 1), $resultContext)))),

        Call(Member($api, "finishEvent"), $eventId,
          Object(Pair("output", $result), Pair("outcome", "success"))),
        Return($result)),

      Catch($caught, Sequence(
        Let($message,
          If(InstanceOf($caught, $Error),
             Member($caught, "message"),
             Call($String, $caught))),
        Let($failure,
          If(And($caught, Member($caught, "value")),
             Member($caught, "value"),
             Call($expression, "ExecutionFailed",
               Object(Pair("concept", $head), Pair("message", $message))))),
        Call(Member($api, "finishEvent"), $eventId,
          Object(Pair("output", $failure),
                 Pair("outcome", "failure"),
                 Pair("error", $message))),
        Let($propagated, New($Error, $message)),
        Assign(Member($propagated, "value"), $failure),
        Throw($propagated)))))))
```

One further node appears here: `InstanceOf(x, C)` for `caught instanceof Error`.

---

## What survived

- **Statement order**, everywhere, including all six guard clauses that `return` or `raise`
  early.
- **Both `continue` statements** in `select`, in position.
- **Mutation**: `steps += 1`, the three reassigned locals in `evaluate`, and the two
  `error.value = ...` property writes.
- **Async structure**: which calls are awaited, the `Promise.all` over a mapped async
  lambda, and the async callback passed into `runCode`.
- **Expression-position conditionals**: five ternaries, as `If`.
- **The `try`/`catch` boundary** and the rethrow that carries a Concept expression on the
  error object.
- **Operator grouping**: `&&` and `||` nest as written rather than flattening.
- **String concatenation** as `Add`, matching JavaScript's overloaded `+`.

## What was dropped, and why

Only surface sugar that carries no meaning:

- `{ head }` shorthand became `Pair("head", $head)`.
- `function f() {}` and `const f = () => {}` both became `Func` / `Lambda`; JavaScript's
  distinction is hoisting and `this` binding, neither of which the IR models.
- Statement versus expression `if` collapsed into one `If`.

Nothing else. No comment in the source, no blank line, and no formatting choice affects
meaning, so none is represented.

## Mutation in cell form

Part 10.5 holds state in cells addressed by opaque id, so single assignment is preserved:
a variable is bound once, to a `CellRef`, and the cell's contents change. Reads are
explicit `Get`, inserted mechanically by the translator.

The counter, which is captured by `evaluate` and mutated across recursive calls — the case
that rules out desugaring to single assignment:

```js
let steps = 0;
...
steps += 1;
```

```
Let($steps, Cell(0))
```

```
Set($steps, Add(Get($steps), 1))
```

The two budget guards then read through the cell:

```
If(GreaterThan(Get($steps), Member($api, "maximumSteps")),
  Call($raise, "BudgetExceeded",
    Object(Pair("kind", "steps"), Pair("limit", Member($api, "maximumSteps"))),
    "Maximum evaluation steps exceeded"))
```

In-place collection methods become a pure read-modify-write against the cell:

```js
const candidates = [];
candidates.push({ ... });
candidates.sort((left, right) => right.specificity - left.specificity);
```

```
Let($candidates, Cell(List()))
```

```
Set($candidates, Append(Get($candidates), $candidateRecord))
```

(`$candidateRecord` stands for the nine-`Pair` `Object` written out in full in the `select`
fragment above; it is abbreviated here only to keep the contrast with `push` readable.)

```
Set($candidates, SortBy(Get($candidates),
  Lambda(List($left, $right),
    Sub(Member($right, "specificity"), Member($left, "specificity")))))
```

And a reassigned local in `evaluate`:

```js
let result = ...;
if (selected.evaluateResult) { result = await evaluate(result, ...); }
```

```
Let($result, Cell($computedBody))
```

(`$computedBody` stands for the `If` choosing between `runCode` and a recursive `evaluate`,
written out in full in the `evaluate` fragment above.)

```
If(Member($selected, "evaluateResult"),
  Set($result, Await(Call($evaluate, Get($result), $head, $eventId,
                          Add($depth, 1), $resultContext))))
```

The fragments in the sections above use `Var` and `Assign`, which are the surface nodes.
Their realizations compose to `Cell`, `Get`, and `Set`, so the IR keeps the shape the
source had while still being evaluable.

## Honest limits

- **Most mutation on this page is evaluable via cells** (Part 10.5). What is not is
  mutation of a **host object the program did not allocate**: the two
  `Assign(Member($error, "value"), ...)` writes in `raise` and in `evaluate`'s catch block.
  Those stay inside code realizations. Everything else — the `steps` counter shared across
  recursive calls, the three reassigned locals in `evaluate`, and the in-place
  `candidates.push` and `candidates.sort` — has a cell form, shown in the next section.
- **`$Object`, `$Promise`, `$Error`, `$String` are free variables** standing for host
  globals. Properly they should be Concepts with realizations per target language, which is
  a modelling decision this appendix does not settle.
- **`InstanceOf`** was added here, not in Part 10.2. The code vocabulary is not closed, and
  translating a second real file should be expected to add a handful more nodes.
