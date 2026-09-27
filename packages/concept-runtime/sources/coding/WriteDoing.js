// @realization WriteDoing(Rest($said)), context = Execution(), evaluateArguments = false
// A function that does what a doing said names ("write a function that adds two numbers"): the
// Concept the verb is (Adds is Add), taking as many values as its own realization does, written
// in the language said when code can be written for it. Derived(SourceCode(...)), CannotWrite, or
// Write itself when nothing said is a doing Napkin has.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const isVar = (e) => e !== null && typeof e === "object" && "variable" in e;
  const languages = api.store.all().filter((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "TargetLanguage")).map((u) => u.identity);
  let target = undefined;
  const inContext = (e) => {
    if (target || !isCall(e)) return;
    target = languages.find((l) => l === e.head);
    for (const a of e.args) inContext(a.value);
  };
  // The doing: the first word said that is, in its base form, a Concept with a realization of plain values.
  let doing = undefined;
  // Only what was said: not what a "that" points back to.
  const find = (e) => {
    if (!isCall(e) || e.head === "Ref") return;
    if (!target) target = languages.find((l) => l.toLowerCase() === e.head.toLowerCase());
    if (!doing) {
      const base = api.lemma(e.head.toLowerCase());
      const name = base[0].toUpperCase() + base.slice(1);
      const unit = name !== e.head || e.args.length ? api.store.get(name) : undefined;
      const r = unit?.realizations.find((r) => !r.retired && isCall(r.pattern) && r.pattern.head === name && r.pattern.args.length > 0 && r.pattern.args.every((p) => isVar(p.value)) && !r.properties.some((p) => isCall(p) && p.head === "Effectful"));
      if (r) doing = { name, base, arity: r.pattern.args.length };
    }
    for (const a of e.args) if (a.name === undefined) find(a.value);
  };
  for (const a of args) find(a.value);
  inContext(api.context);
  if (!doing) return api.call("Write", ...args.map((a) => a.value));
  const names = doing.arity === 1 ? ["x"] : ["a", "b", "c", "d"].slice(0, doing.arity);
  const params = names.map((n) => ({ variable: n }));
  const ir = { head: "Module", args: [{ value: { head: "Func", args: [{ value: { variable: doing.base } }, { value: api.call("List", ...params) }, { value: api.call("Return", api.call(doing.name, ...params)) }] } }] };
  const language = target ?? "JavaScript";
  const written = api.writeCode(ir, language);
  if (written.unwritable.length) return api.call("CannotWrite", language, api.call("List", ...written.unwritable));
  return api.call("Derived", { head: "SourceCode", args: [{ value: written.text }, { name: "language", value: api.call(language) }, { name: "ir", value: ir }] }, doing.base);
};
