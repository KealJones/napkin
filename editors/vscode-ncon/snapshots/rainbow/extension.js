// @ts-check
/**
 * Rainbow nesting for .ncon: every head and the parentheses around its arguments take the
 * color of their depth, so `Concept(Members(), Realization(... Let(... Filter(...))))` reads
 * level by level, and every other token is painted in Monokai whatever the theme. JavaScript
 * inside Code(source="""...""") bodies keeps the grammar's JavaScript highlighting.
 */
const vscode = require("vscode");
const { scan, RAINBOW, PALETTE } = require("./scan.js");

/** @type {vscode.TextEditorDecorationType[]} */
let heads = [];
/** @type {vscode.TextEditorDecorationType[]} */
let forms = [];
/** @type {vscode.TextEditorDecorationType[]} */
let parens = [];
/** @type {vscode.TextEditorDecorationType | undefined} */
let formParens;
/** @type {Map<string, vscode.TextEditorDecorationType>} */
let tokens = new Map();
/** @type {vscode.TextEditorDecorationType | undefined} */
let broken;

const config = () => vscode.workspace.getConfiguration("ncon");

function all() {
  return [...heads, ...forms, ...parens, ...(formParens ? [formParens] : []), ...tokens.values(), ...(broken ? [broken] : [])];
}

function build() {
  for (const d of all()) d.dispose();
  const configured = config().get("rainbow.colors");
  const colors = Array.isArray(configured) && configured.length ? configured.map(String) : RAINBOW;
  const bold = config().get("rainbow.boldHeads", false) ? "bold" : undefined;
  heads = colors.map((color) => vscode.window.createTextEditorDecorationType({ color, fontWeight: bold }));
  // A top-level form reads like Monokai's `function` keyword: cyan italic, at any depth color.
  forms = colors.map(() => vscode.window.createTextEditorDecorationType(PALETTE.form));
  parens = colors.map((color) => vscode.window.createTextEditorDecorationType({ color }));
  // A form's parentheses take its color, upright.
  formParens = vscode.window.createTextEditorDecorationType({ color: PALETTE.form.color });
  tokens = new Map(
    config().get("palette.enabled", true)
      ? Object.entries(PALETTE).map(([kind, style]) => [kind, vscode.window.createTextEditorDecorationType(style)])
      : [],
  );
  broken = vscode.window.createTextEditorDecorationType({
    color: "#FFFFFF",
    backgroundColor: "#F9267255",
    overviewRulerColor: "#F92672",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
}

/** @param {vscode.TextEditor} editor */
function paint(editor) {
  if (editor.document.languageId !== "ncon") return;
  const doc = editor.document;
  const enabled = config().get("rainbow.enabled", true);
  const native = config().get("rainbow.source", "ncon") === "vscode";
  const binders = config().get("locals.binders");
  const { marks, unbalanced } = scan(doc.getText(), Array.isArray(binders) ? { binders: binders.map(String) } : {});
  /** @type {Map<vscode.TextEditorDecorationType, vscode.Range[]>} */
  const ranges = new Map(all().map((d) => [d, []]));
  const at = (/** @type {number} */ s, /** @type {number} */ e) => new vscode.Range(doc.positionAt(s), doc.positionAt(e));
  for (const m of marks) {
    const slot = m.depth % heads.length;
    let type;
    if (m.kind === "head") type = enabled ? heads[slot] : undefined;
    else if (m.kind === "form") type = enabled ? forms[slot] : undefined;
    else if (m.kind === "open" || m.kind === "close") type = enabled && !native ? (m.form ? formParens : parens[slot]) : undefined;
    else type = tokens.get(m.kind);
    if (type) ranges.get(type)?.push(at(m.start, m.end));
  }
  if (broken) ranges.set(broken, unbalanced.map((i) => at(i, i + 1)));
  for (const [type, list] of ranges) editor.setDecorations(type, list);
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  build();
  /** @type {NodeJS.Timeout | undefined} */
  let pending;
  vscode.window.visibleTextEditors.forEach(paint);
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => editors.forEach(paint)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        for (const editor of vscode.window.visibleTextEditors) if (editor.document === e.document) paint(editor);
      }, 60);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("ncon")) return;
      build();
      vscode.window.visibleTextEditors.forEach(paint);
    }),
    { dispose: () => all().forEach((d) => d.dispose()) },
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
