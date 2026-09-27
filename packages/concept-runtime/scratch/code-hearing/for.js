async (args, bindings, api) => {
  // "for" holding "x of xs" loops over the values of xs, "x in xs" over its keys; what else
  // it holds is the loop's body. A binding word before x (const, let) says how x is declared.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const [header, ...body] = args.map((a) => a.value);
  const LOOPS = __LOOPS__;
  if (!isCall(header) || !LOOPS[header.head] || header.args.length !== 2) return api.call("For", header, ...body);
  let x = header.args[0].value;
  if (isCall(x) && ["Const", "Let", "Var"].includes(x.head) && x.args.length === 1) x = x.args[0].value;
  const block = body.length === 1 ? body[0] : api.call("Sequence", ...body);
  return api.call(LOOPS[header.head], x, header.args[1].value, block);
}
