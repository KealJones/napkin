// @realization Unworked($line, $value, $since), context = Execution(), evaluateArguments = false
// What a line left undone, looked for further: the value it was worked out to is undone (the
// line as it was said, something that stayed as it was said, as Recipe(Cake()) did from "can you
// give me a cake recipe", or not known). That, the line, and what stands undone in it are pursued,
// then read from what the world has written, the one with most of the line in it first.
// Answer(found), or the call itself when nothing was found. What the question word asks for
// (Who asks for Someone) is asked of what is pursued, so an answer of another kind is passed over.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const value = bindings.get("value");
  const held = api.format(value);
  const residuals = api.trace.residuals(Number(bindings.get("since"))).filter((e) => isCall(e.output));
  let core = value;
  for (const wrap of ["Answer", "Unknown"]) if (isCall(core) && core.head === wrap && core.args.length) core = core.args[0].value;
  const open = [];
  const add = (e) => {
    if (!isCall(e) || e.head === "Ref" || !e.args.some((a) => a.name === undefined)) return;
    if (!open.some((o) => api.format(o) === api.format(e))) open.push(e);
  };
  add(core);
  add(line);
  for (const event of residuals) if (held.includes(api.format(event.output))) add(event.output);
  open.sort((a, b) => api.format(b).length - api.format(a).length);
  let asks = undefined;
  const ask = async (e) => {
    if (!isCall(e) || asks) return;
    const k = await api.evaluate(api.call("Closure", e.head, "Asks"));
    if (isCall(k) && k.head === "List" && k.args.length) asks = k.args[0].value;
    for (const a of e.args) if (a.name === undefined) await ask(a.value);
  };
  await ask(line);
  // Pursue finds what a question asks for; a command ("make a function that ...") asks nothing,
  // and a fact found for its words is no answer to it. What is written may still be what it wants.
  const facets = isCall(api.context) && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  const asked = facets.some((f) => isCall(f) && f.head === "Interrogative");
  for (const goal of open.slice(0, 3)) {
    for (const step of asked ? ["Pursue", "Written"] : ["Written"]) {
      const found = await api.evaluate(step === "Pursue" && asks ? api.call(step, goal, asks) : api.call(step, goal), api.context);
      if (isCall(found) && found.head === "Found") return api.call("Answer", found.args[0].value);
    }
  }
  return api.call("Unworked", line, value, bindings.get("since"));
};
