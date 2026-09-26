# Types as Claims, written as TypeScript

## Context

Napkin can write IR as JavaScript (`writeJavaScript`, `packs/javascript.ncon` To rules) but not as TypeScript: `typescript.ncon` has only erasing From rules and `read.ts` skips the `type` field. Goal: write TypeScript with types.

The principle, from the user: a type does not change a Concept's structure. So no `Typed(...)` wrapper. A type is the value's **kind** (an ordinary Concept: `Number()`, `String()`, `List(T)`, `Function(List(Ts), R)`), carried as a **claim** (a named arg) on the binding site, and written in a `Type()` context. The positional structure is untouched.

Two sources of claims (decided):
- **Author claims**: TS annotations on import become `claim=` instead of being erased.
- **Inferred claims**: a `Claim` mechanism Concept infers kinds from the IR and fills in missing claims. Author claims win.

## Shape

```
Bind($n, $v, claim=K)                           const n: K = v
Var($n, $v, claim=K)                            let n: K = v
Lambda(List($a,$b), body, claims=List(A,B), claim=R)   (a: A, b: B): R => body
```

`claims=` is aligned by position with the params. `claim=` on a Lambda is its return. Writing `claims` needs params and kinds zipped. That calls for one generic writer capability, `Zip`, beside `Each` in `expandEach` (`src/code/rewrite.ts:190`).

## Steps

1. **Read claims** (`src/code/read.ts`, `packs/typescript.ncon`)
   - Remove `"type"` from `SKIP` (read.ts:28). Syntax patterns ignore fields they don't name (`rewrite.ts` matches), so the existing From rules are unaffected.
   - Add TS From rules for type syntax to kinds: `JsNumberKeyword` to `Number()`, `JsStringKeyword` to `String()`, `JsBooleanKeyword` to `Boolean()`, `JsArrayType` to `List(T)`, `JsFunctionType` to `Function(...)`, `JsTypeReference(name)` to `Name()` (a named kind), and `JsUnknownKeyword`/`JsAnyKeyword` to no claim.
   - Add more specific From rules for declarations/params/arrows with a `type=` field, producing `claim=`/`claims=`. A syntax-field variable matches an absent field as `Undefined()`, so these rules need a presence guard. Add `Present($t)` to `matches`, since changing absent-field semantics would break `let x;`.
2. **JS erases claims** (`packs/javascript.ncon`). Add rules like `To(Bind($n,$v,claim=$_), Statement(), Bind($n,$v))` (the instead form) for Bind, Var, Lambda and Func. Code bodies run by being written as JS (`writeProgram`, evaluator.ts:588), so claimed IR still runs.
   - Fix `compile.ts:65`: `Bind` with `args.length === 3` must mean a positional body, not `claim=`.
3. **Own language before ancestor** (`src/code/write.ts:70` `writingRules`). Sort by language distance first, then specificity, then rank, so a TypeScript rule for `Bind(..., claim=)` beats JavaScript's erasure.
4. **Type position** (`src/code/write.ts`)
   - New hole sigil `^x`: "the part, written as a type". Only rules whose context has the `Type()` facet apply there.
   - `ncon.ts` To parsing accepts `Type()` like `Statement()` (ncon.ts:180).
5. **TS To rules** (`packs/typescript.ncon`)
   - Kinds in `Type()`: `number`, `string`, `boolean`, `null`, `^t[]`, `(…) => ^r`, `{ k: ^v }`, and a named kind as its name.
   - Bind/Var/Lambda/Func with claims, using `^` holes and `Zip`.
   - `Unknown()` has no Type rule, so a claim of `Unknown()` is dropped (instead rule back to the unclaimed form). No `any`, no guessed type.
