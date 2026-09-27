// @realization Convert(Rest($said)), context = Execution(), evaluateArguments = false
// Code written in another language: the language said ("to javascript"), which is one the graph
// holds as a TargetLanguage. Converted(SourceCode(...)), or what cannot be written in it yet.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value)), api.context);
  if (!isCall(code) || code.head !== "SourceCode") return code;
  const ir = code.args.find((a) => a.name === "ir")?.value;
  if (ir === undefined) return api.call("NoCode");
  const languages = api.store.all().filter((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "TargetLanguage")).map((u) => u.identity);
  let target = undefined;
  const find = (e) => {
    if (target || !isCall(e) || ["InlineCode", "Block", "File", "SourceCode"].includes(e.head)) return;
    const hit = languages.find((l) => l.toLowerCase() === e.head.toLowerCase());
    if (hit) target = hit;
    for (const a of e.args) find(a.value);
  };
  for (const a of args) find(a.value);
  // A language said may have been lifted into the context the order runs in (TargetLanguage is a facet).
  const inContext = (e) => {
    if (target || !isCall(e)) return;
    target = languages.find((l) => l === e.head);
    for (const a of e.args) inContext(a.value);
  };
  inContext(api.context);
  target = target ?? "JavaScript";
  const written = api.writeCode(ir, target);
  if (written.unwritable.length) return api.call("CannotWrite", target, api.call("List", ...written.unwritable));
  return api.call("Converted", { head: "SourceCode", args: [{ value: written.text }, { name: "language", value: api.call(target) }, { name: "ir", value: ir }] });
};
