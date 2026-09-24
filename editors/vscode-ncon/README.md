# N-Con for VS Code

Highlighting for `.ncon`, Napkin Concept Object Notation, in one of two styles
(`ncon.style`):

- `rainbow` (default): heads and their parentheses colored by nesting depth.
- `syntax`: heads colored by what they are, the way TypeScript reads in Monokai. Ordinary
  calls are green like function calls, control flow (`If`, `Return`, `Sequence`...) is pink
  like `return`, binders and declarations (`Bind`, `Lambda`, `Realization`) and kinds (a
  nullary Concept like `Execution()`) are cyan italic like `const` and types, and constants
  (`True()`, `Undefined()`) are purple. VS Code's rainbow brackets do the grouping, so turn on
  `"[ncon]": { "editor.bracketPairColorization.enabled": true }`.
  `node preview.js --style syntax <file.ncon>` shows it.

A copy of the rainbow version as first built is kept in `snapshots/rainbow/`.

- **Rainbow nesting.** Every head and the parentheses around its arguments take the color of
  their depth, in Monokai, cycling after seven levels, and never yellow or orange, which are
  strings and variables. Pack forms at the top level
  (`Concept`, `From`, `Compiled`, `Prelude`, `Requires`, `Language`) are cyan italic, the
  way Monokai draws `function`. An unbalanced parenthesis is flagged in pink.
- **Monokai tokens whatever the theme.** Strings are yellow, `$variables` orange italic,
  `name=` white italic, numbers and `true`/`false`/`null` purple. Comments are left to your theme, so they match
  every other language.
- **Locals in white.** A variable a `Bind` names (`Bind($x, value, body)`, or `Bind($x, value)`
  as a step of a Sequence) is white italic where it is bound and wherever it is in scope.
  Turn this off with `ncon.palette.enabled` to leave those to your theme.
- **Ghost operators.** The operator a Concept is, drawn faintly after each comma between its
  arguments: `And($a, && $b)`, `Add($x, + 1)`, `Equals($k, == "x")`, and before the argument of
  a unary one: `Negate(-$x)`, `Not(!$ok)`. Display only; nothing is written to the file.
  `ncon.ghostOperators` turns them off.
- **Parameter names.** A positional argument that starts its own line gets its parameter name
  faintly at the end of that line (`= condition`), in a much darker shade of the comment color,
  taken from the callee's realization pattern: `If($condition, $then, $otherwise)` labels its
  three lines `= condition`, `= then`, `= otherwise`. `ncon.parameterNames` turns them off.
- **Hover.** Hovering a Concept shows what it is: the comment above its `Concept(...)` in the
  packs that define it, its relations, its realizations' patterns and contexts, and what the
  saved graph (its journal `~/.napkin/store.ncon`, or `ncon.graph`) has learned about it since, so a
  Concept only the graph knows (a Wikidata tie, say) is described too. Hovering a variable
  shows the value its local was bound to (`Bind($v, value, ...)`), or the pattern or Lambda
  that binds it.
- **Autocomplete.** Every Concept the packs define, and those only the graph knows, with its
  pattern as the detail and its description alongside. Picking one writes the call with its
  parameter names as tab stops: `If(condition, then, otherwise)`. Typing `$` offers the
  variables in scope: locals (with the value they were bound to), pattern variables and
  Lambda parameters.
- **Signature help.** Typing `(` or `,` shows the Concept's patterns, with the argument being
  written in bold (a named argument by its name, wherever it is written).
- **Pack forms.** `Concept`, `Realization`, `Relation`, `Requires`, `Language`, `Compiled`,
  `Prelude`, `From` and `To` are the format's own forms, not Concepts, so hover, signature
  help and completion describe them from the format itself: what each is for, and inside
  `Realization(` the named arguments `context`, `body`, `properties`, `evaluateArguments`,
  `evaluateResult` and `resultContext`.
- **Go to Definition.** Cmd+Click (or F12) a Concept to go to its `Concept(Name(), ...)` in
  the pack that defines it, with a picker when several packs do. Cmd+Click a variable to go
  to the `Bind` that names it, or its place in the pattern or the Lambda's parameters.
- **Embedded JavaScript.** The source in `Code(source="""...""")` and `Prelude("""...""")` is
  highlighted as JavaScript.
- `//` comments toggle with the usual shortcut, parentheses auto-close, and sections fold
  at the `// ====` banners.

## Formatting

Format Document (Shift+Option+F) formats a pack, and so does `node format.js --write file.ncon`
(`--check` exits 1 when a file would change, for CI). The rules:

- `name = value`, a space either side of `=`.
- A call stays on one line when it fits in 120 columns and every call inside it has at most
  two arguments, or is short (60 columns or less).
- Otherwise every argument gets its own line, two spaces in, and the closing parenthesis gets
  its own line under the start of the call. `Concept`, `Realization`, `Lambda` and `Bind` keep
  their first argument (the name, the pattern, the parameters, the local) on the line they
  start: `Bind($found,`.
- Comments stay where they were; raw strings are kept exactly; blank lines between forms are
  kept, one at most.

`node format.test.js` checks that every built-in pack formats to the same expressions,
stably, with every comment kept.

## Install

Symlink this folder into your extensions directory and reload VS Code:

```bash
ln -s "$PWD" ~/.vscode/extensions/napkin.vscode-ncon-0.1.0
```

## Preview without installing

```bash
node preview.js ../../packages/concept-runtime/packs/members.ncon > /tmp/ncon.html && open /tmp/ncon.html
```

`preview.js` uses the same scanner and colors as the extension. Add `:from-to` after a
file to show only those lines.

## VS Code's own bracket colors

VS Code colors brackets itself, from your theme. This extension turns that off for `.ncon`
by default so the Monokai rainbow isn't painted twice. To use VS Code's instead, so parens
look the way they do in your other languages:

```json
"ncon.rainbow.source": "vscode",
"[ncon]": { "editor.bracketPairColorization.enabled": true }
```

Only the parentheses change: heads keep the Monokai rainbow.

## Settings

| Setting | Default | |
|---|---|---|
| `ncon.rainbow.enabled` | `true` | color heads and parentheses by depth |
| `ncon.rainbow.boldHeads` | `false` | draw heads (and forms) in bold |
| `ncon.rainbow.colors` | Monokai, 7 colors | one per depth, cycling |
| `ncon.palette.enabled` | `true` | Monokai for every other token |
| `ncon.rainbow.source` | `ncon` | `vscode` leaves the parentheses to VS Code's bracket pair colors |
| `ncon.locals.binders` | `Bind`, `Let`, `Inline`, `Var` | heads whose first argument names a local |

`scan.js` is the one scanner behind all of it. `node scan.test.js` checks it against every
built-in pack.
