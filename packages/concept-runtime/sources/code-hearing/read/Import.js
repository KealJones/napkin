// "import { a, b as c } from 'x'": the names it brings in, and from where.
let e = parts[0];
if (is(e, "Type")) e = positional(e)[0];
if (is(e, "Parens")) { const xs = []; for (const x of positional(e)) xs.push(await read(x)); return api.call("DynamicImport", ...xs); }
if (!is(e, "From")) return api.call("Import", api.call("List"), await read(e));
const [what, source] = positional(e);
const names = [];
const add = (x) => {
  if (is(x, "Type")) return add(positional(x)[0]);
  if (is(x, "As")) return names.push(variable(positional(x)[1]));
  names.push(variable(x));
};
for (const x of is(what, "Braces") ? positional(what) : [what]) add(x);
return api.call("Import", api.call("List", ...names), await read(source));
