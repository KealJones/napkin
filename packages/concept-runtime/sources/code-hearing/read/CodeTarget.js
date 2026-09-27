// What is bound: a name, or a pattern of names ({ a, b: c }, [a, ...b]), with its type set aside.
const e = parts[0];
if (!isCall(e)) return e;
const p = positional(e);
if (is(e, "Identifier") && p.length === 0) return variable(e);
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
return read(e);
