import os
os.chdir('scratch/code-hearing')
p = 'binds.mjs'
s = open(p).read()
s = s.replace('''      if (three && slot(three[0]) && lit(three[1]).length && slot(three[2])) for (const op of lit(three[1])) if (!infix.has(op)) infix.set(op, { level: level(p), right: rt });
      if (members.length === 2 && lit(members[0]).length && slot(members[1])) for (const op of lit(members[0])) if (!prefix.has(op)) prefix.set(op, { level: level(p) });''', '''      // Where an operator appears in several rules, the tightest is its own (Python's "|" is
      // also a pattern's alternatives).
      const keep = (m, op, x) => (!m.has(op) || m.get(op).level < x.level) && m.set(op, x);
      if (three && slot(three[0]) && lit(three[1]).length && slot(three[2])) for (const op of lit(three[1])) keep(infix, op, { level: level(p), right: rt });
      if (members.length === 2 && lit(members[0]).length && slot(members[1])) for (const op of lit(members[0])) keep(prefix, op, { level: level(p) });''')
open(p, 'w').write(s)

p = 'gen.mjs'
s = open(p).read()
old = '''import { js } from "./lib.mjs";'''
new = '''import { js } from "./lib.mjs";
import { deriveBinds } from "./binds.mjs";

// How tightly operators bind in each language, from its tree-sitter grammar (binds.mjs): an
// operator between two things whose binding falls among the ones written here (not assignments,
// which the words below say, nor "as"), and a leading word before one thing.
const GRAMMARS = { "Code(TypeScript())": "tree-sitter-typescript/typescript/src/grammar.json", "Code(Python())": "tree-sitter-python/src/grammar.json" };
const derived = new Map(); // head -> [relation]
const spelledAs = (op) => WORDS.find((w) => w[2] === op || (w[2] === undefined && w[0] === op[0].toUpperCase() + op.slice(1)))?.[0];
for (const [lang, file] of Object.entries(GRAMMARS)) {
  const d = deriveBinds(file);
  for (const [op, x] of d.infix) {
    const head = spelledAs(op);
    if (!head || x.binds < 30 || x.binds > 200 || (/=$/.test(op) && !/^(==|!=|===|!==|<=|>=)$/.test(op)) || ["As", "Satisfies", "Colon"].includes(head)) continue;
    derived.set(head, [...(derived.get(head) ?? []), `Relation(Binds(${x.binds}${x.right ? ", Right()" : ""}), context = ${lang})`]);
  }
  for (const [op, x] of d.prefix) {
    const head = spelledAs(op);
    if (!head || x.binds < 30 || x.binds > 200 || WORDS.find((w) => w[0] === head)?.[1].includes("Infix")) continue;
    derived.set(head, [...(derived.get(head) ?? []), `Relation(Binds(${x.binds}), context = ${lang})`]);
  }
}'''
assert old in s
s = s.replace(old, new)
old = '''  if (head === "Question") parts.push(hears("question.js"));'''
new = '''  // Derived from the grammar, preferred in its language over what is written here.
  parts.push(...(derived.get(head) ?? []));
  if (head === "Question") parts.push(hears("question.js"));'''
assert old in s
s = s.replace(old, new)
s = s.replace('''writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\\n\\n") + "\\n"));''', '''writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\\n\\n") + "\\n"));
console.log("derived Binds:", [...derived.values()].flat().length, "relations on", derived.size, "words");''')
open(p, 'w').write(s)
