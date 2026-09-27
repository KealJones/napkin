// SPIKE scoreboard (spike/hear-code-words): how accurate and how fast code hearing is.
//   node scratch/scoreboard.mjs [ts|py|speed|size|all] [--limit N] [--show CATEGORY]
// Accuracy: every top-level statement of the corpus is heard and read, and compared with the
// existing reader of that statement (importTypeScript, or importSource for Python).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { importTypeScript, importSource } from "../dist/code/import.js";
import { c, call, format, isCall } from "../dist/concept/expression.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const args = process.argv.slice(2);
const what = args[0] ?? "all";
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const LIMIT = Number(flag("--limit", "100000"));
const SHOW = flag("--show", undefined)?.split("|");
const shown = new Map();
const wants = (category) => SHOW && SHOW.some((x) => category.startsWith(x)) && (shown.set(category, (shown.get(category) ?? 0) + 1), shown.get(category) <= Number(flag("--examples", "3")));
const MAX_TOKENS = Number(flag("--max-tokens", "1000000"));

const store = new ConceptStore();
seed(store);
const stats = { evaluations: 0 };
const hearRead = async (text, lang, seen = () => {}) => {
  const rt = new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 });
  const h = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(lang))));
  seen(h);
  const r = await rt.evaluate(h, c("Context", c("Code", c(lang)), c("Reading")));
  stats.evaluations += rt.steps ?? 0;
  return { heard: h, read: r, steps: rt.steps ?? 0 };
};
// The smallest part of what was heard whose reading fails.
const culprit = async (heard, lang) => {
  const fails = async (e) => {
    try {
      await new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 }).evaluate(e, c("Context", c("Code", c(lang)), c("Reading")));
      return false;
    } catch {
      return true;
    }
  };
  let e = heard;
  for (let depth = 0; depth < 50 && isCall(e); depth++) {
    const inner = [];
    for (const a of e.args) if (isCall(a.value) && (await fails(a.value))) inner.push(a.value);
    if (!inner.length) break;
    e = inner[0];
  }
  return format(e).slice(0, 300);
};
const hasUnsupported = (e) => isCall(e) && (e.head === "Unsupported" || e.args.some((a) => hasUnsupported(a.value)));
// Kept on purpose, where the reference erases it: a Float(n) stated in the source counts as
// the reference's plain n, and a declared type (type=...) is set aside.
const plain = (e) =>
  !isCall(e) ? e : e.head === "Float" && e.args.length === 1 ? e.args[0].value : e.head === "UnboundName" && e.args.length === 1 ? { variable: e.args[0].value } : { head: e.head, args: e.args.filter((a) => a.name !== "type").map((a) => ({ ...a, value: plain(a.value) })) };
const unwrap = (e) => (isCall(e) && e.head === "Module" && e.args.length === 1 ? e.args[0].value : e);
// Where two readings first part: the reference's head there names the failure.
const diverge = (a, b) => {
  const at = (category, x, y) => ({ category, ref: format(x).slice(0, 260), mine: format(y).slice(0, 260) });
  if (!isCall(a) || !isCall(b)) return at(isCall(a) ? a.head : isCall(b) ? `value vs ${b.head}` : "value", a, b);
  if (a.head !== b.head) return at(`${a.head} vs ${b.head}`, a, b);
  const n = Math.min(a.args.length, b.args.length);
  for (let i = 0; i < n; i++) {
    if (format(a.args[i].value) !== format(b.args[i].value) || a.args[i].name !== b.args[i].name) {
      const inner = diverge(a.args[i].value, b.args[i].value);
      return a.args.length === b.args.length ? inner : { ...inner, category: `${a.head} (arity) > ${inner.category}` };
    }
  }
  return at(`${a.head} (arity)`, a, b);
};

