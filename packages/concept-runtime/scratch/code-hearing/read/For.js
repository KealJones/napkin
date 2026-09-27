// "for" holding "x of xs" loops over the values of xs, "x in xs" over its keys; "(init; test; next)" counts. The rest is its body.
const [header, ...rest] = parts;
const body = await ask("CodeStatements", ...rest);
const LOOPS = { Of: "ForOf", In: "ForIn" };
if (isCall(header) && LOOPS[header.head] && positional(header).length === 2) {
  let x = positional(header)[0];
  if (isCall(x) && ["Const", "Let", "Var"].includes(x.head)) x = positional(x)[0];
  return api.call(LOOPS[header.head], await ask("CodeTarget", x), await read(positional(header)[1]), body);
}
if (is(header, "Parens")) { const [i, t, n] = positional(header); return api.call("For", await read(i), await read(t), await read(n), body); }
return api.call("For", await read(header), body);
