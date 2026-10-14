// @realization Corrected(Rest($x)), context = Speaking(), evaluateArguments = false
// Told the answer to a situation: the reading that comes to it, said, and what was learned; or
// that none of the readings does.
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const list = (n) => {
    const v = named(n);
    return v && v.args ? v.args.map((a) => String(a.value)) : [];
  };
  const told = String(named("told"));
  const was = named("was");
  if (was === told) return "Yes, " + told + ".";
  const learned = list("learned");
  const after = learned.length ? " I've learned that " + learned.join(" and ") + "." : "";
  if (named("found") !== true) return "Thanks. I couldn't get to " + told + " from what I read, so I'll keep the telling in mind." + after;
  const steps = list("steps");
  const noted = list("noted").filter((w) => !learned.some((l) => l.includes('"' + w + '"')));
  const why = after || (noted.length ? " That tells me something about \"" + noted.join("\" and \"") + "\"; once more and I'll know it." : named("weighed") === true ? " I'll weigh it that way next time." : "");
  return "Got it, " + told + ". Reading it again, I can get there: " + steps.join("; ") + "." + why;
};
