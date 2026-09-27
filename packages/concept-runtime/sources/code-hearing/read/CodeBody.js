// A function's statements: what it gives is undefined unless it ends by returning.
const steps = [];
for (const s of parts) {
  const r = await read(s);
  if (!(is(r, "Undefined") && r.args.length === 0)) steps.push(r);
}
const last = steps[steps.length - 1];
if (!is(last, "Return") && !is(last, "Throw")) steps.push(api.call("Undefined"));
return steps.length === 1 ? steps[0] : api.call("Sequence", ...steps);
