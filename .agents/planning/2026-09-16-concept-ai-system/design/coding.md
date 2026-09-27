# Napkin working on code

Status: 2026-09-27. What is built (`packs/coding.ncon`, `sources/coding`) and where the existing
mechanisms (Judge, Predict, Pursue, Plan) take it next. See `ir-guide.md` 8.5 and 8.6 for how it
runs.

## What it does now

A message can show code (backticks, a ``` block, a file attached in the studio) or name a file
(`src/x.ts`, `~/y.py`). Hearing keeps each as one thing and joins what is said about it into one
request, and `CodeOf` finds the code whatever shape the words took. Then:

| Request | Concept | How it works |
|---|---|---|
| explain / what does this do | `Explain` | each code-IR construct has a wording under `Explaining()`; a file is said as what it is made of |
| what's wrong / check / review | `Check` | the same checks over the code IR for any program |
| fix | `Fix` | repairs what has a plain repair, writes the code back in its language |
| run ... with 21 | `Run` | writes JavaScript, runs it in an isolated `node:vm` context |
| convert to javascript | `Convert` | writes the code IR in another TargetLanguage |
| save it to x.js | `Save` | writes under the workspace only, `Effectful()` |

Everything is a Concept; host code only adds generic facilities (`readFile`, `writeFile`,
`readCode`, `writeCode`, `runCode`). Nothing names a particular program.

## Where the existing mechanisms take it

These are the next steps, in the order they pay off. Each reuses a mechanism already in the
graph rather than adding a code-only one.

1. **Predict writes a function from examples.** Predict already fills a hole in a sequence by
   trying the graph's own two-argument operations under `Hypothetical()`, simplest first, and
   gives the rule it found (`Predicted(32, Multiply(Previous(), 2))`). Asked "write f where
   f(1) is 2, f(2) is 4, f(3) is 6", the same search over `Op($x, constant)` finds
   `Multiply($x, 2)`, and the rule is the body of a `Func` written out as code. Programming by
   example with no model, and the rule is sourced: it is the one that fit every example.

2. **Judge picks between two ways to write it.** Judge sets two options side by side on what
   they share and differ on and says what each is better for ("if you want X, A; if Y, B").
   Given two versions of a function, the facets to compare are what `Check` finds, how many
   steps each takes when run (`Run` on the same inputs), and length: "if you want it shorter,
   A; if you want it to handle an empty list, B". It never stores a verdict.

3. **Plan says what a change is missing.** Plan already reports what a plan is missing. A
   request like "add a parameter for the tax rate and use it" is a plan over the code IR: the
   parameter is added to `Func`'s list, every `Call` of it needs an argument, every literal
   rate becomes the parameter. What Plan finds missing is the next edit, or the question to ask.

4. **Pursue finds the code that answers.** Pursue searches what the user said, then the world,
   past a residual. Code files read in a conversation can be kept as `Said` sources, so "where
   do we parse the config?" is answered by searching the code IR of the files seen for the
   `Call` or `Func` whose names match, and pointing at the file.

5. **Explaining learns wordings.** A construct with no wording is shown as the code it is. The
   wording for it is a realization under `Explaining()`, so it can be learned the way anything
   is: told once ("a Try is: try this, and if it fails do that"), saved, used from then on.

6. **Writing Python.** `Convert` and `Fix` write back in the code's own language when the
   language pack has `To` rules. Python has `From` rules only, so Python is written as
   JavaScript today and says so. Python `To` rules need the writer to lay out blocks by
   indentation rather than braces.

## Honest limits

- `readCode` still reads code in messages with the TypeScript compiler and tree-sitter; code
  hearing (8.3) reads by scope and keeps free names as `UnboundName`, and message code should move
  onto it so `Check` needs no scope pass of its own.
- `Check` knows the globals it is told (`GlobalName`); a name from an import the snippet does not
  show is reported as undefined, which is correct for the snippet and noisy for a fragment.
- `Run` only runs what JavaScript can express from the code IR, and only in the Node host.
