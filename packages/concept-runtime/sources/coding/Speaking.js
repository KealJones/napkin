// @realization Explained(Rest($x)), context = Speaking(), evaluateArguments = false
// Code said in words (and where what it says about a method came from, from = ..., not said).
async (args, bindings, api) => {
  const w = String(args.filter((a) => a.name === undefined)[1]?.value ?? "");
  return "Here's what it does: " + w + (/[.!?]$/.test(w) ? "" : ".");
};
