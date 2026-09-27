async (args, bindings, api) => {
  // "x = 1": x now holds 1. Said with a binding word, it declares x: const once (Bind), let or
  // var to change (Var).
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const [place, value] = args.map((a) => a.value);
  const DECLARES = { Const: "Bind", Let: "Var", Var: "Var" };
  if (isCall(place) && DECLARES[place.head] && place.args.length === 1) return api.call(DECLARES[place.head], place.args[0].value, value);
  return api.call("Assign", place, value);
}
