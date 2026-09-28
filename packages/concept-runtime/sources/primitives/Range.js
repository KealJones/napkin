// @realization Range($from, $to), context = Execution()
// The whole numbers from one up to, not including, another.
async (args, bindings, api) => {
  const from = bindings.get("from");
  const to = bindings.get("to");
  if (!Number.isInteger(from) || !Number.isInteger(to) || to - from > 100000) return api.call("Range", from, to);
  const out = [];
  for (let i = from; i < to; i++) out.push(i);
  return api.call("List", ...out);
};
