// A pack written from sources: node scripts/pack.mjs <sources dir> <pack name>. Run after `pnpm build`.
//
// The directory holds header.ncon (Requires, and plain Concepts and relations, written by hand)
// and one .js file per realization whose body works something out. Each .js file starts with
// the realization's head, then its body, one function:
//
//   // @realization Explain($x), context = Execution(), evaluateArguments = false
//   // What it does, for whoever reads the pack.
//   async (args, bindings, api) => { ... }
//
// The realization goes on the Concept its pattern names. The pack is written formatted, so it
// passes formatNcon; edit the sources, not the pack.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format, isCall } from "../dist/concept/expression.js";
import { formatNcon } from "../dist/code/format.js";
import { importTypeScript } from "../dist/code/import.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [dir, pack] = process.argv.slice(2);
if (!dir || !pack) throw new Error("usage: node scripts/pack.mjs <sources dir> <pack name>");
const src = join(root, dir);

const irOf = (file, text) => {
  const r = importTypeScript(`const body = ${text.trim().replace(/;$/, "")};`);
  if (r.unsupported.length) throw new Error(`${file}: not read: ${JSON.stringify(r.unsupported).slice(0, 400)}`);
  const e = r.expression.args[0].value;
  if (!isCall(e) || e.head !== "Bind") throw new Error(`${file}: not one function`);
  return format(e.args[1].value);
};

const out = [readFileSync(join(src, "header.ncon"), "utf8").trimEnd()];
for (const file of readdirSync(src).filter((f) => f.endsWith(".js")).sort()) {
  const text = readFileSync(join(src, file), "utf8");
  const lines = text.split("\n");
  const head = lines.findIndex((l) => l.startsWith("// @realization "));
  if (head < 0) throw new Error(`${file}: no "// @realization" line`);
  const spec = lines[head].slice("// @realization ".length).trim();
  const comments = [];
  let i = head + 1;
  for (; i < lines.length && lines[i].startsWith("//"); i++) comments.push(lines[i]);
  const concept = /^([A-Z][A-Za-z0-9_]*)\(/.exec(spec)?.[1];
  if (!concept) throw new Error(`${file}: the pattern must name a Concept`);
  out.push(`${comments.join("\n")}\nConcept(${concept}(), Realization(${spec}, body = Code(ir = ${irOf(file, lines.slice(i).join("\n"))})))`);
}
writeFileSync(join(root, "packs", `${pack}.ncon`), formatNcon(out.join("\n\n") + "\n"));
console.log(`wrote packs/${pack}.ncon from ${dir}`);
