// @realization Believed(Rest($x)), context = Speaking(), evaluateArguments = false
// What was believed, said back in the words it was said in, turned to the one hearing it, so it
// can be put right: "I am in a bad mood" is "Got it: you are in a bad mood."
async (args, bindings, api) => {
  const message = String(api.ambient("message") ?? "").trim().replace(/[.!?]+$/, "");
  const TURN = { i: "you", "i'm": "you're", me: "you", my: "your", mine: "yours", am: "are", myself: "yourself" };
  const turned = message.split(/(\s+)/).map((w) => (TURN[w.toLowerCase()] ?? w)).join("");
  // Lowercased to follow "Got it:", unless it starts with a name.
  const first = turned.split(/\s+/)[0] ?? "";
  const start = api.properNoun(first) ? turned : turned[0].toLowerCase() + turned.slice(1);
  return turned ? "Got it: " + start + "." : "Got it.";
};
