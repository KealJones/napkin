// @realization Either($a, $b), context = Speaking(), evaluateArguments = false
// Two answers for two ways the words can be taken: "If you mean the most height, Mauna Kea (...);
// if the most elevation above sea level, Mount Everest (...)."
async (args, bindings, api) => {
  const one = async (e) => {
    const s = await api.evaluate(e, api.call("Speaking"));
    return typeof s === "string" ? s.replace(/\.$/, "") : api.format(e);
  };
  const way = (e) => {
    const p = e.args.filter((a) => a.name === undefined);
    const most = e.args.find((a) => a.name === "most")?.value;
    return (most === false ? "the least " : "the most ") + String(p[3]?.value ?? "");
  };
  const a = bindings.get("a");
  const b = bindings.get("b");
  return "If you mean " + way(a) + ", " + (await one(a)) + "; if " + way(b) + ", " + (await one(b)) + ".";
};
