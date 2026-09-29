// @realization Line($line), context = Execution(), evaluateArguments = false
// A line in any other mood (a command): read, and done. A word alone that does nothing as a
// command ("milk", after making a shopping list) may be a thing for a holder just made.
async (args, bindings, api) => {
  const line = await api.evaluate(api.call("Read", bindings.get("line")));
  const since = api.trace.mark();
  const done = await api.evaluate(line, api.context);
  // Undone: as it was said, not known, or something that stayed as it was said.
  const undone = (v, l) => {
    let core = v;
    for (const wrap of ["Answer", "Unknown"]) if (core && core.head === wrap && core.args.length) core = core.args[0].value;
    const held = api.format(core);
    return held === api.format(l) || (v && v.head === "Unknown") || (core && core.head === "Unknown") || api.trace.residuals(since).some((e) => e.output && api.format(e.output) === held);
  };
  // What it left undone ("give me a cake recipe"), looked for further.
  if (line && line.head && line.args.length && undone(done, line)) {
    const found = await api.evaluate(api.call("Unworked", line, done, since), api.context);
    if (found && found.head === "Answer") return found;
  }
  if (api.format(done) !== api.format(line) || !line || !line.head || line.args.length) return done;
  const filled = await api.evaluate(api.call("Fills", line), api.context);
  if (filled && filled.head !== "Fills") return filled;
  // Or talk ("k"): noted, with a reply, not looked up.
  const said = await api.evaluate(api.call("Interjected", line));
  return said && said.head === "Interjected" ? done : said;
};
