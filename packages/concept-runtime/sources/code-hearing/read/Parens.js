// "(a, b)" as a value: a then b, giving b.
if (parts.length < 2) return self; const xs = []; for (const x of parts) xs.push(await read(x)); return api.call("Sequence", ...xs);
