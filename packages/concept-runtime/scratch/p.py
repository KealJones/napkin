import os
os.chdir('scratch/code-hearing')
p = 'readings.mjs'
s = open(p).read()
def rep(old, new, count=1):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, count)

rep('''  const member = async (m) => {
    const p = isCall(m) ? positional(m) : [];
    for (const wrap of''', '''  const member = async (m) => {
    // A method's return type holds its signature: its modifiers are inside ("get x(): T {").
    if (is(m, "Returns")) {
      const [sig, ...rest] = positional(m);
      const blk = rest.find((x) => is(x, "Block"));
      let inner = sig;
      const mods = [];
      while (isCall(inner) && ["Static", "Private", "Readonly", "Public", "Protected", "Abstract", "Async", "Get", "Set"].includes(inner.head) && positional(inner).length === 1) {
        mods.push(inner.head);
        inner = positional(inner)[0];
      }
      let out = await member(blk && isCall(inner) ? { head: inner.head, args: [...inner.args, { value: blk }] } : inner);
      for (const mod of mods.reverse()) {
        if (mod === "Get" && is(out, "Method")) out = api.call("Getter", positional(out)[0], positional(out)[2]);
        else if (!["Public", "Protected", "Abstract"].includes(mod)) out = api.call(mod, out);
      }
      return out;
    }
    const p = isCall(m) ? positional(m) : [];
    for (const wrap of''')
rep('''  ...keepAll(["Comment", "Regex", "Else", "Break", "Continue", "Return", "Yield"]),''', '''  ...keepAll(["Else", "Break", "Continue", "Return", "Yield"]),
  // What was written as a comment or a regular expression; a name that only looks like one
  // ("comment") is a name.
  Comment: [w("A comment, kept where it was written.", `return typeof parts[0] === "string" ? self : variable(self);`)],
  Regex: [w("A regular expression, as written.", `return typeof parts[0] === "string" ? self : variable(self);`)],
  // "f(x)(y)": what f(x) gives, called with y.
  Apply: [w("What the thing before gives, called.", `const xs = []; for (const x of parts.slice(1)) xs.push(await read(x)); return api.call("Call", await read(parts[0]), ...xs);`)],''')
# Python: an if with nothing otherwise has no otherwise; every assignment is where a name begins
rep('''  Question: [reads("Question($a, $b, $c)", "If($a, $b, $c)")],''', '''  Question: [reads("Question($a, $b, $c)", "If($a, $b, $c)")],''')
rep('''  If: [
    w(
      '"if" holds a condition, then what to do, then (after "else") what to do otherwise.',
      `const [condition, ...rest] = parts;
  const last = rest[rest.length - 1];
  const otherwise = is(last, "Else") ? positional(rest.pop()) : [];
  return api.call("If", await read(condition), await ask("CodeStatements", ...rest), await ask("CodeStatements", ...otherwise));`,
    ),
  ],''', '''  If: [
    w(
      '"if" holds a condition, then what to do, then (after "else") what to do otherwise.',
      `const [condition, ...rest] = parts;
  const last = rest[rest.length - 1];
  const otherwise = is(last, "Else") ? positional(rest.pop()) : [];
  return api.call("If", await read(condition), await ask("CodeStatements", ...rest), await ask("CodeStatements", ...otherwise));`,
    ),
    w(
      'In Python an "if" with no "else" has no otherwise; "elif" goes on as another if.',
      `const [condition, ...rest] = parts;
  const last = rest[rest.length - 1];
  const tail = is(last, "Else") || is(last, "Elif") ? rest.pop() : undefined;
  const then = await ask("CodeStatements", ...rest);
  if (!tail) return api.call("If", await read(condition), then);
  const otherwise = is(tail, "Elif") ? await read({ head: "If", args: tail.args }) : await ask("CodeStatements", ...positional(tail));
  return api.call("If", await read(condition), then, otherwise);`,
      READS_PY,
    ),
  ],''')
