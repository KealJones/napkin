// Statements in order: one is itself, none is undefined.
const xs = [];
for (const s of parts) xs.push(await read(s));
return xs.length === 0 ? api.call("Undefined") : xs.length === 1 ? xs[0] : api.call("Sequence", ...xs);
