async (args, bindings, api) => {
  // "a.name": the member of a by that name; "a.b(c)": that member called. Where the language's
  // own reading rules say a member or a member call is a Concept of the code IR ("xs.length" is
  // Length(xs), "xs.map(f)" is Map(xs, f)), it reads as that Concept: the rules are asked, not
  // repeated here.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const [owner, member] = self.args.filter((a) => a.name === undefined).map((a) => a.value);
  const of = await api.evaluate(owner, api.context);
  if (!isCall(member)) return api.call("Member", of, member);
  const said = member.args.find((a) => a.name === "said");
  const name = said ? said.value : member.head[0].toLowerCase() + member.head.slice(1);
  const got = api.call("Member", of, name);
  const values = [];
  let called = false;
  for (const a of member.args) {
    if (a.name !== undefined) continue;
    if (isCall(a.value) && a.value.head === "Parens" && a.value.args.length === 0) called = true;
    else if (!(isCall(a.value) && a.value.head === "Angles")) values.push(await api.evaluate(a.value, api.context));
  }
  // The language's reading rules for members by name (javascript.ncon's From rules).
  const field = (e, k) => (isCall(e) ? e.args.find((a) => a.name === k) : undefined);
  const text = (e) => {
    const n = field(e, "name");
    const t = n && isCall(n.value) && n.value.head === "JsIdentifier" ? field(n.value, "text") : undefined;
    return t ? t.value : undefined;
  };
  const code = (api.context.args ?? []).map((a) => a.value).find((f) => isCall(f) && f.head === "Code");
  const language = code && isCall(code.args[0].value) ? code.args[0].value.head : "";
  const rulesOf = (head) => {
    const unit = api.store.get(head);
    return unit ? unit.realizations.filter((r) => !r.retired && isCall(r.context) && r.context.args.some((a) => isCall(a.value) && a.value.head === "Reading") && r.context.args.some((a) => isCall(a.value) && ["JavaScript", "TypeScript", language].includes(a.value.head))) : [];
  };
  const isVar = (e) => e !== null && typeof e === "object" && "variable" in e;
  if (values.length || called) {
    // A callback taking more than the Concept passes stays a method call (the Capture rules).
    for (const r of rulesOf("JsCallExpression")) {
      const ex = field(r.pattern, "expression");
      const inner = ex && isCall(ex.value) && ex.value.head === "Capture" ? ex.value.args[1].value : undefined;
      if (!inner || text(inner) !== name) continue;
      const as = field(r.pattern, "arguments");
      const first = as && isCall(as.value) ? as.value.args[0] : undefined;
      const fn = first && isCall(first.value) && first.value.head === "Capture" ? first.value.args[1].value : undefined;
      const ps = fn ? field(fn, "parameters") : undefined;
      const least = ps && isCall(ps.value) ? ps.value.args.filter((a) => isVar(a.value) && a.value.variable === "_").length : 0;
      const f = values[0];
      if (least && isCall(f) && f.head === "Lambda" && isCall(f.args[0].value) && f.args[0].value.args.length >= least) return api.call("Call", got, ...values);
    }
    for (const r of rulesOf("JsCallExpression")) {
      const ex = field(r.pattern, "expression");
      if (!ex || !isCall(ex.value) || ex.value.head !== "JsPropertyAccessExpression" || text(ex.value) !== name) continue;
      const as = field(r.pattern, "arguments");
      const wanted = as && isCall(as.value) ? as.value.args.map((a) => a.value) : [];
      const o = field(ex.value, "expression");
      if (!o || !isVar(o.value) || wanted.length !== values.length || !wanted.every(isVar) || !isCall(r.body)) continue;
      const bound = new Map([[o.value.variable, of], ...wanted.map((v, i) => [v.variable, values[i]])]);
      if (r.body.args.every((a) => isVar(a.value) && bound.has(a.value.variable))) return api.call(r.body.head, ...r.body.args.map((a) => bound.get(a.value.variable)));
    }
    return api.call("Call", got, ...values);
  }
  for (const r of rulesOf("JsPropertyAccessExpression")) {
    if (text(r.pattern) !== name) continue;
    const o = field(r.pattern, "expression");
    if (o && isVar(o.value) && isCall(r.body) && r.body.args.length === 1 && isVar(r.body.args[0].value) && r.body.args[0].value.variable === o.value.variable) return api.call(r.body.head, of);
  }
  return got;
}
