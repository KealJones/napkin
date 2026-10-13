// @realization Unworked(Rest($x)), context = Speaking(), evaluateArguments = false
// A situation read but not worked out: what was read, said honestly, instead of a guess.
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const read = named("read");
  const amounts = read && read.args ? read.args.map((a) => String(a.value)) : [];
  if (!amounts.length) return "";
  return "I read " + amounts.join(", ") + ", but I couldn't work out how they come together to answer that yet.";
};
