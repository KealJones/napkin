// @realization Findings($code, $found), context = Speaking(), evaluateArguments = false
// What looks wrong in code, one finding a line; that nothing does, when nothing does.
async (args, bindings, api) => {
  const found = bindings.get("found");
  const items = found !== null && typeof found === "object" && "args" in found ? found.args.map((a) => a.value) : [];
  const text = items.map((f) => (f !== null && typeof f === "object" && "args" in f ? String(f.args[0].value) : String(f)));
  if (!text.length) return "Nothing in it looks wrong to me.";
  return text.length === 1 ? "One thing looks wrong: " + text[0] + "." : "Here's what looks wrong:\n" + text.map((t) => "- " + t).join("\n");
};
