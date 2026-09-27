// @realization Sequence(Rest($steps)), context = Explaining()
// Steps said in order.
async (args, bindings, api) => {
  // A body's closing Undefined() (it gives back nothing) is not a step to say.
  const parts = args.map((a) => a.value).filter((p) => !(p !== null && typeof p === "object" && p.head === "Undefined" && !p.args.length));
  if (parts.some((p) => typeof p !== "string")) return api.call("Sequence", ...parts);
  return parts.length ? parts.join(", then ") : "nothing";
};