6. **`Claim` mechanism** (new `packs/claim.ncon`; body written as JS and converted with `importTypeScript`)
   - A single Effectful realization with `evaluateArguments=false`. It walks a program and returns it with missing claims filled. It is the same code for chess, jam or names: pure structure.
   - v1 inference: literals; `List`/`Object` of known kinds; `Equals`/`Not`/`And`/`Or`/`LessThan` give `Boolean()`; `Add` of numbers gives `Number()`, and with a string `String()`; `TypeOf`/`Template` give `String()`; variables via an environment; a Lambda's return from its `Return`s; a bound lambda's param kinds from its call sites when every call agrees.
   - Anything else stays residual, so no claim is written. TS contextual typing covers callbacks and locals, which is why inference only needs to reach **params**. Locals are claimed only if the author claimed them (no `const x: number = 1` noise).
   - The seed for realization bodies lives in the graph, not host code: in `code.ncon`, `Concept(Code(), Takes(List(List(Argument()), Bindings(), CodeApi())), Returns(Concept()))`. When `Claim` gets a `Code(ir=Lambda(...))` it reads that relation for the entry params. `Argument`, `Bindings` and `CodeApi` get Type rules naming the host types.
7. **Entry point** (`src/code/import.ts`)
   - `async writeTypeScript(expr, {store})`: run `new Runtime(store).evaluate(Claim(expr), ...)`, then `writeWith(writingRules(store, "TypeScript"), claimed)`.
   - The store is `languagePackStore()` plus `claim.ncon`.
   - Risk: the evaluator could re-realize a returned IR that holds `$vars`. Check this first. If it does, return the program quoted.
8. **Named kinds: interfaces and aliases stay** (`typescript.ncon`, `javascript.ncon`)
   - `interface Foo { a: number; b?: string[] }` becomes `Kind(Foo(), Shape(a = Number(), b = Optional(List(String()))))`.
   - `type Id = string | number` becomes `Kind(Id(), Either(String(), Number()))`. Unions come in because aliases are mostly unions. Generic args on references (`Array<T>`, `Promise<T>`) read as `List(T)` and `Promise(T)`, and a reference in general as `Name(args...)`.
   - TS To: `Kind(N, Shape(...))` writes as `interface N { ... }`, and any other `Kind` as `type N = ^k`. JS To erases `Kind(...)` (writes nothing).
   - A reference `Foo()` writes as `Foo` with no resolution. A named kind is an identity like any other Concept.
9. **Resolving named kinds (inference only)**
   - `Claim` looks up the shape of `Foo()`, in order: `Kind`s in the same module; `Kind`s already in the graph (a seeded module's Kinds become Concepts with provenance `from=<file>`); then the file an `import type`/`import` names. That file is found with `ts.resolveModuleName`, read with `importTypeScript`, and its `Kind`s are taken (cached per file).
   - An unresolved name is a residual. It still writes as its name, and inference just stops at it (no member kinds).
   - This lets the `Code()` signature seed (step 6) point at the runtime's real types by reading `src/concept/expression.ts` and friends, instead of hand-written Type rules for `Argument`/`CodeApi`.
10. Update the `typescript.ncon` header (types are claims now, not erased). Fix the stale "self-hosting.md Part 6" reference.

## Tests (`src/code/write.test.ts`, `import.test.ts`)

- Round trip TS to IR to TS keeps author annotations: `const x: number = 1`, `(a: string, b: number[]) => …`, `function f(x: Foo): boolean`.
- JS writing of claimed IR equals JS writing of the same IR unclaimed (erasure).
- A claimed Code body still runs: realize one through the evaluator.
- `Claim` infers params: the `core.ncon` Concept declaration body gets `(args: readonly Argument[], bindings: Bindings, api: CodeApi)`, and `get = (n: string) =>` from its call sites.
- An unknown kind writes no annotation.
- `interface`/`type` round trip. A cross-file `import type { Foo }` resolves for inference (`x.a` is `number`). A missing file leaves `Foo` written but unresolved.
- Every pack passes `formatNcon`.

## Verify end to end

- Rerun the scratchpad `realize.mjs` with `writeTypeScript` on the core.ncon declaration body, then `tsc --noEmit` the output against the runtime's types. It should type-check, or the report should say where it doesn't.
- Run `pnpm --filter @napkin/concept-runtime test`.
- Run `pnpm napkin --no-learn --fresh "what is 2 plus 3"` to confirm Code bodies still run.

## Out of scope (v1)

Narrowing (`TypeOf` guards), generic declarations (`interface Box<T>`, where type params are read and written but not inferred through), classes as kinds, and overloads. What isn't read stays erased, as today.
