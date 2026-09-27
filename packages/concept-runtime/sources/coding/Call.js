// @realization Call($f, Rest($with)), context = Explaining(), evaluateArguments = false
// A call said: "calls print with x"; a member called is said as written, "console.log".
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = async (e) => {
    if (isCall(e) && e.head === "Member" && e.args.length === 2) {
      const o = await said(e.args[0].value);
      return typeof o === "string" ? o + "." + String(e.args[1].value) : o;
    }
    return api.evaluate(e, api.context);
  };
  const f = await said(args[0].value);
  const xs = [];
  for (const a of args.slice(1)) xs.push(await api.evaluate(a.value, api.context));
  if (typeof f !== "string" || xs.some((x) => typeof x !== "string" && typeof x !== "number")) return api.call("Call", f, ...xs);
  const list = xs.map(String);
  const joined = list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  return list.length ? "calls " + f + " with " + joined : "calls " + f;
};
