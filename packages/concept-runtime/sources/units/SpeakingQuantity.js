// @realization Quantity(Rest($x)), context = Speaking(), evaluateArguments = false
// A quantity said: "16 ounces", and what it was converted from when it was: "1 ounce is 0.0625
// pounds". A unit is said in its base form for one, and as it was said (or with an s) for more.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const say = (q) => {
    const n = Number(Number(q.args[0].value).toPrecision(10));
    const unit = q.args.find((a) => a.name === "unit")?.value;
    const words = isCall(unit) ? unit.head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : String(unit);
    const one = api.lemma(words);
    const many = words !== one ? words : one + "s";
    return n + " " + (n === 1 ? one : many);
  };
  const self = { head: "Quantity", args };
  const of = args.find((a) => a.name === "of")?.value;
  const text = isCall(of) ? say(of) + " is " + say(self) : say(self);
  return text[0].toUpperCase() + text.slice(1) + ".";
};
