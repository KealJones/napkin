// @realization ChooseOne(Rest($options)), context = Speaking(), evaluateArguments = false
// "Do you mean Acme (ran company) or Boston (ran marathon)?": each reading by what it would answer,
// and what it is about where it says.
async (args, bindings, api) => {
  const sayOf = async (e) => {
    const r = await api.evaluate(api.call("Say", e), api.call("Execution"));
    return typeof r === "string" ? r.replace(/[.!?]+$/, "") : String(e);
  };
  const readable = (head) => head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const parts = [];
  for (const a of args) {
    const o = a.value;
    if (!o || !o.args || !o.args.length) {
      continue;
    }
    const says = o.args.find((x) => x.name === "says");
    const what = await sayOf(o.args[0].value);
    parts.push(says && says.value && says.value.head ? what + " (" + readable(says.value.head) + ")" : what);
  }
  if (parts.length < 2) {
    return "Which do you mean?";
  }
  return "Do you mean " + parts.slice(0, -1).join(", ") + " or " + parts[parts.length - 1] + "?";
};
