// @ts-check
/**
 * Colors for .ncon, in one of two styles (ncon.style):
 * - "rainbow": every head and the parentheses around its arguments take the color of their
 *   depth, so `Concept(Members(), Realization(... Let(... Filter(...))))` reads level by level.
 * - "syntax": heads are colored by what they are, the way TypeScript's tokens are in Monokai,
 *   and VS Code's own rainbow brackets do the grouping.
 * Every other token is painted in Monokai whatever the theme. JavaScript inside
 * Code(source="""...""") bodies keeps the grammar's JavaScript highlighting.
 */
const vscode = require("vscode");
const { scan, variableAt, callAt, variablesAt, parameterNames, PARAMETERS, RAINBOW, PALETTE, ROLES, SYNTAX_TOKENS, GHOSTS, PREFIX_GHOSTS } = require("./scan.js");
const { indexPack, indexGraph, indexJournal, describe, PACK_FORMS } = require("./describe.js");
const { format, isFormatError } = require("./format.js");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { homedir } = require("node:os");
const { basename } = require("node:path");

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
/** @type {Map<string, vscode.TextEditorDecorationType>} */
let roles = new Map();
/** @type {Map<string, vscode.TextEditorDecorationType>} */
let ghosts = new Map();
/** @type {Map<string, vscode.TextEditorDecorationType>} */
let prefixGhosts = new Map();
/** @type {vscode.TextEditorDecorationType | undefined} */
let parameterHint;
/** @type {vscode.TextEditorDecorationType | undefined} */
let broken;

const config = () => vscode.workspace.getConfiguration("ncon");
const syntaxStyle = () => config().get("style", "rainbow") === "syntax";

function all() {
  return [...heads, ...forms, ...parens, ...(formParens ? [formParens] : []), ...tokens.values(), ...roles.values(), ...ghosts.values(), ...prefixGhosts.values(), ...(parameterHint ? [parameterHint] : []), ...(broken ? [broken] : [])];
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
      ? Object.entries(syntaxStyle() ? SYNTAX_TOKENS : PALETTE).map(([kind, style]) => [kind, vscode.window.createTextEditorDecorationType(style)])
      : [],
  );
  roles = new Map(Object.entries(ROLES).map(([role, style]) => [role, vscode.window.createTextEditorDecorationType(style)]));
  // The operator a Concept is, after each comma between its arguments: faint, and not in the file.
  const ghost = (/** @type {Record<string, string>} */ table, /** @type {(op: string) => string} */ text) =>
    new Map(
      config().get("ghostOperators", true)
        ? Object.entries(table).map(([head, op]) => [
            head,
            vscode.window.createTextEditorDecorationType({ after: { contentText: text(op), color: new vscode.ThemeColor("editorInlayHint.foreground") } }),
          ])
        : [],
    );
  ghosts = ghost(GHOSTS, (op) => ` ${op}`);
  // A unary operator sits right after the opening parenthesis: Negate(-$x), Not(!$x).
  prefixGhosts = ghost(PREFIX_GHOSTS, (op) => op);
  // What a positional argument is, at the end of its first line: `Undefined()  = otherwise`.
  // The comment hue, much darker, so it reads as a note behind the code.
  parameterHint = vscode.window.createTextEditorDecorationType({ after: { color: String(config().get("parameterNames.color", "#4F4C41")), margin: "0 0 0 2ch" } });
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
  const syntax = syntaxStyle();
  // The syntax style leaves grouping to VS Code's bracket pair colors.
  const native = syntax || config().get("rainbow.source", "ncon") === "vscode";
  const binders = config().get("locals.binders");
  const { marks, unbalanced } = scan(doc.getText(), Array.isArray(binders) ? { binders: binders.map(String) } : {});
  /** @type {Map<vscode.TextEditorDecorationType, vscode.Range[]>} */
  const ranges = new Map(all().map((d) => [d, []]));
  const at = (/** @type {number} */ s, /** @type {number} */ e) => new vscode.Range(doc.positionAt(s), doc.positionAt(e));
  for (const m of marks) {
    const slot = m.depth % heads.length;
    let type;
    if ((m.kind === "head" || m.kind === "form") && syntax) type = roles.get(m.role ?? "call");
    else if (m.kind === "head") type = enabled ? heads[slot] : undefined;
    else if (m.kind === "form") type = enabled ? forms[slot] : undefined;
    else if (m.kind === "open" || m.kind === "close") type = enabled && !native ? (m.form ? formParens : parens[slot]) : undefined;
    else type = tokens.get(m.kind);
    if (type) ranges.get(type)?.push(at(m.start, m.end));
    const ghost = m.kind === "comma" && m.of ? ghosts.get(m.of) : m.kind === "open" && m.of ? prefixGhosts.get(m.of) : undefined;
    if (ghost) ranges.get(ghost)?.push(at(m.start, m.end));
  }
  if (broken) ranges.set(broken, unbalanced.map((i) => at(i, i + 1)));
  for (const [type, list] of ranges) editor.setDecorations(type, list);
  if (parameterHint) editor.setDecorations(parameterHint, config().get("parameterNames", true) ? parameterHints(doc, scanned(doc)) : []);
}

