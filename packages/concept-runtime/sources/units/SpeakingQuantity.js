// @realization Quantity(Rest($x)), context = Speaking(), evaluateArguments = false
// A quantity said: "16 ounces", and what it was converted from when it was: "1 ounce is 0.0625
// pounds". A unit is said as it was said, and in its base form for exactly one.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const say = (q) => {
    const n = Number(Number(q.args[0].value).toPrecision(10));
    const unit = q.args.find((a) => a.name === "unit")?.value;
    const words = isCall(unit) ? unit.head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : String(unit);
    // As it was said ("yen", "ounces"), and in its base form for exactly one.
    return n + " " + (n === 1 ? api.lemma(words) : words);
  };
  const self = { head: "Quantity", args };
  const of = args.find((a) => a.name === "of")?.value;
  const text = isCall(of) ? say(of) + " is " + say(self) : say(self);
  return text[0].toUpperCase() + text.slice(1) + ".";
};
