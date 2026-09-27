import os
os.chdir('scratch/code-hearing')
p = 'view.js'
s = open(p).read()
old = '''  const ends = (i) => plainEnd(i) || !!stray[i];'''
new = '''  // A leading word with nothing to lead is only a name ("(): void =>", "default:").
  const leads = (i) => prefix[i] && is(i, "Name") && !is(i, "Heads") && !is(i, "TakesBlock") && !is(i, "Continues") && !infix[i];
  const idle = kinds.map((_, i) => leads(i) && i + 1 <= n && !(is(i + 1, "Name") || is(i + 1, "Number") || is(i + 1, "Text") || is(i + 1, "Regex") || (is(i + 1, "Opener") && !scope[i + 1]) || is(i + 1, "Unary") || is(i + 1, "Prefix")));
  const ends = (i) => plainEnd(i) || !!stray[i] || !!idle[i];'''
assert old in s
s = s.replace(old, new)
s = s.replace('''  const starts = (i, lone) => stray[i] ||''', '''  const starts = (i, lone) => stray[i] || idle[i] ||''')
open(p, 'w').write(s)

p = 'words.mjs'
s = open(p).read()
old = '''  ["Default", ["Prefix", "Keyword"], undefined, "Binds(0)", TS],'''
assert old in s
s = s.replace(old, old + '''\n  ["Case", ["Prefix", "Keyword"], undefined, "Binds(16)", TS],''')
open(p, 'w').write(s)

p = 'readings.mjs'
s = open(p).read()
old = '''  While: ['''
new = '''  Switch: [
    w(
      '"switch (x) { case 1: a; break; default: b }": each case with the statements after its label.',
      `const [subject, ...rest] = parts;
  const cases = [];
  let current;
  const label = (x) => (is(x, "Colon") && (is(positional(x)[0], "Case") || is(positional(x)[0], "Default")) ? positional(x)[0] : undefined);
  for (const x of rest) {
    const l = label(x);
    const said = l ? positional(x).slice(1) : [x];
    if (l) cases.push((current = { l, body: [] }));
    for (const y of said) {
      if (!current) continue;
      if (is(y, "Braces")) current.body.push(...positional(y));
      else current.body.push(y);
    }
  }
  const out = [];
  for (const c of cases) {
    const body = await ask("CodeStatements", ...c.body);
    out.push(is(c.l, "Case") ? api.call("Case", await read(positional(c.l)[0]), body) : api.call("Default", body));
  }
  return api.call("Switch", await read(subject), api.call("List", ...out));`,
    ),
  ],
  While: ['''
assert old in s
s = s.replace(old, new, 1)
# arrow with nothing to join (in a type) is kept as said
old = '''      `const [ps, b] = parts;
  let head = ps;'''
new = '''      `if (parts.length < 2) return self;
  const [ps, b] = parts;
  let head = ps;'''
assert old in s
s = s.replace(old, new)
# a name that is a code word elsewhere is bound as a name
old = '''      `const e = parts[0];
  if (!isCall(e)) return e;
  const p = positional(e);'''
new = '''      `const e = parts[0];
  if (!isCall(e)) return e;
  const p = positional(e);
  if (e.args.some((a) => a.name === "said") && p.length === 0) return variable(e);'''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)
