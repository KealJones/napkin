// @realization Ground($doing, $sample), context = Execution()
// What a doing means, from the dictionary, as a realization of primitives: each verb sense of its
// word is read on a sample of the value it is done to (GroundIn), and the first whose recipe works
// out is kept. When the doing already has behaviour of its own, the recipe must give what that
// gives on every sample of the same kind, or it is not kept. Kept as a realization with where it
// came from: Grounded(Doing, body, gloss = "...", from = Wiktionary(url)). The doing itself when no
// sense grounds.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const doing = String(bindings.get("doing"));
  const sample = bindings.get("sample");
  const word = api.lemma(doing.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const senses = await api.evaluate(api.call("Senses", word, "Verb"));
  if (!isCall(senses) || senses.head !== "Senses") return api.call("Ground", doing, sample);
  const glosses = senses.args[1].value.args.map((a) => a.value);
  const from = senses.args.find((a) => a.name === "from")?.value;
  const hypothetical = api.call("Context", api.call("Execution"), api.call("Hypothetical"));
  const same = (a, b) => api.format(a) === api.format(b);
  // Samples of the same kind as the one given, to check a recipe on.
  const kind = (v) => (typeof v === "string" ? "text" : isCall(v) ? v.head : typeof v);
  const samples = [sample, "abc", "hello", api.call("List", 3, 1, 2), api.call("List", "b", "a", "c")].filter((s, i, all) => kind(s) === kind(sample) && all.findIndex((t) => same(t, s)) === i);
  const replace = (e, from, to) => (same(e, from) ? to : isCall(e) ? { head: e.head, args: e.args.map((a) => ({ ...a, value: replace(a.value, from, to) })) } : e);
  const behaves = (api.store.get(doing)?.realizations ?? []).some((r) => !r.retired);
  for (const gloss of glosses) {
    const found = await api.evaluate(api.call("GroundIn", gloss, sample));
    if (!isCall(found)) continue;
    const body = replace(found, sample, { variable: "xs" });
    let fits = true;
    for (const s of samples) {
      let got = undefined;
      try {
        got = await api.evaluate(replace(body, { variable: "xs" }, s), hypothetical);
      } catch (error) {
        got = undefined;
      }
      // It must work out to a value of the sample's kind, not stay as said.
      if (got === undefined || kind(got) !== kind(s) || same(got, replace(body, { variable: "xs" }, s))) fits = false;
      else if (behaves) {
        let had = undefined;
        try {
          had = await api.evaluate(api.call(doing, s), hypothetical);
        } catch (error) {
          had = undefined;
        }
        if (had === undefined || !same(had, got)) fits = false;
      }
      if (!fits) break;
    }
    if (!fits) continue;
    const learned = api.call("Learned", ...(from ? [from] : []), gloss);
    api.store.addRealization(doing, {
      pattern: api.call(doing, { variable: "xs" }),
      context: api.call("Execution"),
      body,
      properties: [learned],
      evaluateArguments: true,
      evaluateResult: false,
    });
    return { head: "Grounded", args: [{ value: api.call(doing) }, { value: body }, { name: "gloss", value: gloss }, ...(from ? [{ name: "from", value: from }] : [])] };
  }
  return api.call("Ground", doing, sample);
};
