# N-Con for VS Code

Highlighting for `.ncon`, Napkin Concept Object Notation.

- **Rainbow nesting.** Every head and the parentheses around its arguments take the color of
  their depth, in Monokai, cycling after seven levels, and never yellow or orange, which are
  strings and variables. Pack forms at the top level
  (`Concept`, `From`, `Compiled`, `Prelude`, `Requires`, `Language`) are cyan italic, the
  way Monokai draws `function`. An unbalanced parenthesis is flagged in pink.
- **Monokai tokens whatever the theme.** Strings are yellow, `$variables` orange italic,
  `name=` white italic, numbers and `true`/`false`/`null` purple, and comments grey italic.
- **Locals in white.** A variable a `Bind` names (`Bind($x, value, body)`, or `Bind($x, value)`
  as a step of a Sequence) is white italic where it is bound and wherever it is in scope.
  Turn this off with `ncon.palette.enabled` to leave those to your theme.
- **Embedded JavaScript.** The source in `Code(source="""...""")` and `Prelude("""...""")` is
  highlighted as JavaScript.
- `//` comments toggle with the usual shortcut, parentheses auto-close, and sections fold
  at the `// ====` banners.

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
