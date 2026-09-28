// @realization Exchange($amount, $from, $to), context = Execution()
// An amount of one currency in another at today's reference rate (Frankfurter, from the European
// Central Bank). Rates change, so this is asked each time and never kept. Quantity(value, unit =
// To, of = Quantity(amount, unit = From), from = Frankfurter(url)), or the call itself.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const [amount, from, to] = ["amount", "from", "to"].map((k) => bindings.get(k));
  const a = await api.evaluate(api.call("CurrencyCode", from));
  const b = await api.evaluate(api.call("CurrencyCode", to));
  if (typeof amount !== "number" || typeof a !== "string" || typeof b !== "string") return api.call("Exchange", amount, from, to);
  const url = "https://api.frankfurter.dev/v1/latest?amount=" + amount + "&from=" + a + "&to=" + b;
  const got = api.toHost(await api.evaluate(api.call("Fetch", url)));
  const value = a === b ? amount : got && got.rates ? Number(got.rates[b]) : NaN;
  if (!Number.isFinite(value)) return api.call("Exchange", amount, from, to);
  return { head: "Quantity", args: [{ value }, { name: "unit", value: to }, { name: "of", value: { head: "Quantity", args: [{ value: amount }, { name: "unit", value: from }] } }, { name: "from", value: api.call("Frankfurter", url) }] };
};
