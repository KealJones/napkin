// A word read as code that has no reading of its own is a name: alone, the variable it names
// ($element); holding things, or said with its empty brackets, a call of it (print(x),
// print()). Angles after it are what types it is used at, set aside here.
const xs = [];
let called = false;
for (const p of parts) {
  if (is(p, "Parens") && p.args.length === 0) called = true;
  else if (!is(p, "Angles") && !is(p, "Comment")) xs.push(await read(p));
}
return xs.length || called ? api.call("Call", variable(self), ...xs) : variable(self);
