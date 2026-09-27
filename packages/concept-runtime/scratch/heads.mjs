// Which heads the reference IR of the TS corpus uses, by how many statements contain them.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { importTypeScript } from "../dist/code/import.js";
import { isCall } from "../dist/concept/expression.js";
const here = dirname(fileURLToPath(import.meta.url));
const ts = createRequire(import.meta.url)("typescript");
const files = readFileSync(join(here, "corpus-9d08be4.txt"), "utf8").split("\n").filter((f) => f.endsWith(".ts")).map((f) => join(here, "../../..", f));
const count = new Map();
let n = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  for (const s of ts.createSourceFile("x.ts", text, 99, true).statements) {
    n++;
    const heads = new Set();
    const walk = (e) => { if (isCall(e)) { heads.add(e.head); e.args.forEach((a) => walk(a.value)); } };
    walk(importTypeScript(text.slice(s.getStart(), s.end)).expression);
    for (const h of heads) count.set(h, (count.get(h) ?? 0) + 1);
  }
}
console.log(n, "statements");
console.log([...count].sort((a, b) => b[1] - a[1]).map(([h, c]) => `${h}:${c}`).join("  "));