/* ------------------------------------------------------------------ *
 * Hover: what a Concept is, from the packs that define it and the graph.
 * ------------------------------------------------------------------ */

/** @type {Map<string, (string | undefined)[]> | undefined} each head's parameter names, from its patterns */
let parameters;
/** The names a head's arguments have, by position: from every realization pattern the packs give it. */
function parameterNamesOf(/** @type {string} */ head) {
  if (!parameters) {
    parameters = new Map(Object.entries(PARAMETERS));
    for (const byName of packs.values()) {
      for (const [name, defs] of byName) {
        for (const def of defs) {
          for (const r of def.realizations) {
            const names = parameterNames(r.pattern);
            if (!names) continue;
            const known = parameters.get(name) ?? [];
            names.forEach((n, i) => (known[i] ??= n));
            parameters.set(name, known);
          }
        }
      }
    }
  }
  return parameters.get(head);
}

/**
 * A faint parameter name at the end of the first line of every positional argument that
 * starts a line of its own. Inline arguments get none: the line would be all hints.
 * @param {vscode.TextDocument} doc
 * @param {ReturnType<typeof scan>} scan
 * @returns {vscode.DecorationOptions[]}
 */
function parameterHints(doc, { args }) {
  const out = [];
  for (const a of args) {
    if (a.named || !a.head) continue;
    const name = parameterNamesOf(a.head)?.[a.index];
    if (!name) continue;
    const start = doc.positionAt(a.start);
    const line = doc.lineAt(start.line);
    if (line.firstNonWhitespaceCharacterIndex !== start.character) continue;
    out.push({ range: new vscode.Range(line.range.end, line.range.end), renderOptions: { after: { contentText: `= ${name}` } } });
  }
  return out;
}

/** @type {Map<string, Map<string, import("./describe.js").Definition[]>>} every pack's Concepts, by file */
const packs = new Map();
/** @type {{ path: string, mtime: number, relations: Map<string, string[]> } | undefined} */
let graph;

async function indexWorkspace() {
  for (const uri of await vscode.workspace.findFiles("**/*.ncon", "**/node_modules/**")) indexFile(uri);
}

/** @param {vscode.Uri} uri */
function indexFile(uri) {
  fileLines.delete(uri.fsPath);
  parameters = undefined;
  try {
    packs.set(uri.fsPath, indexPack(readFileSync(uri.fsPath, "utf8"), basename(uri.fsPath)));
  } catch {
    packs.delete(uri.fsPath);
  }
}

/** What the saved graph holds, reread when the file changes. */
function learned() {
  const configured = String(config().get("graph", "") || "").replace(/^~/, homedir());
  // The journal the runtime keeps (store/journal.ts), or an older graph.json.
  const journal = `${homedir()}/.napkin/store.ncon`;
  const path = configured || (existsSync(journal) ? journal : `${homedir()}/.napkin/graph.json`);
  try {
    const mtime = statSync(path).mtimeMs;
    if (!graph || graph.path !== path || graph.mtime !== mtime) {
      const text = readFileSync(path, "utf8");
      graph = { path, mtime, relations: path.endsWith(".json") ? indexGraph(JSON.parse(text)) : indexJournal(text) };
    }
    return graph.relations;
  } catch {
    return new Map();
  }
}

