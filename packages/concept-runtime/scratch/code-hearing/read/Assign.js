// "x = 1": x now holds 1. Said with a binding word it declares x: const once (Bind), let or var to change (Var).
const [place, value] = parts;
const DECLARES = { Const: "Bind", Let: "Var", Var: "Var" };
if (isCall(place) && DECLARES[place.head] && positional(place).length === 1) return api.call(DECLARES[place.head], await ask("CodeTarget", positional(place)[0]), await read(value));
return api.call("Assign", await read(place), await read(value));
