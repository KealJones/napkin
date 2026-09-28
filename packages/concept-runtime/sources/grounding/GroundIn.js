// @realization GroundIn($gloss, $x), context = Execution(), evaluateArguments = false
// A gloss read on a value: heard, then each phrase worked out under Grounding($x), from the words
// up. "Something" and "it" are the value. A phrase that works out to nothing of its own takes what
// its words grounded to, so "turn ... so that it runs in the opposite sequence" is what "in the
// opposite sequence" is. The recipe found (a quoted doing of the value), or undefined.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const x = bindings.get("x");
  const heard = await api.evaluate(api.call("Hear", String(bindings.get("gloss")), "rules"));
  const ctx = api.call("Context", api.call("Execution"), api.call("Hypothetical"), api.call("Grounding", x));
  const same = (a, b) => api.format(a) === api.format(b);
  const mentions = (e) => same(e, x) || (isCall(e) && e.args.some((a) => mentions(a.value)));
  // A recipe: something done to the value that works out to a value of its kind, not the value itself.
  const kind = (v) => (typeof v === "string" ? "text" : isCall(v) ? v.head : typeof v);
  const recipe = async (e) => {
    if (!isCall(e) || same(e, x) || !mentions(e)) return false;
    try {
      const v = await api.evaluate(e, api.call("Context", api.call("Execution"), api.call("Hypothetical")));
      return kind(v) === kind(x) && !same(v, e) && !(isCall(v) && v.args.some((a) => same(a.value, x)) && v.head !== "List");
    } catch (error) {
      return false;
    }
  };
  const firstRecipe = async (values) => {
    for (const v of values) if (await recipe(v)) return v;
    return undefined;
  };
  const THING = ["Something", "Someone", "It", "Them", "This", "That"];
  const ground = async (e) => {
    if (!isCall(e)) return e;
    if ((e.head === "Ref" && typeof e.args[0]?.value === "string") || (THING.includes(e.head) && !e.args.length)) return x;
    const kids = [];
    for (const a of e.args) kids.push(a.name === undefined ? { value: await ground(a.value) } : a);
    const values = kids.map((k) => k.value);
    // Of alternatives said, one that is something done to the value ("faces the opposite direction
    // or runs in the opposite sequence"), else the first that grounded ("a contrary order or direction").
    if (e.head === "Or") return (await firstRecipe(values)) ?? values.find((v, i) => !same(v, e.args[i]?.value)) ?? values[0];
    const rebuilt = { head: e.head, args: kids };
    let v = undefined;
    try {
      v = await api.evaluate(rebuilt, ctx);
    } catch (error) {
      v = undefined;
    }
    if (v !== undefined && !same(v, rebuilt)) return v;
    return (await firstRecipe(values)) ?? rebuilt;
  };
  const found = [];
  const walk = async (e) => {
    if (!isCall(e)) return;
    if (e.head === "Mood" || e.head === "ContextScope" || e.head === "Phrases") {
      for (const a of e.args) await walk(a.value);
      return;
    }
    const g = await ground(e);
    if (await recipe(g)) found.push(g);
  };
  await walk(heard);
  return found[0] ?? api.call("GroundIn", String(bindings.get("gloss")), x);
};
