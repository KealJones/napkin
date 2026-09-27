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
// What a composed body builds is code already, so it is built under Code() alone and not read again.
export const reads = (pattern, body, { context = READS, evaluate = true } = {}) =>
  `Realization(${pattern}, context = ${context}${evaluate ? "" : ", evaluateArguments = false"}${body.startsWith("Code(") ? "" : ", resultContext = Code()"}, body = ${body})`;
// A word read as what it already names in the code IR: built, not read again.
export const keeps = (head, context = READS) => `Realization(${head}(Rest($xs)), context = ${context}, resultContext = Code(), body = ${head}(Rest($xs)))`;

// A reading written as a snippet: the word as $word, its positional parts, its named ones,
// and small helpers to read a part, ask a helper Concept, and say a name.
const PRELUDE = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const positional = (e) => e.args.filter((a) => a.name === undefined).map((a) => a.value);
  const parts = positional(self);
  const named = (k) => { const a = self.args.find((x) => x.name === k); return a ? a.value : undefined; };
  const read = (e) => api.evaluate(e, api.context);
  const ask = (head, ...xs) => api.evaluate(api.call(head, ...xs), api.context);
  const nameOf = (e) => { if (typeof e === "string") return e; if (!isCall(e)) return String(e); const said = e.args.find((a) => a.name === "said"); return said ? said.value : e.head[0].toLowerCase() + e.head.slice(1); };
  const variable = (e) => api.fromHost({ variable: nameOf(e) });
  const is = (e, head) => isCall(e) && e.head === head;
`;
export const snippet = (comment, code) => jsText(`async (args, bindings, api) => {\n  // ${comment}\n${PRELUDE}\n${code}\n}`);
// A reading on $word whose parts are not read first: the snippet reads what it needs.
export const readsWord = (comment, code, context = READS) => `Realization($word, context = ${context}, evaluateArguments = false, body = ${snippet(comment, code)})`;
