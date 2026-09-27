// How tightly each operator binds, derived from a tree-sitter grammar.json instead of
// written by hand. A rule that is an operator between two things (SEQ(left, "op", right) under
// PREC_LEFT/PREC_RIGHT) gives the operator its precedence: a number (Python's grammar), or a
// name ordered by the grammar's `precedences` lists, earliest tightest (TypeScript's). A rule
// that is an operator before one thing (SEQ("op", arg) under a PREC) gives a leading word its
// binding. Scaled so the grammar's order is kept and the hand-written words (assignment,
// arrows, the question) still fall where they did.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const unwrap = (r) => {
  let prec;
  let right = false;
  while (r && (r.type.startsWith("PREC") || r.type === "TOKEN" || r.type === "IMMEDIATE_TOKEN")) {
    if (r.type.startsWith("PREC")) {
      prec = r.value;
      right = r.type === "PREC_RIGHT";
    }
    r = r.content;
  }
  return { r, prec, right };
};
const seq = (r) => (r && r.type === "SEQ" ? r.members : undefined);
const lit = (r) => {
  const u = unwrap(r).r;
  if (!u) return [];
  if (u.type === "FIELD") return lit(u.content);
  if (u.type === "STRING") return [u.value];
  if (u.type === "CHOICE") return u.members.flatMap(lit);
  if (u.type === "ALIAS" && u.named === false) return [u.value];
  return [];
};
const slot = (r) => {
  const u = unwrap(r).r;
  return !!u && (u.type === "SYMBOL" || (u.type === "FIELD" && slot(u.content)));
};

/** Operator text → { binds, right, alone } from a grammar. */
export function deriveBinds(file) {
  const g = JSON.parse(readFileSync(require.resolve(file), "utf8"));
  const order = new Map();
  for (const list of g.precedences ?? []) list.forEach((p, i) => p.type === "STRING" && !order.has(p.value) && order.set(p.value, i));
  const level = (prec) => (typeof prec === "number" ? prec : order.has(prec) ? -order.get(prec) : undefined);
  const infix = new Map();
  const prefix = new Map();
  const visit = (r, inherited) => {
    if (!r || typeof r !== "object") return;
    const { r: u, prec, right } = unwrap(r);
    const p = prec ?? inherited?.prec;
    const rt = prec !== undefined ? right : inherited?.right;
    const members = seq(u);
    if (members && p !== undefined && level(p) !== undefined) {
      const tail = members.length === 2 && unwrap(members[1]).r.type === "REPEAT1" ? seq(unwrap(unwrap(members[1]).r.content).r) : undefined;
      const three = members.length === 3 ? members : tail && tail.length === 2 ? [members[0], ...tail] : undefined;
      // Where an operator appears in several rules, the tightest is its own (Python's "|" is
      // also a pattern's alternatives).
      const keep = (m, op, x) => (!m.has(op) || m.get(op).level < x.level) && m.set(op, x);
      if (three && slot(three[0]) && lit(three[1]).length && slot(three[2])) for (const op of lit(three[1])) keep(infix, op, { level: level(p), right: rt });
      if (members.length === 2 && lit(members[0]).length && slot(members[1])) for (const op of lit(members[0])) keep(prefix, op, { level: level(p) });
    }
    if (u && u.type === "CHOICE") for (const m of u.members) visit(m, { prec: p, right: rt });
  };
  for (const rule of Object.values(g.rules)) visit(rule);
  // Scale: the tightest operator a grammar orders binds 200 (member access); the loosest binary
  // operator (logical or) binds 30, above the hand-written question (25) and assignment (20).
  const levels = [...infix.values(), ...prefix.values()].map((x) => x.level);
  const top = Math.max(...levels);
  const orLevel = infix.get("||")?.level ?? infix.get("or")?.level ?? Math.min(...levels);
  const scale = (l) => Math.round(30 + ((l - orLevel) * (200 - 30)) / Math.max(top - orLevel, 1));
  return {
    infix: new Map([...infix].map(([op, x]) => [op, { binds: scale(x.level), right: x.right }])),
    prefix: new Map([...prefix].map(([op, x]) => [op, { binds: scale(x.level) }])),
  };
}

if (process.argv[1] && process.argv[1].endsWith("binds.mjs")) {
  for (const f of ["tree-sitter-typescript/typescript/src/grammar.json", "tree-sitter-python/src/grammar.json"]) {
    const d = deriveBinds(f);
    console.log(f, "\n infix:", [...d.infix].map(([k, v]) => `${k}=${v.binds}${v.right ? "R" : ""}`).join(" "), "\n prefix:", [...d.prefix].map(([k, v]) => `${k}=${v.binds}`).join(" "));
  }
}
