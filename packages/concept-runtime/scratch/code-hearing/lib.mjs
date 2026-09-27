// SPIKE helpers for gen.mjs: a JavaScript body as Code(ir=...), and realization shapes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importTypeScript } from "../../dist/code/import.js";
import { format, isCall } from "../../dist/concept/expression.js";

const here = dirname(fileURLToPath(import.meta.url));
export const js = (file, subs = {}) => {
  let src = readFileSync(join(here, file), "utf8");
  for (const [k, v] of Object.entries(subs)) src = src.replaceAll(k, v);
  return jsText(src, file);
};
export const jsText = (src, file = "body") => {
  const r = importTypeScript(`const body = ${src};`);
  if (r.unsupported.length) throw new Error(`${file}: ${JSON.stringify(r.unsupported)}`);
  const e = r.expression.args[0].value; // Module(Bind($body, <ir>))
  if (!isCall(e) || e.head !== "Bind") throw new Error(`${file}: ${format(e).slice(0, 80)}`);
  return `Code(ir = ${format(e.args[1].value)})`;
};
export const READS = "Context(Code($language), Reading())";
export const READS_PY = "Context(Code(Python()), Reading())";
export const READS_TS = "Context(Code(TypeScript()), Reading())";
// A reading written as a snippet: the word as $word, its positional parts, its named ones,
// and small helpers to read a part, ask a helper Concept, and say a name.
const PRELUDE = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  // An identifier's first part is how it was written; what follows is what it took.
  const positional = (e) => { const xs = e.args.filter((a) => a.name === undefined).map((a) => a.value); return e.head === "Identifier" ? xs.slice(1) : xs; };
  const parts = positional(self);
  const named = (k) => { const a = self.args.find((x) => x.name === k); return a ? a.value : undefined; };
  const read = (e) => api.evaluate(e, api.context);
  const ask = (head, ...xs) => api.evaluate(api.call(head, ...xs), api.context);
  const nameOf = (e) => { if (typeof e === "string") return e; if (!isCall(e)) return String(e); if (e.head === "Identifier") return e.args[0].value; return e.head[0].toLowerCase() + e.head.slice(1); };
  const variable = (e) => api.fromHost({ variable: nameOf(e) });
  const is = (e, head) => isCall(e) && e.head === head;
`;
// A reading's body: its own code (a comment saying what it reads, then what it does), after the
// shared helpers above.
export const snippet = (code) => jsText(`async (args, bindings, api) => {\n${PRELUDE}\n${code}\n}`);
// A reading on $word whose parts are not read first: the body reads what it needs.
export const readsWord = (code, context = READS) => `Realization($word, context = ${context}, evaluateArguments = false, body = ${snippet(code)})`;
