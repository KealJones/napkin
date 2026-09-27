import os
os.chdir('scratch/code-hearing')
p = 'readings.mjs'
s = open(p).read()
old = '''    if (is(m, "Assign")) return api.call("Field", nameOf(await ask("CodeTarget", p[0])), await read(p[1]));
    if (is(m, "Colon")) return is(p[1], "Assign") ? api.call("Field", nameOf(p[0]), await read(positional(p[1])[1])) : api.call("Field", nameOf(p[0]));'''
new = '''    // A field: its modifiers are said on its name ("private readonly x: T = v").
    if (is(m, "Assign") || is(m, "Colon") || is(m, "OptionalColon")) {
      let target = p[0];
      const mods = [];
      while (isCall(target) && ["Static", "Private", "Readonly", "Public", "Protected", "Abstract", "Declare"].includes(target.head)) {
        mods.push(target.head);
        target = positional(target)[0];
      }
      const value = is(m, "Assign") ? await read(p[1]) : is(p[1], "Assign") ? await read(positional(p[1])[1]) : api.call("Undefined");
      let field = api.call("Field", nameOf(is(target, "Colon") ? positional(target)[0] : target), value);
      for (const mod of mods.reverse()) if (!["Public", "Protected", "Abstract", "Declare"].includes(mod)) field = api.call(mod, field);
      return field;
    }'''
assert old in s
s = s.replace(old, new)
old = '''  const out = [];
  for (const m of members) out.push(await member(m));
  const name = variable(head);
  return base !== undefined ? api.call("Class", name, api.call("Extends", await read(base)), api.call("List", ...out)) : api.call("Class", name, api.call("List", ...out));`,'''
new = '''  const out = [];
  for (const m of members) if (!is(m, "Comment")) out.push(await member(m));
  return api.call("Class", variable(head), base !== undefined ? api.call("Extends", await read(base)) : api.call("Undefined"), api.call("List", ...out));`,'''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
p = 'hear.js'
s = open(p).read()
old = '''(is(i, "Closer") && !is(i, "Dedent")) || (is(i, "Unary")'''
new = '''(is(i, "Closer") && !is(i, "Dedent") && heads[i] !== undefined) || (is(i, "Unary")'''
assert old in s
s = s.replace(old, new)
old = '''    for (let j = p; j >= 0; j = is(j, "Closer") && pair[j] >= 0 ? pair[j] - 1 : j - 1) {
      if (heads[j] === "Returns") return true;'''
new = '''    // Right after the colon, the brace is the type itself ("(): { a: T } {").
    if (heads[p] === "Returns") return false;
    for (let j = p; j >= 0; j = is(j, "Closer") && pair[j] >= 0 ? pair[j] - 1 : j - 1) {
      if (heads[j] === "Returns") return true;'''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
