// @realization HowMany(Rest($x)), context = Execution(), evaluateArguments = false
// How many of one unit are in another ("how many ounces in a pound", heard as Ounces(In(Pound()))
// or as Ounces() beside In(Pound())): each in the SI unit of its kind, divided. A Quantity of the
// first unit. Anything else stays as said.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = args.map((a) => a.value);
  let a = undefined;
  let b = undefined;
  if (said.length === 1 && isCall(said[0]) && said[0].args.length === 1 && isCall(said[0].args[0].value) && said[0].args[0].value.head === "In") {
    a = { head: said[0].head, args: [] };
    b = said[0].args[0].value.args[0]?.value;
  } else if (said.length === 2 && isCall(said[0]) && !said[0].args.length && isCall(said[1]) && said[1].head === "In") {
    a = said[0];
    b = said[1].args[0]?.value;
  }
  if (!isCall(a) || !isCall(b)) return api.call("HowMany", ...said);
  const inA = await api.evaluate(api.call("InSI", a));
  const inB = await api.evaluate(api.call("InSI", b));
  const ok = (q) => isCall(q) && typeof q.args[1]?.value === "number";
  if (!ok(inA) || !ok(inB) || api.format(inA.args[2].value) !== api.format(inB.args[2].value)) return api.call("HowMany", ...said);
  const from = [inA, inB].map((q) => q.args.find((x) => x.name === "from")).filter(Boolean);
  return { head: "Quantity", args: [{ value: inB.args[1].value / inA.args[1].value }, { name: "unit", value: a }, ...from] };
};
