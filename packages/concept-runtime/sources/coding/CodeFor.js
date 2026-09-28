// @realization CodeFor($doing, $noun), context = Execution(), evaluateArguments = false
// Code for a doing the code writer has no rule for, found from what the doing does. Napkin runs
// the doing on sample values (under Hypothetical) to get examples, keeping the kind of value the
// words name ("a string") when they name one the language has, then searches programs made of
// the language's own vocabulary, the methods its values report having (called with nothing
// given), simplest first, run apart
// in the language itself, for one that gives every example. JavaScript only, as only it can be run.
// When no method does it, the arithmetic rule Examples finds from the same examples. The body's
// code, or undefined when nothing fits.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const doing = bindings.get("doing");
  const noun = bindings.get("noun");
  const hypothetical = api.call("Context", api.call("Execution"), api.call("Hypothetical"));
  const plain = (v) => typeof v === "number" || typeof v === "string" || typeof v === "boolean" || (isCall(v) && v.head === "List" && v.args.every((a) => plain(a.value)));
  // Values of each kind a program might be given.
  const samples = ["abc", "hello", "ab", 7, 3, 12, api.call("List", 3, 1, 2), api.call("List", "b", "a", "c")];
  const examples = [];
  for (const s of samples) {
    let out = undefined;
    try {
      out = await api.evaluate(api.call(doing, s), hypothetical);
    } catch (error) {
      out = undefined;
    }
    if (plain(out) && api.format(out) !== api.format(s)) examples.push([api.toHost(s), api.toHost(out), isCall(s) ? s.head.toLowerCase() : typeof s]);
  }
  if (!examples.length) return undefined;
  // The kind the words name, as the graph names it (a List) or as the language does (an array).
  const kindOf = (v) => (Array.isArray(v) ? "array" : typeof v);
  const named = isCall(noun) ? api.lemma(noun.head.toLowerCase()) : "";
  const kept = examples.filter(([input, , graphKind]) => kindOf(input) === named || graphKind === named);
  const use = kept.length ? kept : examples;
  // Kinds that give different examples are not one program: the first kind's examples then.
  const first = kindOf(use[0][0]);
  const fits = use.filter(([input]) => kindOf(input) === first).map(([input, output]) => [input, output]);
  const source = `
const examples = ${JSON.stringify(fits)};
const copy = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const methods = (v) => {
  if (v === null || v === undefined) return [];
  const p = Object.getPrototypeOf(v);
  if (!p) return [];
  return Object.getOwnPropertyNames(p).filter((n) => {
    try { return n !== "constructor" && typeof p[n] === "function" && p[n].length <= 1; } catch (e) { return false; }
  }).sort((a, b) => a.length - b.length);
};
const stepsFor = (v) => [
  ...methods(v).map((m) => ({ src: (s) => s + "." + m + "()", run: (x) => x[m]() })),
  ...(typeof v === "string" ? [{ src: (s) => "[..." + s + "]", run: (x) => [...x] }] : []),
  ...(Array.isArray(v) ? [{ src: (s) => s + ".join(\\"\\")", run: (x) => x.join("") }] : []),
];
let states = [{ src: "x", values: examples.map(([i]) => copy(i)) }];
let found = null;
for (let depth = 0; depth < 3 && !found; depth++) {
  const next = [];
  for (const st of states) {
    for (const step of stepsFor(st.values[0])) {
      let values;
      // A step that changes the value it is given changes the caller's too: passed over.
      try { values = st.values.map((v) => { const given = copy(v); const r = step.run(given); return r === undefined || !same(given, v) ? undefined : copy(r); }); } catch (e) { continue; }
      if (values.some((v) => v === undefined)) continue;
      const src = step.src(st.src);
      if (values.every((v, i) => same(v, examples[i][1]))) { found = src; break; }
      if (next.length < 4000) next.push({ src, values });
    }
    if (found) break;
  }
  states = next;
}
found;`;
  const ran = api.runCode(source);
  if (typeof ran.value === "string") return ran.value;
  // No method does it: the rule may be arithmetic, which Examples finds from the same examples.
  const derived = await api.evaluate(
    api.call("Examples", "x", ...fits.map(([input, output]) => api.call("Example", api.call("List", api.fromHost(input)), api.fromHost(output)))),
    api.context,
  );
  if (!isCall(derived) || derived.head !== "Derived") return undefined;
  const ir = derived.args[0].value.args.find((a) => a.name === "ir")?.value;
  const fn = isCall(ir) && isCall(ir.args[0]?.value) ? ir.args[0].value : undefined;
  const ret = fn && isCall(fn.args[2]?.value) ? fn.args[2].value : undefined;
  const rule = ret && ret.head === "Return" ? ret.args[0]?.value : undefined;
  return rule === undefined ? undefined : api.writeCode(rule, "JavaScript").text;
};
