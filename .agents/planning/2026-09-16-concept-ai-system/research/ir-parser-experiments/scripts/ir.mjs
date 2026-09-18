// Independent reference parser for the IR grammar as specified.
// expr := number | string | true | false | null | $name | Head( args? )
// args := arg (, arg)*   ;  arg := (name=)? expr   ; Head starts uppercase.
export function parse(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const fail = (m) => { throw new Error(m + " @" + i); };
  function value() {
    ws();
    const c = src[i];
    if (c === undefined) fail("eof");
    if (c === '"') return str();
    if (c === "$") { i++; return { variable: ident() }; }
    if (c === "-" || /[0-9]/.test(c)) return num();
    if (/[A-Za-z_]/.test(c)) return headOrKeyword();
    fail("unexpected " + JSON.stringify(c));
  }
  function str() {
    const start = i; i++;
    let esc = false;
    while (i < src.length) {
      const ch = src[i++];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') return JSON.parse(src.slice(start, i));
    }
    fail("unterminated string");
  }
  function num() {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) fail("bad number");
    i += m[0].length; return Number(m[0]);
  }
  function ident() {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!m) fail("bad identifier");
    i += m[0].length; return m[0];
  }
  function headOrKeyword() {
    const name = ident();
    ws();
    if (src[i] !== "(") {
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "null") return null;
      fail("bare identifier " + name);
    }
    if (!/^[A-Z]/.test(name)) fail("head must be Capitalized: " + name);
    i++; ws();
    const args = [];
    if (src[i] === ")") { i++; return { head: name, args }; }
    for (;;) {
      ws();
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(src.slice(i));
      let nm;
      if (m) { nm = m[1]; i += m[0].length; }
      const v = value();
      args.push(nm === undefined ? { value: v } : { name: nm, value: v });
      ws();
      if (src[i] === ")") { i++; break; }
      if (src[i] !== ",") fail("expected , or )");
      i++;
    }
    return { head: name, args };
  }
  const out = value();
  ws();
  if (i !== src.length) fail("trailing input");
  return out;
}
export const isCall = (e) => !!e && typeof e === "object" && "head" in e;
export const depth = (e) => isCall(e) ? 1 + Math.max(0, ...e.args.map(a => depth(a.value))) : 0;
export function heads(e, acc = new Set()) {
  if (!isCall(e)) return acc;
  acc.add(e.head);
  for (const a of e.args) heads(a.value, acc);
  return acc;
}
export function namedCount(e, c = { named: 0, pos: 0 }) {
  if (!isCall(e)) return c;
  for (const a of e.args) { a.name === undefined ? c.pos++ : c.named++; heads && namedCount(a.value, c); }
  return c;
}
