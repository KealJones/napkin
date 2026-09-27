// @realization Check(Rest($said)), context = Execution(), evaluateArguments = false
// What looks wrong in code, found in its code IR the same way for any program: a name used that
// nothing in the code defines (and the language does not give, GlobalName), an assignment where
// a condition is tested, steps after a return that never run, a value set and never used, a
// thing compared with itself, a thing set to itself. Findings(code, List(Finding("..."))).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const isVar = (e) => e !== null && typeof e === "object" && "variable" in e;
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value)), api.context);
  if (!isCall(code) || code.head !== "SourceCode") return code;
  const ir = code.args.find((a) => a.name === "ir")?.value;
  if (ir === undefined) return api.call("Findings", code, api.call("List", api.call("Finding", "no language I know reads it as code, so I can't check it")));
  const language = code.args.find((a) => a.name === "language")?.value;
  const show = (e) => api.writeCode(e, "JavaScript").text.trim();
  const found = [];
  const declared = new Map();
  const used = new Set();
  const names = (e, into) => {
    if (isVar(e)) into.push(e.variable);
    else if (isCall(e)) for (const a of e.args) names(a.value, into);
  };
  const declare = (e, kind) => {
    const xs = [];
    names(isCall(e) && e.head === "Default" ? e.args[0].value : e, xs);
    for (const x of xs) if (!declared.has(x)) declared.set(x, kind);
  };
  const DECLARING = { Bind: "value", Var: "value" };
  const walk = (e, inCondition) => {
    if (isVar(e)) {
      used.add(e.variable);
      return;
    }
    if (!isCall(e)) return;
    const a = e.args.map((x) => x.value);
    if (DECLARING[e.head] && a.length >= 1) {
      declare(a[0], "value");
      for (const x of a.slice(1)) walk(x, false);
      return;
    }
    if (e.head === "Func" && a.length >= 3) {
      declare(a[0], "function");
      if (isCall(a[1])) for (const p of a[1].args) declare(p.value, "parameter");
      walk(a[2], false);
      return;
    }
    if (e.head === "Lambda" && a.length >= 2) {
      if (isCall(a[0])) for (const p of a[0].args) declare(p.value, "parameter");
      walk(a[1], false);
      return;
    }
    if ((e.head === "ForOf" || e.head === "ForIn") && a.length >= 3) {
      declare(a[0], "loop");
      walk(a[1], false);
      walk(a[2], false);
      return;
    }
    if (e.head === "Catch" && a.length >= 2) {
      declare(a[0], "parameter");
      walk(a[1], false);
      return;
    }
    if (e.head === "Import" && a.length >= 1) {
      declare(a[0], "import");
      return;
    }
    if (e.head === "Class" && a.length >= 1) declare(a[0], "class");
    if ((e.head === "If" || e.head === "While") && a.length >= 2) {
      const c = a[0];
      if (isCall(c) && c.head === "Assign") found.push(api.call("Finding", "`" + show(c).replace(/^\((.*)\)$/, "$1") + "` in the condition sets " + show(c.args[0].value) + " instead of comparing it; you probably meant `" + show(api.call("Equals", c.args[0].value, c.args[1].value)).replace(/^\((.*)\)$/, "$1") + "`"));
      walk(c, true);
      for (const x of a.slice(1)) walk(x, false);
      return;
    }
    if (e.head === "Sequence") {
      let ended = undefined;
      for (const s of a) {
        if (ended && !(isCall(s) && (s.head === "Undefined" || s.head === "Comment"))) {
          found.push(api.call("Finding", "`" + show(s) + "` comes after `" + show(ended) + "`, so it never runs"));
          break;
        }
        if (isCall(s) && ["Return", "Throw", "Break", "Continue"].includes(s.head)) ended = s;
      }
    }
    if ((e.head === "Equals" || e.head === "NotEquals") && a.length === 2 && api.format(a[0]) === api.format(a[1])) {
      found.push(api.call("Finding", "`" + show(e) + "` compares a thing with itself, so it is always " + (e.head === "Equals" ? "true" : "false")));
    }
    if (e.head === "Assign" && a.length === 2 && api.format(a[0]) === api.format(a[1])) {
      found.push(api.call("Finding", "`" + show(e) + "` sets a thing to itself, which does nothing"));
    }
    if (e.head === "Assign" && a.length === 2 && isVar(a[0])) {
      // Setting is not reading.
      for (const x of a.slice(1)) walk(x, false);
      if (!declared.has(a[0].variable)) used.add(a[0].variable);
      return;
    }
    if (e.head === "Member" && a.length === 2) {
      walk(a[0], inCondition);
      return;
    }
    for (const x of a) walk(x, inCondition);
  };
  walk(ir, false);
  // What the language gives every program is not undefined.
  const here = (r) => r.context === undefined || (isCall(language) && isCall(r.context) && r.context.head === "Code" && api.format(r.context.args[0].value) === api.format(language));
  const given = (n) => api.store.mentioning(n).some((m) => here(m.relation) && isCall(m.relation.claim) && m.relation.claim.head === "GlobalName" && m.relation.claim.args[0].value === n);
  const undefinedNames = [...used].filter((n) => !declared.has(n) && !given(n));
  if (undefinedNames.length) found.push(api.call("Finding", (undefinedNames.length === 1 ? "`" + undefinedNames[0] + "` is" : undefinedNames.map((n) => "`" + n + "`").join(", ") + " are") + " used but not defined in this code"));
  const unused = [...declared].filter(([n, kind]) => kind === "value" && !used.has(n)).map(([n]) => n);
  if (unused.length) found.push(api.call("Finding", unused.map((n) => "`" + n + "`").join(", ") + (unused.length === 1 ? " is" : " are") + " set but never used"));
  return api.call("Findings", code, api.call("List", ...found));
};
