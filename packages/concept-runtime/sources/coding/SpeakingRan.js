// @realization Ran(Rest($what)), context = Speaking(), evaluateArguments = false
// What running code gave, or why it failed.
async (args, bindings, api) => {
  const error = args.find((a) => a.name === "error")?.value;
  if (error !== undefined) return "Running it failed: " + String(error) + ".";
  if (args.find((a) => a.name === undefined) === undefined) return "It ran.";
  const v = args[0].value;
  const said = typeof v === "string" ? JSON.stringify(v) : v === undefined || v === null || (typeof v === "object" && v.head === "Undefined") ? "nothing" : typeof v === "object" ? api.format(v) : String(v);
  return "It gives " + said + ".";
};
