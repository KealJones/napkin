// @realization Write(Rest($said)), context = Execution(), evaluateArguments = false
// Code written from examples the message shows ("write a function where f(1) is 2, f(2) is 4"),
// in the language said, if one is (a TargetLanguage the graph holds), else JavaScript. With no
// examples, a function that does what a doing names (WriteDoing).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const languages = api.store.all().filter((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "TargetLanguage")).map((u) => u.identity);
  let examples = undefined;
  let target = undefined;
  const find = (e) => {
    if (!isCall(e)) return;
    if (e.head === "Examples") examples = examples ?? e;
    const hit = languages.find((l) => l.toLowerCase() === e.head.toLowerCase());
    if (hit) target = target ?? hit;
    for (const a of e.args) find(a.value);
  };
  for (const a of args) find(a.value);
  // A language said may have been lifted into the context the order runs in (TargetLanguage is a facet).
  const inContext = (e) => {
    if (!isCall(e)) return;
    const hit = languages.find((l) => l === e.head);
    if (hit) target = target ?? hit;
    for (const a of e.args) inContext(a.value);
  };
  if (examples) inContext(api.context);
  if (!examples) return api.evaluate(api.call("WriteDoing", ...args.map((a) => a.value)), api.context);
  const derived = await api.evaluate(examples, api.context);
  if (!target || target === "JavaScript" || !isCall(derived) || derived.head !== "Derived") return derived;
  const ir = derived.args[0].value.args.find((a) => a.name === "ir").value;
  const written = api.writeCode(ir, target);
  if (written.unwritable.length) return api.call("CannotWrite", target, api.call("List", ...written.unwritable));
  return { ...derived, args: [{ value: { head: "SourceCode", args: [{ value: written.text }, { name: "language", value: api.call(target) }, { name: "ir", value: ir }] } }, ...derived.args.slice(1)] };
};
