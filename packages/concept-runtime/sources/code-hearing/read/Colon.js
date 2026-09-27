// "const x: number = 1": a declaration with its type. Elsewhere a colon pairs a key with its value.
const [place, rest] = parts;
const DECLARES = { Const: "Bind", Let: "Var", Var: "Var" };
if (isCall(place) && DECLARES[place.head]) {
  const target = await ask("CodeTarget", positional(place)[0]);
  const hasValue = is(rest, "Assign") && positional(rest).length === 2;
  const type = hasValue ? positional(rest)[0] : rest;
  return { head: DECLARES[place.head], args: [{ value: target }, { value: hasValue ? await read(positional(rest)[1]) : api.call("Undefined") }, { name: "type", value: type }] };
}
return api.call("Colon", await read(place), await read(rest));