/** @type {WeakMap<vscode.TextDocument, { version: number, scanned: ReturnType<typeof scan> }>} */
const scans = new WeakMap();
/** @param {vscode.TextDocument} doc */
function scanned(doc) {
  const cached = scans.get(doc);
  if (cached && cached.version === doc.version) return cached.scanned;
  const binders = config().get("locals.binders");
  const result = scan(doc.getText(), Array.isArray(binders) ? { binders: binders.map(String) } : {});
  scans.set(doc, { version: doc.version, scanned: result });
  return result;
}

/** Text as written, starting at `column`, shifted left by that column, cut short when long. */
function dedent(text, column, max = 40) {
  const lines = text.split("\n");
  const out = [lines[0], ...lines.slice(1).map((l) => l.slice(Math.min(column, l.match(/^ */)?.[0].length ?? 0)))];
  return out.length > max ? [...out.slice(0, max), "…"].join("\n") : out.join("\n");
}

/** What a variable stands for: the value its local was bound to, or where it is bound. */
function hoverVariable(doc, range) {
  const text = doc.getText();
  const found = variableAt(text, doc.offsetAt(range.start) + 1, scanned(doc));
  const name = doc.getText(range);
  if (!found) return undefined;
  const md = new vscode.MarkdownString();
  if (found.kind === "local") {
    md.appendMarkdown(`**${name}** · local, bound on line ${doc.positionAt(found.binder).line + 1}\n\n`);
    md.appendCodeblock(dedent(found.value, doc.positionAt(found.valueAt).character), "ncon");
  } else {
    md.appendMarkdown(`**${name}** · ${found.kind === "pattern" ? "from the pattern" : "parameter of"} `);
    md.appendCodeblock(found.kind === "pattern" ? found.where : `Lambda(${found.where}, …)`, "ncon");
  }
  return new vscode.Hover(md, range);
}

/** @type {vscode.HoverProvider} */
const hover = {
  provideHover(doc, position) {
    const variable = doc.getWordRangeAtPosition(position, /\$[A-Za-z_][A-Za-z0-9_]*/);
    if (variable) return hoverVariable(doc, variable);
    const range = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
    if (!range) return undefined;
    // A Concept is a name called: followed by its parenthesis.
    const after = doc.getText(new vscode.Range(range.end, range.end.translate(0, 1)));
    const before = range.start.character > 0 ? doc.getText(new vscode.Range(range.start.translate(0, -1), range.start)) : "";
    if (after !== "(" || before === "$") return undefined;
    const name = doc.getText(range);
    const defs = [...packs.values()].flatMap((byName) => byName.get(name) ?? []);
    const operator = /** @type {Record<string, string>} */ (GHOSTS)[name] ?? /** @type {Record<string, string>} */ (PREFIX_GHOSTS)[name];
    const text = describe(name, defs, learned().get(name) ?? [], operator);
    return text ? new vscode.Hover(new vscode.MarkdownString(text), range) : undefined;
  },
};

/**
 * Cmd+Click (Go to Definition): a Concept goes to its `Concept(Name(), ...)` in every pack
 * that defines it; a variable to the Bind that names it, or its place in the pattern or the
 * Lambda's parameters.
 * @type {vscode.DefinitionProvider}
 */
const definition = {
  provideDefinition(doc, position) {
    const variable = doc.getWordRangeAtPosition(position, /\$[A-Za-z_][A-Za-z0-9_]*/);
    if (variable) {
      const found = variableAt(doc.getText(), doc.offsetAt(variable.start) + 1, scanned(doc));
      if (!found) return undefined;
      const at = doc.positionAt(found.kind === "local" ? found.binder : found.at);
      return new vscode.Location(doc.uri, new vscode.Range(at, at.translate(0, doc.getText(variable).length)));
    }
    const range = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
    if (!range) return undefined;
    const name = doc.getText(range);
    const out = [];
    for (const [path, byName] of packs) {
      for (const def of byName.get(name) ?? []) {
        const line = readLine(path, def.line);
        const column = Math.max(0, line.indexOf(`${name}(`));
        const start = new vscode.Position(def.line, column);
        out.push(new vscode.Location(vscode.Uri.file(path), new vscode.Range(start, start.translate(0, name.length))));
      }
    }
    return out;
  },
};