rep('''      'In Python, "x = 1" to a bare name is where x begins: a variable that can change (Var).',
      `const [place, value] = parts;
  const p = await read(place);
  const bare = p !== null && typeof p === "object" && "variable" in p;
  return api.call(bare ? "Var" : "Assign", p, await read(value));`,''', '''      'In Python, "x = 1" is where x begins, or begins again: a variable that can change (Var).',
      `return api.call("Var", await read(parts[0]), await read(parts[1]));`,''')
open(p, 'w').write(s)

p = 'words.mjs'
s = open(p).read()
old = '''  ["Index", ["Opener", "Postfix"], undefined, "Binds(200)"],'''
assert old in s
s = s.replace(old, old + '''\n  ["Apply", ["Opener", "Postfix", "Round"], undefined, "Binds(200)"],''')
open(p, 'w').write(s)

p = 'hear.js'
s = open(p).read()
old = '''    if (heads[i] === "Brackets" && ends(i - 1) && !header) become(i, "Index");'''
new = '''    if (heads[i] === "Brackets" && ends(i - 1) && !header) become(i, "Index");
    // "(" right after a closed group that is not a header: what it gives, called ("f(x)(y)").
    if (heads[i] === "Parens" && is(i - 1, "Closer") && !header && heads[i - 1] !== undefined && pair[i - 1] >= 0 && !is(pair[i - 1], "Scope") && !is(pair[i - 1], "Attached")) become(i, "Apply");'''
assert old in s
s = s.replace(old, new)
open(p, 'w').write(s)

p = 'opener.js'
s = open(p).read()
# Apply is Postfix and Round: postfix branch comes before the round branch already
open(p, 'w').write(s)

os.chdir('../..')
p = 'src/runtime/host.ts'
s = open(p).read()
old = '''    const quote = at(QUOTE);
    if (quote) {
      let k = i + quote.length;'''
new = '''    // A letter or two right before a quote says how the text is read (Python's r"", b"").
    const prefix = options.stringPrefixes ? /[rRbBuUfF]{1,2}(?="|')/y : undefined;
    const lead = prefix ? at(prefix) : undefined;
    if (lead) i += lead.length;
    const quote = at(QUOTE);
    if (lead && !quote) i -= lead.length;
    if (quote) {
      let k = i + quote.length;'''
assert old in s
s = s.replace(old, new)
old = '''      const said = text.slice(i, k + quote.length);
      push({ text: said, kind: "text", value: unescape(said.slice(quote.length, -quote.length)) });
      i += said.length;
      continue;'''
new = '''      const said = text.slice(i, k + quote.length);
      const inner = said.slice(quote.length, -quote.length);
      push({ text: (lead ?? "") + said, kind: "text", value: lead && /r/i.test(lead) ? inner : unescape(inner) });
      i += said.length;
      continue;'''
assert old in s
s = s.replace(old, new)
s = s.replace('templates?: string; regex?: boolean; regexAfter?: readonly string[] } = {},', 'templates?: string; regex?: boolean; regexAfter?: readonly string[]; stringPrefixes?: boolean } = {},')
open(p, 'w').write(s)
p = 'src/runtime/evaluator.ts'
s = open(p).read()
s = s.replace('regex?: boolean; regexAfter?: readonly string[] }): CodeWord[];', 'regex?: boolean; regexAfter?: readonly string[]; stringPrefixes?: boolean }): CodeWord[];')
open(p, 'w').write(s)

p = 'scratch/code-hearing/hear.js'
s = open(p).read()
s = s.replace('''  const regex = claims(language.head, "RegexLiterals").length > 0;''', '''  const regex = claims(language.head, "RegexLiterals").length > 0;
  const stringPrefixes = claims(language.head, "StringPrefixes").length > 0;''')
s = s.replace('''regex: regex, regexAfter: leading });''', '''regex: regex, regexAfter: leading, stringPrefixes });''')
open(p, 'w').write(s)
p = 'scratch/code-hearing/gen.mjs'
s = open(p).read()
s = s.replace('Concept(Python(), Comments("#"), Offside())', 'Concept(Python(), Comments("#"), Offside(), StringPrefixes())')
open(p, 'w').write(s)