async function score(name, statements, reference, lang) {
  let same = 0, counted = 0, refGaps = 0;
  const categories = new Map();
  const examples = new Map();
  const t0 = performance.now();
  let tooBig = 0;
  let erased = 0;
  for (const text of statements.slice(0, LIMIT)) {
    if (tokens(text) > MAX_TOKENS) {
      tooBig++;
      continue;
    }
    let ref;
    try {
      ref = await reference(text);
    } catch {
      refGaps++;
      continue;
    }
    if (!ref || hasUnsupported(ref.expression) || ref.unsupported?.length) {
      refGaps++;
      continue;
    }
    // Types only: the reader erases the statement entirely, so there is nothing to compare.
    if (isCall(ref.expression) && ref.expression.head === "Module" && ref.expression.args.length === 0) {
      erased++;
      continue;
    }
    counted++;
    let category;
    let heardTree;
    try {
      const heardRead = await hearRead(text, lang, (h) => (heardTree = h));
      const read = plain(heardRead.read);
      if (format(unwrap(read)) === format(unwrap(ref.expression))) {
        same++;
        continue;
      }
      const d = diverge(unwrap(ref.expression), unwrap(read));
      category = d.category;
      if (wants(category) && !examples.has(text)) examples.set(text, [d.ref, d.mine]);
    } catch (e) {
      category = `error: ${String(e.message).slice(0, 60)}`;
      if (wants(category) && !examples.has(text)) examples.set(text, [heardTree ? await culprit(heardTree, lang) : "(hearing failed)", String(e.message)]);
    }
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const ms = performance.now() - t0;
  console.log(`\n${name}: ${same}/${counted} statements identical (${((100 * same) / Math.max(counted, 1)).toFixed(1)}%), ${refGaps} skipped where the reference itself has gaps, ${tooBig} over ${MAX_TOKENS} tokens not tried, ${erased} type-only (erased by the reader), ${(ms / 1000).toFixed(1)}s`);
  for (const [k, n] of [...categories].sort((a, b) => b[1] - a[1]).slice(0, Number(flag("--top", "10")))) console.log(`  ${String(n).padStart(4)}  ${k}`);
  for (const [text, [r, m]] of [...examples].slice(0, 30)) console.log(`\n--- ${text.slice(0, 120).replace(/\n/g, " ")}\n  ref:  ${r}\n  mine: ${m}`);
  return { same, counted };
}

const tsFiles = () =>
  (flag("--file", undefined) ? flag("--file") + "\n" : readFileSync(join(here, "corpus-9d08be4.txt"), "utf8"))
    .split("\n")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(root, "../..", f))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });
const tsStatements = (text) => ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true).statements.map((s) => text.slice(s.getStart(), s.end));

let TreeSitter;
const pyParser = async () => {
  if (!TreeSitter) {
    const loaded = await import("web-tree-sitter");
    TreeSitter = loaded.default ?? loaded;
    await TreeSitter.init();
  }
  const parser = new TreeSitter();
  parser.setLanguage(await TreeSitter.Language.load(join(root, "node_modules/tree-sitter-wasms/out/tree-sitter-python.wasm")));
  return parser;
};
const PY = ["bisect", "colorsys", "keyword", "heapq", "fnmatch", "glob", "genericpath", "stat", "sched", "shlex", "textwrap", "copy", "abc", "numbers", "string", "queue", "contextlib", "random", "statistics", "tabnanny"];
const pyDir = () => execSync(`python3 -c "import os;print(os.path.dirname(os.__file__))"`).toString().trim();
const pyStatements = async (text) => {
  const tree = (await pyParser()).parse(text);
  const out = [];
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const n = tree.rootNode.child(i);
    if (n.type !== "comment") out.push(text.slice(n.startIndex, n.endIndex) + "\n");
  }
  return out;
};

