// @realization Traverse($xs, $direction), context = Execution()
// A primitive: a sequence (a list, or text as its letters) gone through from one end to the other,
// giving the same kind of sequence. First to last is as it is; last to first is the other way.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const xs = bindings.get("xs");
  const d = bindings.get("direction");
  const end = (i) => (isCall(d) && d.head === "Direction" && isCall(d.args[i]?.value) ? d.args[i].value.head : undefined);
  const from = end(0);
  if (!["First", "Last"].includes(from) || end(1) === from) return api.call("Traverse", xs, d);
  if (typeof xs === "string") return from === "First" ? xs : [...xs].reverse().join("");
  if (isCall(xs) && xs.head === "List") return from === "First" ? xs : api.call("List", ...xs.args.map((a) => a.value).reverse());
  return api.call("Traverse", xs, d);
};
