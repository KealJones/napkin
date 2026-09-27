// "class A extends B { ... }": its members, each a field, a constructor, a method or a getter.
let [head, ...members] = parts;
let base;
if (is(head, "Extends")) { base = positional(head)[1]; head = positional(head)[0]; }
if (is(head, "Implements")) head = positional(head)[0];
const member = async (m) => {
  // A method's return type holds its signature: its modifiers are inside ("get x(): T {").
  if (is(m, "Returns")) {
    const [sig, ...rest] = positional(m);
    const blk = rest.find((x) => is(x, "Block"));
    let inner = sig;
    const mods = [];
    while (isCall(inner) && ["Static", "Private", "Readonly", "Public", "Protected", "Abstract", "Async", "Get", "Set"].includes(inner.head) && positional(inner).length === 1) {
      mods.push(inner.head);
      inner = positional(inner)[0];
    }
    let out = await member(blk && isCall(inner) ? { head: inner.head, args: [...inner.args, { value: blk }] } : inner);
    for (const mod of mods.reverse()) {
      if (mod === "Get" && is(out, "Method")) out = api.call("Getter", positional(out)[0], positional(out)[2]);
      else if (!["Public", "Protected", "Abstract"].includes(mod)) out = api.call(mod, out);
    }
    return out;
  }
  const p = isCall(m) ? positional(m) : [];
  for (const wrap of ["Static", "Private", "Readonly", "Public", "Protected", "Abstract", "Async"]) if (is(m, wrap)) {
    const inner = await member(p[0]);
    return wrap === "Public" || wrap === "Protected" || wrap === "Abstract" ? inner : api.call(wrap, inner);
  }
  if (is(m, "Get")) { const g = positional(p[0]); const blk = g.find((x) => is(x, "Block")); return api.call("Getter", nameOf(p[0]), await ask("CodeBody", ...(blk ? positional(blk) : []))); }
  // A field: its modifiers are said on its name ("private readonly x: T = v").
  if (is(m, "Assign") || is(m, "Colon") || is(m, "OptionalColon")) {
    let target = p[0];
    const mods = [];
    while (isCall(target) && ["Static", "Private", "Readonly", "Public", "Protected", "Abstract", "Declare"].includes(target.head)) {
      mods.push(target.head);
      target = positional(target)[0];
    }
    const value = is(m, "Assign") ? await read(p[1]) : is(p[1], "Assign") ? await read(positional(p[1])[1]) : api.call("Undefined");
    let field = api.call("Field", nameOf(is(target, "Colon") ? positional(target)[0] : target), value);
    for (const mod of mods.reverse()) if (!["Public", "Protected", "Abstract", "Declare"].includes(mod)) field = api.call(mod, field);
    return field;
  }
  let sig = m;
  if (is(sig, "Returns")) sig = positional(sig)[0];
  const sp = isCall(sig) ? positional(sig) : [];
  const blk = [...sp, ...p].find((x) => is(x, "Block"));
  const ps = [];
  for (const x of sp.filter((x) => !is(x, "Block") && !is(x, "Parens") && !is(x, "Angles"))) ps.push(await ask("CodeTarget", x));
  const body = await ask("CodeBody", ...(blk ? positional(blk) : []));
  if (is(sig, "Constructor")) return api.call("Constructor", api.call("List", ...ps), await ask("CodeStatements", ...(blk ? positional(blk) : [])));
  return api.call("Method", nameOf(sig), api.call("List", ...ps), body);
};
const out = [];
for (const m of members) if (!is(m, "Comment")) out.push(await member(m));
return api.call("Class", variable(head), base !== undefined ? api.call("Extends", await read(base)) : api.call("Undefined"), api.call("List", ...out));
