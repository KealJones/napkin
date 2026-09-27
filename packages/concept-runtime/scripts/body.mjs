// A pack's Code(ir=...) bodies as JavaScript, and back: the way mechanisms are authored (AGENTS.md).
// Run after `pnpm build`.
//
//   node scripts/body.mjs list <pack> [Concept]          the Code bodies, numbered, with pattern and context
//   node scripts/body.mjs show <pack> <Concept> [n]      body n (default 0) of Concept, as JavaScript
//   node scripts/body.mjs put <pack> <Concept> <n> <file.js>
//                                                        replace body n with the JavaScript in file.js
//   node scripts/body.mjs ir <file.js>                   the Code(ir = ...) for file.js, to paste
//
// <pack> is a file in packs/ (hearing, core, basic...). A body file holds one function:
//   async (args, bindings, api) => { ... }
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format, isCall, parseMany } from "../dist/concept/expression.js";
import { formatNcon } from "../dist/code/format.js";
import { importTypeScript, writeJavaScript } from "../dist/code/import.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const packFile = (pack) => join(root, "packs", pack.endsWith(".ncon") ? pack : `${pack}.ncon`);

/** Each Code body of a pack, in order, with where its Code( starts and ends in the text. */
function bodies(text) {
  const out = [];
  const conceptAt = /^Concept\(([A-Z][A-Za-z0-9_]*)\(\)/gm;
  const starts = [...text.matchAll(conceptAt)].map((m) => ({ name: m[1], at: m.index }));
  for (let k = 0; k < starts.length; k++) {
    const { name, at } = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1].at : text.length;
    const block = text.slice(at, end);
    let n = 0;
    for (const m of block.matchAll(/body = Code\(/g)) {
      const open = at + m.index + "body = ".length;
      let depth = 0;
      let i = open;
      let inString = false;
      for (; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (ch === "\\") i++;
          else if (ch === '"') inString = false;
        } else if (ch === '"') inString = true;
        else if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) break;
      }
      const code = text.slice(open, i + 1);
      const before = text.slice(at, open);
      const pattern = (before.match(/Realization\(([^\n]*?),?\s*$/m) ?? before.match(/Realization\((.*)/))?.[1] ?? "";
      const context = [...before.matchAll(/context = ([^\n]*?),?\n/g)].pop()?.[1] ?? "";
      out.push({ name, n: n++, from: open, to: i + 1, code, pattern: pattern.trim(), context: context.trim() });
    }
  }
  return out;
}

const pretty = (js) => {
  try {
    return execFileSync(join(root, "../../node_modules/.bin/prettier"), ["--parser", "babel", "--print-width", "100"], { input: js }).toString();
  } catch {
    return js;
  }
};

const irOf = (file) => {
  const src = readFileSync(file, "utf8").trim().replace(/;$/, "");
  const r = importTypeScript(`const body = ${src};`);
  if (r.unsupported.length) throw new Error(`${file}: not read: ${JSON.stringify(r.unsupported).slice(0, 400)}`);
  const e = r.expression.args[0].value; // Module(Bind($body, <ir>))
  if (!isCall(e) || e.head !== "Bind") throw new Error(`${file}: ${format(e).slice(0, 80)}`);
  return `Code(ir = ${format(e.args[1].value)})`;
};

if (cmd === "list") {
  const [pack, only] = rest;
  for (const b of bodies(readFileSync(packFile(pack), "utf8"))) if (!only || b.name === only) console.log(`${b.name} ${b.n}  ${b.pattern.slice(0, 60)}  ${b.context}`);
} else if (cmd === "show") {
  const [pack, name, n = "0"] = rest;
  const b = bodies(readFileSync(packFile(pack), "utf8")).find((x) => x.name === name && x.n === Number(n));
  if (!b) throw new Error(`no body ${n} on ${name} in ${pack}`);
  const [code] = parseMany(b.code);
  const ir = code.args.find((a) => a.name === "ir").value;
  console.log(pretty(writeJavaScript(ir).text));
} else if (cmd === "put") {
  const [pack, name, n, file] = rest;
  const path = packFile(pack);
  const text = readFileSync(path, "utf8");
  const b = bodies(text).find((x) => x.name === name && x.n === Number(n));
  if (!b) throw new Error(`no body ${n} on ${name} in ${pack}`);
  writeFileSync(path, formatNcon(text.slice(0, b.from) + irOf(file) + text.slice(b.to)));
  console.log(`replaced ${name} ${n} in ${pack}`);
} else if (cmd === "ir") {
  console.log(irOf(rest[0]));
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 11).join("\n"));
}
