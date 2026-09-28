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
  let noun = undefined;
  let said = undefined;
  // Only what was said: not what a "that" points back to.
  const find = (e) => {
    if (!isCall(e) || e.head === "Ref") return;
    if (!target) target = languages.find((l) => l.toLowerCase() === e.head.toLowerCase());
    if (!doing) {
      const base = api.lemma(e.head.toLowerCase());
      const name = base[0].toUpperCase() + base.slice(1);
      // A word said in a verb's form ("inverts" is "invert"), in case nothing Napkin has does it.
      if (!said && name !== e.head && e.args.length) {
        const object = e.args.find((a) => a.name === undefined && isCall(a.value) && a.value.head !== "Ref");
        said = { name, base, noun: object ? object.value : undefined };
      }
      const unit = name !== e.head || e.args.length ? api.store.get(name) : undefined;
      // Of its realizations of plain values, the one taking fewest ("sort a list" is Sort($xs)).
      const r = unit?.realizations.filter((r) => !r.retired && isCall(r.pattern) && r.pattern.head === name && r.pattern.args.length > 0 && r.pattern.args.every((p) => isVar(p.value)) && !r.properties.some((p) => isCall(p) && p.head === "Effectful")).sort((a, b) => a.pattern.args.length - b.pattern.args.length)[0];
      if (r) {
        doing = { name, base, arity: r.pattern.args.length };
        const object = e.args.find((a) => a.name === undefined && isCall(a.value) && a.value.head !== "Ref");
        noun = object ? object.value : undefined;
      }
    }
    for (const a of e.args) if (a.name === undefined) find(a.value);
  };
  for (const a of args) find(a.value);
  inContext(api.context);
  // A doing Napkin has no behaviour for, said as a verb ("inverts"): what it means is looked up
  // and grounded on a sample of what it is done to (Ground), then written as that.
  if (!doing && said) {
    const sample = typeof said.noun === "object" && said.noun && ["string", "text", "word"].includes(api.lemma(String(said.noun.head).toLowerCase())) ? "abc" : api.call("List", 3, 1, 2);
    const grounded = await api.evaluate(api.call("Ground", said.name, sample));
    if (isCall(grounded) && grounded.head === "Grounded") {
      doing = { name: said.name, base: said.base, arity: 1 };
      noun = said.noun;
    }
  }
  if (!doing) return api.call("Write", ...args.map((a) => a.value));
  const names = doing.arity === 1 ? ["x"] : ["a", "b", "c", "d"].slice(0, doing.arity);
  const params = names.map((n) => ({ variable: n }));
  const ir = { head: "Module", args: [{ value: { head: "Func", args: [{ value: { variable: doing.base } }, { value: api.call("List", ...params) }, { value: api.call("Return", api.call(doing.name, ...params)) }] } }] };
  const language = target ?? "JavaScript";
  const written = api.writeCode(ir, language);
  if (written.unwritable.length) {
    // No rule writes the doing: found from what it does instead, in a language that can be run.
    const body = doing.arity === 1 && language === "JavaScript" ? await api.evaluate(api.call("CodeFor", doing.name, noun ?? api.call("Value")), api.context) : undefined;
    if (typeof body !== "string") return api.call("CannotWrite", language, api.call("List", ...written.unwritable));
    const text = "function " + doing.base + "(x) { return " + body + " }";
    const read = await api.readCode(text, "javascript");
    return { head: "Derived", args: [{ value: { head: "SourceCode", args: [{ value: text }, { name: "language", value: api.call(language) }, ...(read ? [{ name: "ir", value: read.ir }] : [])] } }, { value: doing.base }] };
  }
  return api.call("Derived", { head: "SourceCode", args: [{ value: written.text }, { name: "language", value: api.call(language) }, { name: "ir", value: ir }] }, doing.base);
};