/** @type {Map<string, string[]>} */
const fileLines = new Map();
/** A line of a pack, for the column of the name on it. */
function readLine(path, line) {
  if (!fileLines.has(path)) {
    try {
      fileLines.set(path, readFileSync(path, "utf8").split("\n"));
    } catch {
      fileLines.set(path, []);
    }
  }
  return fileLines.get(path)?.[line] ?? "";
}

/**
 * Format Document: the whole text, formatted by the runtime's own formatter (format.js).
 * Text that does not parse is left alone, and the reason is shown.
 * @type {vscode.DocumentFormattingEditProvider}
 */
const formatter = {
  async provideDocumentFormattingEdits(doc) {
    const text = doc.getText();
    try {
      const out = await format(text);
      if (out === text) return [];
      return [vscode.TextEdit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), out)];
    } catch (error) {
      if (await isFormatError(error)) vscode.window.showWarningMessage(`N-Con: not formatted: ${error.message}`);
      else vscode.window.showWarningMessage(`N-Con: not formatted: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  },
};

/* ------------------------------------------------------------------ *
 * Autocomplete and signature help, from the same packs.
 * ------------------------------------------------------------------ */

/** Every realization pattern a head has in the packs, each once. @param {string} head */
function patternsOf(head) {
  const out = new Set();
  for (const byName of packs.values()) for (const d of byName.get(head) ?? []) for (const r of d.realizations) out.add(r.pattern);
  return [...out];
}

/** A pattern's arguments as label offsets, for highlighting the one being written. @param {string} label */
function parameterRanges(label) {
  const open = label.indexOf("(");
  /** @type {[number, number][]} */
  const out = [];
  if (open < 0) return out;
  let depth = 0;
  let from = open + 1;
  for (let i = open + 1; i < label.length; i++) {
    const ch = label[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth-- === 0) {
        if (label.slice(from, i).trim()) out.push([from, i]);
        break;
      }
    } else if (ch === "," && depth === 0) {
      out.push([from, i]);
      from = i + 2;
    }
  }
  return out;
}

/** @type {vscode.SignatureHelpProvider} */
const signatures = {
  provideSignatureHelp(doc, position) {
    const call = callAt(doc.getText(), doc.offsetAt(position));
    if (!call) return undefined;
    const fallback = /** @type {Record<string, string[]>} */ (PARAMETERS)[call.head];
    const form = PACK_FORMS[call.head];
    const labels = form ? [form.signature] : patternsOf(call.head);
    if (!labels.length && fallback) labels.push(`${call.head}(${fallback.map((n) => "$" + n).join(", ")})`);
    if (!labels.length) return undefined;
    const help = new vscode.SignatureHelp();
    const comment = form?.doc ?? [...packs.values()].flatMap((byName) => byName.get(call.head) ?? []).map((d) => d.comment).find(Boolean);
    help.signatures = labels.map((label) => {
      const info = new vscode.SignatureInformation(label, comment ? new vscode.MarkdownString(comment) : undefined);
      info.parameters = parameterRanges(label).map((r) => new vscode.ParameterInformation(r));
      return info;
    });
    // The first pattern that takes this many arguments, a Rest counting as any number.
    const fits = help.signatures.findIndex((sig, k) => sig.parameters.length > call.index || labels[k].includes("Rest("));
    help.activeSignature = Math.max(0, fits);
    const params = help.signatures[help.activeSignature].parameters;
    help.activeParameter = Math.min(call.index, Math.max(0, params.length - 1));
    // A named argument is the parameter of that name, wherever it is written.
    const named = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(call.argument)?.[1];
    if (named) {
      const label = labels[help.activeSignature];
      const k = params.findIndex((p) => Array.isArray(p.label) && label.slice(p.label[0], p.label[1]).trimStart().startsWith(`${named} `));
      if (k >= 0) help.activeParameter = k;
    }
    return help;
  },
};

/** @type {vscode.CompletionItemProvider} */
const completions = {
  provideCompletionItems(doc, position) {
    const range = doc.getWordRangeAtPosition(position, /\$?[A-Za-z_][A-Za-z0-9_]*|\$/);
    const typed = range ? doc.getText(range) : "";
    const nextChar = doc.getText(new vscode.Range(position, position.translate(0, 1)));
    // `$`: the variables in scope here.
    if (typed.startsWith("$")) {
      return variablesAt(doc.getText(), doc.offsetAt(position), scanned(doc)).map((v) => {
        const item = new vscode.CompletionItem(v.name, v.kind === "local" ? vscode.CompletionItemKind.Variable : vscode.CompletionItemKind.TypeParameter);
        item.range = range;
        item.detail = v.kind === "local" ? `= ${v.detail}` : `${v.kind === "pattern" ? "from" : "parameter of"} ${v.detail}`;
        return item;
      });
    }
    // Otherwise every Concept the packs define, and those only the graph knows.
    const items = new Map();
    // At the start of an argument of a pack form, its named arguments: `context = `, `body = `.
    const call = callAt(doc.getText(), doc.offsetAt(position));
    const form = call ? PACK_FORMS[call.head] : undefined;
    // A form whose first argument is named too (Code) offers them from the first argument on.
    const firstNamed = form ? /^[A-Za-z]+\(\s*[A-Za-z_]+ =/.test(form.signature) : false;
    if (call && form?.named && (call.index > 0 || firstNamed) && /^\s*[A-Za-z_]*$/.test(call.argument)) {
      for (const [name, doc_] of Object.entries(form.named)) {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
        item.insertText = `${name} = `;
        item.documentation = new vscode.MarkdownString(doc_);
        item.sortText = `!${name}`;
        item.command = { command: "editor.action.triggerSuggest", title: "" };
        items.set(`${name} =`, item);
      }
    }
    for (const byName of packs.values()) {
      for (const [name, defs] of byName) {
        if (items.has(name)) continue;
        const item = new vscode.CompletionItem(name, defs.some((d) => d.realizations.length) ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Class);
        const patterns = patternsOf(name);
        item.detail = patterns[0] ?? defs[0].relations.join(" ");
        const names = parameterNamesOf(name)?.filter(Boolean) ?? [];
        if (nextChar !== "(") {
          item.insertText = new vscode.SnippetString(
            names.length ? `${name}(${names.map((n, k) => `\${${k + 1}:${n}}`).join(", ")})` : patterns.some((p) => p === `${name}()`) || !patterns.length ? `${name}()` : `${name}($0)`,
          );
        }
        items.set(name, item);
      }
    }
    for (const name of learned().keys()) {
      if (items.has(name) || !/^[A-Z]/.test(name)) continue;
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
      item.detail = "learned";
      item.sortText = `~${name}`;
      if (nextChar !== "(") item.insertText = `${name}()`;
      items.set(name, item);
    }
    return [...items.values()];
  },
  resolveCompletionItem(item) {
    const name = typeof item.label === "string" ? item.label : item.label.label;
    if (name.startsWith("$")) return item;
    const defs = [...packs.values()].flatMap((byName) => byName.get(name) ?? []);
    const text = describe(name, defs, learned().get(name) ?? [], /** @type {Record<string, string>} */ (GHOSTS)[name]);
    item.documentation = new vscode.MarkdownString(text);
    return item;
  },
};

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  build();
  // Parameter names come from the packs, so paint again once they are read.
  indexWorkspace().then(() => vscode.window.visibleTextEditors.forEach(paint));
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ncon");
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(indexFile),
    watcher.onDidCreate(indexFile),
    watcher.onDidDelete((uri) => {
      packs.delete(uri.fsPath);
      parameters = undefined;
    }),
    vscode.languages.registerHoverProvider("ncon", hover),
    vscode.languages.registerDefinitionProvider("ncon", definition),
    vscode.languages.registerDocumentFormattingEditProvider("ncon", formatter),
    vscode.languages.registerCompletionItemProvider("ncon", completions, "$"),
    vscode.languages.registerSignatureHelpProvider("ncon", signatures, "(", ","),
  );
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
