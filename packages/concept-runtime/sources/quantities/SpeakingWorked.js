// @realization Worked(Rest($x)), context = Speaking(), evaluateArguments = false
// A situation worked out, said with its working so it can be checked: what was worked out from
// what was said ("twice of 20 sheep = 40"), each step, then the answer. Not sure of the reading,
// it says so first.
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const answer = named("answer");
  if (typeof answer !== "string" || !answer) return "";
  const list = (n) => {
    const v = named(n);
    return v && v.args ? v.args.map((a) => String(a.value)) : [];
  };
  const working = [...list("read"), ...list("steps")];
  const said = working.length ? working.join("; ") + ". " : "";
  if (named("sure") === true) return said + "So " + answer + ".";
  return "I'm not sure I read it right. " + said + "My best reading gives " + answer + ".";
};
