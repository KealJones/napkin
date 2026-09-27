// "{ a: 1, b, ...r, m() {} }": an object, each key with its value.
const NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
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
return { head: "Object", args: items };
