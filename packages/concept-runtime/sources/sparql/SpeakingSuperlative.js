// @realization Superlative(Rest($x)), context = Speaking(), evaluateArguments = false
// "Mount Everest (8848.86 metres of elevation above sea level)."
async (args, bindings, api) => {
  const say = async (e) => {
    const w = await api.evaluate(api.call("Words", e), api.call("Execution"));
    return typeof w === "string" ? w : api.format(e);
  };
  const p = args.filter((a) => a.name === undefined).map((a) => a.value);
  const n = Number(Number(p[1]).toPrecision(8));
  const name = await say(p[0]);
  return name[0].toUpperCase() + name.slice(1) + " (" + n + (p[2] ? " " + p[2] + "s" : "") + " of " + p[3] + ").";
};
