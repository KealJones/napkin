// What was heard, read as one program: its statements in order, each name read knowing which
// names the program binds (InScope).
const bound = await ask("CodeScope", ...parts);
const facets = is(api.context, "Context") ? positional(api.context) : [api.context];
const context = api.call("Context", ...facets.filter((f) => !is(f, "InScope")), api.call("InScope", ...positional(bound)));
const xs = [];
for (const s of parts) xs.push(await api.evaluate(s, context));
return api.call("Module", xs.length === 1 ? xs[0] : api.call("Sequence", ...xs));
