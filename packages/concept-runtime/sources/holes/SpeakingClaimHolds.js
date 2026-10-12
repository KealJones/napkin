// @realization ClaimHolds(Rest($x)), context = Speaking(), evaluateArguments = false
// "Yes, that's 4."
async (args, bindings, api) => {
  const r = await api.evaluate(api.call("Say", args[0].value), api.call("Execution"));
  return "Yes, that's " + (typeof r === "string" && r ? r : String(args[0].value)).replace(/[.!?]+$/, "") + ".";
};
