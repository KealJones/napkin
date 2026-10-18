// @realization HowMany(Rest($x)), context = Execution(), evaluateArguments = false
// How many of one unit are in another ("how many ounces in a pound", heard as Ounces(In(Pound()))
// or as Ounces() beside In(Pound())): each in the SI unit of its kind, divided. A Quantity of the
// first unit. Anything else stays as said.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = args.map((a) => a.value);
  let a = undefined;
  let b = undefined;
  if (said.length === 1 && isCall(said[0]) && said[0].args.length === 1 && isCall(said[0].args[0].value) && said[0].args[0].value.head === "In") {
    a = { head: said[0].head, args: [] };
    b = said[0].args[0].value.args[0]?.value;
  } else if (said.length === 2 && isCall(said[0]) && !said[0].args.length && isCall(said[1]) && said[1].head === "In") {
    a = said[0];
    b = said[1].args[0]?.value;
  }
  // How long until a day ("how many days until christmas", Days(Until(Christmas()))): from today to it, in that unit.
  const until = isCall(said[0]) && said[0].args.length === 1 && isCall(said[0].args[0].value) && said[0].args[0].value.head === "Until" ? said[0].args[0].value : isCall(said[1]) && said[1].head === "Until" ? said[1] : undefined;
  if (until && isCall(said[0])) {
    const unit = { head: said[0].head, args: [] };
    const day = await api.evaluate(until.args[0]?.value);
    const today = await api.evaluate(api.call("Today"));
    const field = (d, n) => (isCall(d) ? d.args.find((x) => x.name === n)?.value : undefined);
    const at = (d) => Date.UTC(field(d, "year"), field(d, "month") - 1, field(d, "day"));
    if (isCall(day) && day.head === "Date" && typeof field(day, "day") === "number" && isCall(today)) {
      const days = Math.round((at(day) - at(today)) / 86_400_000);
      // Days in the unit asked, as the graph holds them (Week Holds(Day(), 7), Day Holds(Hour(), 24)).
      const one = api.lemma(unit.head.toLowerCase());
      const base = one ? one[0].toUpperCase() + one.slice(1) : unit.head;
      const holds = (whole, part) => (api.store.get(whole)?.relations ?? []).map((r) => r.claim).find((x) => isCall(x) && x.head === "Holds" && isCall(x.args[0]?.value) && x.args[0].value.head === part && typeof x.args[1]?.value === "number")?.args[1].value;
      const per = base === "Day" ? 1 : holds("Day", base) ?? (holds(base, "Day") ? 1 / holds(base, "Day") : undefined);
      if (per === undefined) return api.call("HowMany", ...said);
      return { head: "Quantity", args: [{ value: Math.round(days * per * 100) / 100 }, { name: "unit", value: unit }] };
    }
  }
  if (!isCall(a) || !isCall(b)) return api.call("HowMany", ...said);
  const inA = await api.evaluate(api.call("InSI", a));
  const inB = await api.evaluate(api.call("InSI", b));
  const ok = (q) => isCall(q) && typeof q.args[1]?.value === "number";
  if (!ok(inA) || !ok(inB) || api.format(inA.args[2].value) !== api.format(inB.args[2].value)) {
    // Money: how many yen in a dollar is a dollar in yen.
    const money = await api.evaluate(api.call("Exchange", 1, b, a));
    return isCall(money) && money.head === "Quantity" ? { head: "Quantity", args: money.args.filter((x) => x.name !== "of") } : api.call("HowMany", ...said);
  }
  const from = [inA, inB].map((q) => q.args.find((x) => x.name === "from")).filter(Boolean);
  return { head: "Quantity", args: [{ value: inB.args[1].value / inA.args[1].value }, { name: "unit", value: a }, ...from] };
};
