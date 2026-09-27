// "export": what the module gives: a declaration, some names, or all of another module.
const e = parts[0];
const bare = (x) => (is(x, "Type") && positional(x).length ? positional(x)[0] : x);
const names = (b) => positional(b).filter((x) => !is(x, "Comment")).map((x) => bare(x)).map((x) => (is(x, "As") ? api.call("As", variable(positional(x)[0]), nameOf(positional(x)[1])) : variable(x)));
if (is(e, "Braces")) return api.call("ReExport", api.call("List", ...names(e)));
if (is(e, "From")) {
  const [what, source] = positional(e);
  return api.call("ReExport", is(what, "Braces") ? api.call("List", ...names(what)) : api.call("All"), await read(source));
}
if (is(e, "Default")) return api.call("ExportDefault", await read(positional(e)[0]));
const inner = await read(e);
return is(inner, "Erased") ? inner : api.call("Export", inner);
