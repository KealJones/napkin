// @realization DirectionOf($xs), context = Execution()
// A sequence (a list, or text) runs from its first item to its last.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const xs = bindings.get("xs");
  return typeof xs === "string" || (isCall(xs) && xs.head === "List") ? api.call("Direction", api.call("First"), api.call("Last")) : api.call("DirectionOf", xs);
};
