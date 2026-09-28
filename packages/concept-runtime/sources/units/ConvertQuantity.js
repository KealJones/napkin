// @realization ConvertQuantity(Rest($x)), context = Execution(), evaluateArguments = false
// A quantity in another unit ("convert 5 miles to kilometres", "convert ounces to pounds"): the
// amount said (1 when none is), the first unit said and the one it goes to, each in the SI unit of
// its kind. Quantity(amount, To, of = Quantity(amount, From)). Anything else stays as said.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = args.map((a) => a.value);
  let amount = undefined;
  const units = [];
  const MARK = ["To", "Into", "In", "From", "Of", "Typed"];
  const look = (e) => {
    if (typeof e === "number" || (typeof e === "string" && /^-?\d+(\.\d+)?$/.test(e))) amount = amount ?? Number(e);
    if (!isCall(e)) return;
    if (!MARK.includes(e.head) && e.head !== "Ref") units.push({ head: e.head, args: [] });
    for (const a of e.args) if (a.name === undefined) look(a.value);
  };
  for (const e of said) look(e);
  if (units.length < 2) return api.call("ConvertQuantity", ...said);
  const [from, to] = units;
  const inFrom = await api.evaluate(api.call("InSI", from));
  const inTo = await api.evaluate(api.call("InSI", to));
  const ok = (q) => isCall(q) && typeof q.args[1]?.value === "number";
  if (!ok(inFrom) || !ok(inTo) || api.format(inFrom.args[2].value) !== api.format(inTo.args[2].value)) return api.call("ConvertQuantity", ...said);
  const n = amount ?? 1;
  const sources = [inFrom, inTo].map((q) => q.args.find((x) => x.name === "from")).filter(Boolean);
  return { head: "Quantity", args: [{ value: (n * inFrom.args[1].value) / inTo.args[1].value }, { name: "unit", value: to }, { name: "of", value: { head: "Quantity", args: [{ value: n }, { name: "unit", value: from }] } }, ...sources] };
};
