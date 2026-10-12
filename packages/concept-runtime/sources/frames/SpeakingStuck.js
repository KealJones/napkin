// @realization Stuck(Rest($x)), context = Speaking(), evaluateArguments = false
// Where reading a message got stuck: "I read 10 times 10, but couldn't fit "equal", "to" and "100"
// into it. I have nothing for "equal" yet."
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const words = (list) => (list && list.args ? list.args.map((a) => String(a.value)) : []);
  const quoted = (ws) => {
    const q = ws.map((w) => "\"" + w + "\"");
    return q.length < 2 ? q.join("") : q.slice(0, -1).join(", ") + " and " + q[q.length - 1];
  };
  const near = named("near");
  const left = words(named("left"));
  const unknown = words(named("unknown"));
  const parts = [];
  if (typeof near === "string" && near && left.length) {
    if (named("as") === "thing") {
      parts.push("I read it as saying " + near + ", but couldn't tell what " + quoted(left) + " is as one thing.");
    } else {
      parts.push("I read " + near + ", but couldn't fit " + quoted(left) + " into it.");
    }
  }
  if (unknown.length) {
    parts.push("I have nothing for " + quoted(unknown) + " yet.");
  }
  return parts.length ? "Where I got stuck: " + parts.join(" ") : "";
};