// --at <commit>: the corpus as it was at that commit, so a change to the files it reads does not
// change what is measured.
const AT = flag("--at", undefined);
const source = (f) => (AT ? execSync(`git -C ${root} show ${AT}:${f.slice(join(root, "../..").length + 1)}`, { maxBuffer: 1 << 26 }).toString() : readFileSync(f, "utf8"));
const tokens = (text) => (text.match(/[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu) ?? []).length;

if (what === "ts" || what === "all") {
  const statements = tsFiles().flatMap((f) => tsStatements(source(f)));
  await score(`TypeScript (${tsFiles().length} files, ${statements.length} statements)`, statements, async (t) => importTypeScript(t), "TypeScript");
}
if (what === "py" || what === "all") {
  const dir = pyDir();
  const statements = [];
  for (const m of PY) statements.push(...(await pyStatements(readFileSync(join(dir, `${m}.py`), "utf8"))));
  await score(`Python (${PY.length} stdlib files, ${statements.length} statements)`, statements, async (t) => importSource(t, "Python"), "Python");
}
if (what === "speed" || what === "all") {
  const pool = tsFiles().flatMap((f) => tsStatements(source(f))).filter((s) => !hasUnsupported(importTypeScript(s).expression));
  const parser = await (async () => {
    const loaded = await import("web-tree-sitter");
    const T = loaded.default ?? loaded;
    await T.init();
    const p = new T();
    p.setLanguage(await T.Language.load(join(root, "node_modules/tree-sitter-wasms/out/tree-sitter-typescript.wasm")));
    return p;
  })();
  console.log("\nspeed (TypeScript): lines tokens | hearing | importTypeScript ms | tree-sitter parse ms");
  for (const target of (flag("--lines", "10,100,1000,5000")).split(",").map(Number)) {
    let text = "";
    for (const s of pool) {
      if (text.split("\n").length >= target) break;
      text += s + "\n";
    }
    const lines = text.split("\n").length;
    let t = performance.now();
    importTypeScript(text);
    const importMs = performance.now() - t;
    t = performance.now();
    parser.parse(text);
    const treeMs = performance.now() - t;
    const rt = new Runtime(store, { maximumSteps: 500_000_000, maximumDepth: 100_000 });
    t = performance.now();
    let hear = "error";
    let read = "error";
    let rounds = "";
    try {
      const h = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c("TypeScript"))));
      hear = (performance.now() - t).toFixed(0);
      rounds = h.args.find((a) => a.name === "rounds")?.value;
      t = performance.now();
      try {
        await rt.evaluate(h, c("Context", c("Code", c("TypeScript")), c("Reading")));
        read = (performance.now() - t).toFixed(0);
      } catch (e) {
        read = `error after ${(performance.now() - t).toFixed(0)}`;
      }
    } catch (e) {
      hear = `error ${String(e.message).slice(0, 40)}`;
    }
    console.log(`  ${lines} ${tokens(text)} | hear ${hear} ms, ${rounds} rounds, read ${read} ms, ${rt.steps} evaluations | ${importMs.toFixed(1)} | ${treeMs.toFixed(1)}`);
  }
}
if (what === "size" || what === "all") {
  const count = (f) => readFileSync(f, "utf8").split("\n").length;
  const body = readdirSync(join(here, "code-hearing")).filter((f) => f.endsWith(".js")).reduce((n, f) => n + count(join(here, "code-hearing", f)), 0);
  const readingFiles = readdirSync(join(here, "code-hearing", "read")).filter((f) => f.endsWith(".js"));
  const readings = readingFiles.reduce((n, f) => n + count(join(here, "code-hearing", "read", f)), 0);
  const composed = readFileSync(join(root, "packs/codereadings.ncon"), "utf8");
  const pack = readFileSync(join(root, "packs/code-hearing.ncon"), "utf8");
  const words = readFileSync(join(root, "packs/codewords.ncon"), "utf8");
  const derived = readFileSync(join(root, "packs/codebinds.ncon"), "utf8");
  const host = execSync(`git -C ${root} diff 4f21c2e --numstat -- src/runtime/host.ts src/runtime/evaluator.ts src/seed/seed.ts src/runtime/context.ts src/runtime/select.ts`).toString().trim().split("\n").filter(Boolean).reduce((n, l) => n + Number(l.split("\t")[0]), 0);
  const n = (text, re) => (text.match(re) ?? []).length;
  console.log(`\nsize: host TS +${host} lines, JS bodies ${body} lines, reading bodies ${readingFiles.length} files ${readings} lines, codereadings.ncon ${composed.split("\n").length} lines (${n(composed, /Realization\(/g)} realizations), codewords.ncon ${words.split("\n").length} lines (hand-written: ${n(words, /^Concept\(/gm)} Concepts, Binds ${n(words, /Binds\(/g)}, Spelled ${n(words, /Spelled\(/g)}), codebinds.ncon ${derived.split("\n").length} lines (derived: Binds ${n(derived, /Binds\(/g)}), code-hearing.ncon ${pack.split("\n").length} lines (Realizations ${n(pack, /Realization\(/g)})`);
}
