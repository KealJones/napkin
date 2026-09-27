// SPIKE: how heard words read as the code IR, for gen.mjs: realizations under
// Context(Code(<language>), Reading()), by head. Snippets read the parts they need.
import { js, reads, keeps, readsWord, READS_PY } from "./lib.mjs";

const PY = { context: READS_PY };
const w = readsWord;
const keepAll = (heads) => Object.fromEntries(heads.map((h) => [h, [keeps(h)]]));

export const READINGS = {
  // An operator or a leading word reads as the Concept it is a synonym of ("+" is Plus, a
  // synonym of Add), or else as itself, its arguments read; alone, a leading word that is only
  // a name here ("type", "from") is that name.
  Infix: [reads("$word", js("reads-as.js"))],
  Prefix: [reads("$word", js("reads-as.js"))],
  Concept: [reads("$word", js("read-default.js"))],
  Phrases: [reads("Phrases(Rest($statements))", js("phrases.js"))],
  Numeral: [reads("Numeral($said)", js("number.js", { __SUFFIX__: '{ n: "BigInt" }' })), reads("Numeral($said)", js("number.js", { __SUFFIX__: "{}" }), PY)],
  ...keepAll(["Comment", "Regex", "Else", "Break", "Continue", "Return", "Yield"]),
  Parens: [w('"(a, b)" as a value: a then b, giving b.', `if (parts.length < 2) return self; const xs = []; for (const x of parts) xs.push(await read(x)); return api.call("Sequence", ...xs);`)],
  Plus: [w('"+x" is x as a number, as the language reads it; "a + b" adds.', `return parts.length === 1 ? read(parts[0]) : api.call("Add", await read(parts[0]), await read(parts[1]));`)],
  // Angles say at what types a name is used: kept as said, not read as code.
  Angles: [w("Types a name is used at, kept as said.", `return self;`)],
  Minus: [reads("Minus($a)", "Negate($a)")],
  Dot: [reads("$word", js("dot.js"), { evaluate: false })],
  // The helpers the readings ask: what a pattern binds, a function's parameters and body.
  CodeTarget: [
    w(
      "What is bound: a name, or a pattern of names ({ a, b: c }, [a, ...b]), with its type set aside.",
      `const e = parts[0];
  if (!isCall(e)) return e;
  const p = positional(e);
  if ((is(e, "Colon") || is(e, "OptionalColon")) && p.length === 2) {
    // The type may itself be a function type: the default is at its far end ("f: () => T = g").
    let t = p[1];
    while (is(t, "Arrow") && positional(t).length === 2) t = positional(t)[1];
    return is(t, "Assign") && positional(t).length === 2 ? api.call("Default", await ask("CodeTarget", p[0]), await read(positional(t)[1])) : ask("CodeTarget", p[0]);
  }
  if (["Readonly", "Private", "Public", "Protected"].includes(e.head) && p.length === 1) return ask("CodeTarget", p[0]);
  if (is(e, "Spread")) return api.call("Spread", await ask("CodeTarget", p[0]));
  if (is(e, "Assign") && p.length === 2) return api.call("Default", await ask("CodeTarget", p[0]), await read(p[1]));
  if (is(e, "Brackets")) { const xs = []; for (const x of p) xs.push(await ask("CodeTarget", x)); return api.call("List", ...xs); }
  if (is(e, "Braces")) {
    const items = [];
    for (const item of p) {
      if (is(item, "Colon") && positional(item).length === 2) items.push({ name: nameOf(positional(item)[0]), value: await ask("CodeTarget", positional(item)[1]) });
      else if (is(item, "Spread")) items.push({ value: await ask("CodeTarget", item) });
      else if (is(item, "Assign")) items.push({ name: nameOf(positional(item)[0]), value: await ask("CodeTarget", item) });
      else items.push({ name: nameOf(item), value: variable(item) });
    }
    return { head: "Object", args: items };
  }
  if (p.length === 0 && e.args.every((a) => a.name === "said")) return variable(e);
  return read(e);`,
    ),
  ],
  CodeParams: [
    w(
      "Parameters: names, defaults, rest, patterns, their types set aside.",
      `const list = is(parts[0], "Parens") ? positional(parts[0]) : parts;
  const out = [];
  for (const x of list) out.push(await ask("CodeTarget", x));
  return api.call("List", ...out);`,
    ),
  ],
  CodeBody: [
    w(
      "A function's statements: what it gives is undefined unless it ends by returning.",
      `const steps = [];
  for (const s of parts) {
    const r = await read(s);
    if (!(is(r, "Undefined") && r.args.length === 0)) steps.push(r);
  }
  const last = steps[steps.length - 1];
  if (!is(last, "Return") && !is(last, "Throw")) steps.push(api.call("Undefined"));
  return steps.length === 1 ? steps[0] : api.call("Sequence", ...steps);`,
    ),
  ],
  CodeStatements: [
    w(
      "Statements in order: one is itself, none is undefined.",
      `const xs = [];
  for (const s of parts) xs.push(await read(s));
  return xs.length === 0 ? api.call("Undefined") : xs.length === 1 ? xs[0] : api.call("Sequence", ...xs);`,
    ),
  ],
  // Declarations and assignment.
  Assign: [
    w(
      '"x = 1": x now holds 1. Said with a binding word it declares x: const once (Bind), let or var to change (Var).',
      `const [place, value] = parts;
  const DECLARES = { Const: "Bind", Let: "Var", Var: "Var" };
  if (isCall(place) && DECLARES[place.head] && positional(place).length === 1) return api.call(DECLARES[place.head], await ask("CodeTarget", positional(place)[0]), await read(value));
  return api.call("Assign", await read(place), await read(value));`,
    ),
    w(
      'In Python, "x = 1" to a bare name is where x begins: a variable that can change (Var).',
      `const [place, value] = parts;
  const p = await read(place);
  const bare = p !== null && typeof p === "object" && "variable" in p;
  return api.call(bare ? "Var" : "Assign", p, await read(value));`,
      READS_PY,
    ),
  ],
  Colon: [
    w(
      '"const x: number = 1": a declaration with its type. Elsewhere a colon pairs a key with its value.',
      `const [place, rest] = parts;
  const DECLARES = { Const: "Bind", Let: "Var", Var: "Var" };
  if (isCall(place) && DECLARES[place.head]) {
    const target = await ask("CodeTarget", positional(place)[0]);
    const hasValue = is(rest, "Assign") && positional(rest).length === 2;
    const type = hasValue ? positional(rest)[0] : rest;
    return { head: DECLARES[place.head], args: [{ value: target }, { value: hasValue ? await read(positional(rest)[1]) : api.call("Undefined") }, { name: "type", value: type }] };
  }
  return api.call("Colon", await read(place), await read(rest));`,
    ),
  ],
  Let: [w('"let y": y, holding nothing yet.', `return parts.length === 1 ? api.call("Var", await ask("CodeTarget", parts[0]), api.call("Undefined")) : api.call("Let", ...parts);`)],
  Var: [w('"var y": y, holding nothing yet.', `return parts.length === 1 ? api.call("Var", await ask("CodeTarget", parts[0]), api.call("Undefined")) : api.call("Var", ...parts);`)],
  PlusAssign: [reads("PlusAssign($x, $v)", "Assign($x, Add($x, $v))")],
  MinusAssign: [reads("MinusAssign($x, $v)", "Assign($x, Subtract($x, $v))")],
  TimesAssign: [reads("TimesAssign($x, $v)", "Assign($x, Multiply($x, $v))")],
  OrAssign: [reads("OrAssign($x, $v)", "Assign($x, Or($x, $v))")],
  AndAssign: [reads("AndAssign($x, $v)", "Assign($x, And($x, $v))")],
  OtherwiseAssign: [reads("OtherwiseAssign($x, $v)", "Assign($x, Otherwise($x, $v))")],
  // Functions.
  Arrow: [
    w(
      '"(a, b) => a + b": a function of its parameters; a block after it is its body.',
      `const [ps, b] = parts;
  let head = ps;
  let async = false;
  if (is(head, "Returns")) head = positional(head)[0];
  if (is(head, "Async")) { async = true; head = positional(head)[0] ?? api.call("Parens"); }
  const params = await ask("CodeParams", head);
  const body = is(b, "Block") ? await ask("CodeBody", ...positional(b)) : await read(b);
  const f = api.call("Lambda", params, body);
  return async ? api.call("Async", f) : f;`,
    ),
  ],
  Function: [
    w(
      '"function f(a) { ... }": the name, what it takes, and the block it does.',
      `let sig = parts[0];
  let block = [];
  if (is(sig, "Returns")) { block = positional(sig).filter((x) => is(x, "Block")); sig = positional(sig)[0]; }
  if (!isCall(sig)) return api.call("Func", ...parts);
  const ps = positional(sig);
  const own = ps.filter((x) => is(x, "Block"));
  const blk = [...own, ...block][0];
  const params = ps.filter((x) => !is(x, "Block") && !is(x, "Parens") && !is(x, "Angles"));
  const out = [];
  for (const x of params) out.push(await ask("CodeTarget", x));
  const statements = blk ? positional(blk) : parts.slice(1);
  return api.call("Func", variable(sig), api.call("List", ...out), await ask("CodeBody", ...statements));`,
    ),
  ],
  Def: [
    w(
      '"def f(a):" and its block: the name, what it takes, what it does.',
      `const sig = parts[0];
  const ps = positional(sig);
  const blk = ps.find((x) => is(x, "Block"));
  const out = [];
  for (const x of ps.filter((x) => !is(x, "Block") && !is(x, "Parens"))) out.push(await ask("CodeTarget", x));
  return api.call("Func", variable(sig), api.call("List", ...out), await ask("CodeBody", ...(blk ? positional(blk) : parts.slice(1))));`,
      READS_PY,
    ),
  ],
  New: [w('"new Foo(1)": a new Foo made with 1.', `const made = await read(parts[0]); return is(made, "Call") ? api.call("New", ...positional(made)) : api.call("New", made);`)],
  // Control.
  If: [
    w(
      '"if" holds a condition, then what to do, then (after "else") what to do otherwise.',
      `const [condition, ...rest] = parts;
  const last = rest[rest.length - 1];
  const otherwise = is(last, "Else") ? positional(rest.pop()) : [];
  return api.call("If", await read(condition), await ask("CodeStatements", ...rest), await ask("CodeStatements", ...otherwise));`,
    ),
  ],
  Question: [reads("Question($a, $b, $c)", "If($a, $b, $c)")],
  For: [
    w(
      '"for" holding "x of xs" loops over the values of xs, "x in xs" over its keys; "(init; test; next)" counts. The rest is its body.',
      `const [header, ...rest] = parts;
  const body = await ask("CodeStatements", ...rest);
  const LOOPS = __LOOPS__;
  if (isCall(header) && LOOPS[header.head] && positional(header).length === 2) {
    let x = positional(header)[0];
    if (isCall(x) && ["Const", "Let", "Var"].includes(x.head)) x = positional(x)[0];
    return api.call(LOOPS[header.head], await ask("CodeTarget", x), await read(positional(header)[1]), body);
  }
  if (is(header, "Parens")) { const [i, t, n] = positional(header); return api.call("For", await read(i), await read(t), await read(n), body); }
  return api.call("For", await read(header), body);`.replace("__LOOPS__", '{ Of: "ForOf", In: "ForIn" }'),
    ),
    w(
      'In Python, "for x in xs" loops over the values of xs.',
      `const [header, ...rest] = parts;
  if (is(header, "In")) return api.call("ForOf", await ask("CodeTarget", positional(header)[0]), await read(positional(header)[1]), await ask("CodeStatements", ...rest));
  return api.call("For", ...parts);`,
      READS_PY,
    ),
  ],
  While: [w('"while (c) ...": while c holds, its body.', `return api.call("While", await read(parts[0]), await ask("CodeStatements", ...parts.slice(1)));`)],
  Try: [
    w(
      '"try" its block, "catch (e)" what to do on failure, "finally" what to do after either.',
      `const done = parts.filter((x) => !is(x, "Catch") && !is(x, "Finally"));
  const caught = parts.find((x) => is(x, "Catch"));
  const after = parts.find((x) => is(x, "Finally"));
  let t = api.call("Try", await ask("CodeStatements", ...done));
  if (caught) {
    const cs = positional(caught);
    const said = is(cs[0], "Parens") ? positional(cs[0]) : undefined;
    const param = said && said.length ? await ask("CodeTarget", said[0]) : api.fromHost({ variable: "_" });
    t = api.call("Try", ...positional(t), api.call("Catch", param, await ask("CodeStatements", ...(said ? cs.slice(1) : cs))));
  } else t = api.call("Try", ...positional(t), api.call("Undefined"));
  return after ? api.call("Finally", t, await ask("CodeStatements", ...positional(after))) : t;`,
    ),
  ],
  // Values.
  Braces: [
    w(
      '"{ a: 1, b, ...r, m() {} }": an object, each key with its value.',
      `const NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const items = [];
  const put = (k, v) => items.push(typeof k === "string" && NAME.test(k) ? { name: k, value: v } : { value: api.call("Pair", k, v) });
  for (const item of parts) {
    if (is(item, "Comment")) continue;
    const p = isCall(item) ? positional(item) : [];
    if (is(item, "Colon") && p.length === 2) {
      const k = p[0];
      put(is(k, "Brackets") ? await read(positional(k)[0]) : typeof k === "string" ? k : nameOf(k), await read(p[1]));
    } else if (is(item, "Spread")) items.push({ value: await read(item) });
    else if (isCall(item) && p.some((x) => is(x, "Block"))) {
      const blk = p.find((x) => is(x, "Block"));
      const ps = [];
      for (const x of p.filter((x) => !is(x, "Block") && !is(x, "Parens"))) ps.push(await ask("CodeTarget", x));
      items.push({ value: api.call("Method", nameOf(item), api.call("List", ...ps), await ask("CodeBody", ...positional(blk))) });
    } else if (isCall(item) && p.length === 0) put(nameOf(item), variable(item));
    else items.push({ value: await read(item) });
  }
  return { head: "Object", args: items };`,
    ),
  ],
  Brackets: [
    w(
      '"[1, 2]": a list; with spreads, the lists joined: [...a, x] is Concat(a, List(x)).',
      `const runs = [];
  let run = [];
  let spread = false;
  for (const x of parts) {
    if (is(x, "Comment")) continue;
    if (is(x, "Spread")) {
      if (run.length) runs.push(api.call("List", ...run));
      run = [];
      spread = true;
      runs.push(await read(positional(x)[0]));
    } else run.push(await read(x));
  }
  if (!spread) return api.call("List", ...run);
  if (run.length) runs.push(api.call("List", ...run));
  return api.call("Concat", ...runs);`,
    ),
  ],
  Index: [w('"a[0]": what a holds at 0; "T[]", a type, is kept as said.', `return parts.length === 2 ? api.call("Index", await read(parts[0]), await read(parts[1])) : self;`)],
  OptionalDot: [
    w(
      '"a?.b": a\'s member b, if there is an a.',
      `const [owner, member] = parts;
  const o = await read(owner);
  if (is(member, "Brackets") && positional(member).length === 1) return api.call("OptionalIndex", o, await read(positional(member)[0]));
  if (is(member, "Parens")) { const xs = []; for (const x of positional(member)) xs.push(await read(x)); return api.call("OptionalCall", o, ...xs); }
  const got = api.call("OptionalMember", o, nameOf(member));
  const xs = [];
  for (const x of isCall(member) ? positional(member) : []) if (!is(x, "Parens")) xs.push(await read(x));
  return isCall(member) && positional(member).length ? api.call("Call", got, ...xs) : got;`,
    ),
  ],
  Template: [
    w(
      '"`a${b}c`": its pieces of text and what is between them, joined.',
      `let acc = await read(parts[0]);
  for (let i = 1; i < parts.length; i += 2) {
    acc = api.call("Add", acc, await read(parts[i]));
    if (parts[i + 1] !== undefined && parts[i + 1] !== "") acc = api.call("Add", acc, parts[i + 1]);
  }
  return acc;`,
    ),
  ],
  Not: [w('"!x" is not x; said after, "x!" only says x is there.', `return named("after") ? read(parts[0]) : api.call("Not", await read(parts[0]));`)],
  Increment: [w('"x++" and "++x".', `return api.call(named("after") ? "PostIncrement" : "PreIncrement", await read(parts[0]));`)],
  Decrement: [w('"x--" and "--x".', `return api.call(named("after") ? "PostDecrement" : "PreDecrement", await read(parts[0]));`)],
  As: [w('"x as T": x, its type said.', `return read(parts[0]);`)],
  Satisfies: [w('"x satisfies T": x.', `return read(parts[0]);`)],
  // Modules.
  Import: [
    w(
      '"import { a, b as c } from \'x\'": the names it brings in, and from where.',
      `let e = parts[0];
  if (is(e, "Type")) e = positional(e)[0];
  if (is(e, "Parens")) { const xs = []; for (const x of positional(e)) xs.push(await read(x)); return api.call("DynamicImport", ...xs); }
  if (!is(e, "From")) return api.call("Import", api.call("List"), await read(e));
  const [what, source] = positional(e);
  const names = [];
  const add = (x) => {
    if (is(x, "Type")) return add(positional(x)[0]);
    if (is(x, "As")) return names.push(variable(positional(x)[1]));
    names.push(variable(x));
  };
  for (const x of is(what, "Braces") ? positional(what) : [what]) add(x);
  return api.call("Import", api.call("List", ...names), await read(source));`,
    ),
  ],
  Export: [
    w(
      '"export": what the module gives: a declaration, some names, or all of another module.',
      `const e = parts[0];
  const bare = (x) => (is(x, "Type") && positional(x).length ? positional(x)[0] : x);
  const names = (b) => positional(b).filter((x) => !is(x, "Comment")).map((x) => bare(x)).map((x) => (is(x, "As") ? api.call("As", variable(positional(x)[0]), nameOf(positional(x)[1])) : variable(x)));
  if (is(e, "Braces")) return api.call("ReExport", api.call("List", ...names(e)));
  if (is(e, "From")) {
    const [what, source] = positional(e);
    return api.call("ReExport", is(what, "Braces") ? api.call("List", ...names(what)) : api.call("All"), await read(source));
  }
  if (is(e, "Default")) return api.call("ExportDefault", await read(positional(e)[0]));
  const inner = await read(e);
  return is(inner, "Erased") ? inner : api.call("Export", inner);`,
    ),
  ],
  // Types say what things are; the module's code does not run them.
  Type: [w("A type alias.", `return parts.length ? api.call("Erased") : variable(self);`)],
  Interface: [w("An interface.", `return parts.length ? api.call("Erased") : variable(self);`)],
  Declare: [w("A declaration of what exists elsewhere.", `return parts.length ? api.call("Erased") : variable(self);`)],
  // A class: its name, what it extends, its members.
  Class: [
    w(
      '"class A extends B { ... }": its members, each a field, a constructor, a method or a getter.',
      `let [head, ...members] = parts;
  let base;
  if (is(head, "Extends")) { base = positional(head)[1]; head = positional(head)[0]; }
  if (is(head, "Implements")) head = positional(head)[0];
  const member = async (m) => {
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
  return api.call("Class", variable(head), base !== undefined ? api.call("Extends", await read(base)) : api.call("Undefined"), api.call("List", ...out));`,
    ),
  ],
  // The words the language gives values.
  True: [reads("True(Rest($_))", "true")],
  False: [reads("False(Rest($_))", "false")],
  Null: [reads("Null(Rest($_))", "null")],
  Undefined: [reads("Undefined(Rest($_))", "Undefined()")],
  This: [reads("This(Rest($_))", "This()")],
  Super: [w('"super(a)": the class this extends, called.', `const xs = []; for (const x of parts) if (!is(x, "Parens")) xs.push(await read(x)); return parts.length ? api.call("Call", api.call("Super"), ...xs) : api.call("Super");`)],
  None: [reads("None(Rest($_))", "null", PY)],
  Pass: [reads("Pass()", "Undefined()", PY)],
};
