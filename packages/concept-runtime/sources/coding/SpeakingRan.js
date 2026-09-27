// @realization Ran(Rest($what)), context = Speaking(), evaluateArguments = false
// What running code gave, or why it failed.
async (args, bindings, api) => {
  const error = args.find((a) => a.name === "error")?.value;
  if (error !== undefined) return "Running it failed: " + String(error) + ".";
  if (args.find((a) => a.name === undefined) === undefined) return "It ran.";
  const v = args[0].value;
  // A value as code would write it, or as JSON when code can't write it (a record, say).
  const shown = (x) => {
    const w = api.writeCode(x, "JavaScript");
    return w.unwritable.length ? JSON.stringify(api.toHost(x)) : w.text;
  };
  const said = typeof v === "string" ? JSON.stringify(v) : v === undefined || v === null || (typeof v === "object" && v.head === "Undefined") ? "nothing" : typeof v === "object" ? "`" + shown(v) + "`" : String(v);
  return "It gives " + said + ".";
};
