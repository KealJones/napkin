// What was heard, read as one program: its statements in order.
const xs = [];
for (const s of parts) xs.push(await read(s));
return api.call("Module", xs.length === 1 ? xs[0] : api.call("Sequence", ...xs));
