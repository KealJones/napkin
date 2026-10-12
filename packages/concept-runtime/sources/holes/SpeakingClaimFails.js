// @realization ClaimFails(Rest($x)), context = Speaking(), evaluateArguments = false
// "It's actually 4, not 5."
async (args, bindings, api) => {
  const say = async (e) => {
    const r = await api.evaluate(api.call("Say", e), api.call("Execution"));
    return (typeof r === "string" && r ? r : String(e)).replace(/[.!?]+$/, "");
  };
  return "It's actually " + (await say(args[0].value)) + ", not " + (await say(args[1].value)) + ".";
};
