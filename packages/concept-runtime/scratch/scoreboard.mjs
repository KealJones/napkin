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
const SHOW = flag("--show", undefined);
const MAX_TOKENS = Number(flag("--max-tokens", "1000000"));

const store = new ConceptStore();
seed(store);
const stats = { evaluations: 0 };
const hearRead = async (text, lang) => {
  const rt = new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 });
  const h = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(lang))));
  const r = await rt.evaluate(h, c("Context", c("Code", c(lang)), c("Reading")));
  stats.evaluations += rt.steps ?? 0;
  return { heard: h, read: r, steps: rt.steps ?? 0 };
};
const hasUnsupported = (e) => isCall(e) && (e.head === "Unsupported" || e.args.some((a) => hasUnsupported(a.value)));
// A Float(n) stated in the source counts as the reference's plain n: kept on purpose.
const plain = (e) => (!isCall(e) ? e : e.head === "Float" && e.args.length === 1 ? e.args[0].value : { head: e.head, args: e.args.map((a) => ({ ...a, value: plain(a.value) })) });
const unwrap = (e) => (isCall(e) && e.head === "Module" && e.args.length === 1 ? e.args[0].value : e);
// Where two readings first part: the reference's head there names the failure.
const diverge = (a, b) => {
  if (!isCall(a) || !isCall(b)) return isCall(a) ? a.head : isCall(b) ? `value vs ${b.head}` : "value";
  if (a.head !== b.head || a.args.length !== b.args.length) return `${a.head}${a.head === b.head ? " (arity)" : ` vs ${b.head}`}`;
  for (let i = 0; i < a.args.length; i++) {
    if (format(a.args[i].value) !== format(b.args[i].value) || a.args[i].name !== b.args[i].name) return diverge(a.args[i].value, b.args[i].value);
  }
  return "?";
};

async function score(name, statements, reference, lang) {
  let same = 0, counted = 0, refGaps = 0;
  const categories = new Map();
  const examples = new Map();
  const t0 = performance.now();
  let tooBig = 0;
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
    counted++;
    let category;
    try {
      const read = plain((await hearRead(text, lang)).read);
      if (format(unwrap(read)) === format(unwrap(ref.expression))) {
        same++;
        continue;
      }
      category = diverge(unwrap(ref.expression), unwrap(read));
      if (SHOW && category === SHOW && !examples.has(text)) examples.set(text, [format(unwrap(ref.expression)).slice(0, 300), format(unwrap(read)).slice(0, 300)]);
    } catch (e) {
      category = `error: ${String(e.message).slice(0, 60)}`;
    }
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const ms = performance.now() - t0;
  console.log(`\n${name}: ${same}/${counted} statements identical (${((100 * same) / Math.max(counted, 1)).toFixed(1)}%), ${refGaps} skipped where the reference itself has gaps, ${tooBig} over ${MAX_TOKENS} tokens not tried, ${(ms / 1000).toFixed(1)}s`);
  for (const [k, n] of [...categories].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  for (const [text, [r, m]] of [...examples].slice(0, 6)) console.log(`\n--- ${text.slice(0, 200)}\n  ref:  ${r}\n  mine: ${m}`);
  return { same, counted };
}

const tsFiles = () =>
  readFileSync(join(here, "corpus-9d08be4.txt"), "utf8")
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

const tokens = (text) => (text.match(/[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu) ?? []).length;

if (what === "ts" || what === "all") {
  const statements = tsFiles().flatMap((f) => tsStatements(readFileSync(f, "utf8")));
  await score(`TypeScript (${tsFiles().length} files, ${statements.length} statements)`, statements, async (t) => importTypeScript(t), "TypeScript");
}
if (what === "py" || what === "all") {
  const dir = pyDir();
  const statements = [];
  for (const m of PY) statements.push(...(await pyStatements(readFileSync(join(dir, `${m}.py`), "utf8"))));
  await score(`Python (${PY.length} stdlib files, ${statements.length} statements)`, statements, async (t) => importSource(t, "Python"), "Python");
}
if (what === "speed" || what === "all") {
  const pool = tsFiles().flatMap((f) => tsStatements(readFileSync(f, "utf8"))).filter((s) => !hasUnsupported(importTypeScript(s).expression));
  const parser = await (async () => {
    const loaded = await import("web-tree-sitter");
    const T = loaded.default ?? loaded;
    await T.init();
    const p = new T();
    p.setLanguage(await T.Language.load(join(root, "node_modules/tree-sitter-wasms/out/tree-sitter-typescript.wasm")));
    return p;
  })();
  console.log("\nspeed (TypeScript): lines tokens | hear+read ms, evaluations | importTypeScript ms | tree-sitter parse ms");
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
    const budget = Number(flag("--budget", "600")) * 1000;
    t = performance.now();
    let hear = "timeout";
    let steps = "";
    try {
      const run = hearRead(text, "TypeScript");
      const r = await Promise.race([run, new Promise((res) => setTimeout(() => res(undefined), budget))]);
      if (r) {
        hear = (performance.now() - t).toFixed(0);
        steps = r.steps;
      }
    } catch (e) {
      hear = `error ${e.message.slice(0, 40)}`;
    }
    console.log(`  ${lines} ${tokens(text)} | ${hear} ${steps} | ${importMs.toFixed(1)} | ${treeMs.toFixed(1)}`);
    if (hear === "timeout") break;
  }
}
if (what === "size" || what === "all") {
  const count = (f) => readFileSync(f, "utf8").split("\n").length;
  const body = readdirSync(join(here, "code-hearing")).filter((f) => f.endsWith(".js")).reduce((n, f) => n + count(join(here, "code-hearing", f)), 0);
  const pack = readFileSync(join(root, "packs/code-hearing.ncon"), "utf8");
  const host = execSync(`git -C ${root} diff 4f21c2e --numstat -- src/runtime/host.ts src/runtime/evaluator.ts src/seed/seed.ts src/runtime/context.ts src/runtime/select.ts`).toString().trim().split("\n").filter(Boolean).reduce((n, l) => n + Number(l.split("\t")[0]), 0);
  const n = (re) => (pack.match(re) ?? []).length;
  console.log(`\nsize: host TS +${host} lines, JS bodies ${body} lines, code-hearing.ncon ${pack.split("\n").length} lines, Binds ${n(/Binds\(/g)}, Spelled ${n(/Spelled\(/g)}, Realizations ${n(/Realization\(/g)}, Concepts ${n(/^Concept\(/gm)}`);
}
