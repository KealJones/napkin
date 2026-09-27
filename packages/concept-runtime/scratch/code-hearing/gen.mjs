// SPIKE: writes packs/code-hearing.ncon from the JavaScript bodies beside this file and the
// words in words.mjs. Run after `pnpm build`: node scratch/code-hearing/gen.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatNcon } from "../../dist/code/format.js";
import { WORDS } from "./words.mjs";
import { READINGS } from "./readings.mjs";
import { js } from "./lib.mjs";
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
}
const here = dirname(fileURLToPath(import.meta.url));

const HEARS = "Hearing(Code($language))";
const READS = "Context(Code($language), Reading())";
const hears = (file) => `Realization($word, context = ${HEARS}, evaluateArguments = false, body = ${js(file)})`;
const SENSES = "Sensing(Code($language))";
const senses = (file) => `Realization($word, context = ${SENSES}, evaluateArguments = false, body = ${js(file)})`;

const out = [];
const say = (s) => out.push(s);
say(`// SPIKE (spike/hear-code-words): code heard the way a message is. Each word of the code is
// its own Concept and hears under Hearing(Code(<language>)): an operator takes the things either
// side of it, a leading word takes what follows, a bracket groups, a block belongs to the word
// that leads it. The heard words then realize, under Context(Code(<language>), Reading()), as
// the code IR (ForOf, Func, If, Call ...), which the language packs write out. Written from the
// JavaScript in scratch/code-hearing by gen.mjs.
Requires(Hearing(), Code(), Python(), TypeScript())

// How a language lays its words out.
Concept(Python(), Comments("#"), Offside(), StringPrefixes())

Concept(JavaScript(), Comments("//", "/*"), Templates("\`"), RegexLiterals())

Concept(TypeScript(), Comments("//", "/*"), Templates("\`"), RegexLiterals())

// What code's words are, for hearing.
Concept(CodeWord(), IsA(Category()))`);

say(`// Code heard: its words, the links they find in rounds, each word written as its Concept.
Concept(Hear(), Realization(Hear($text), context = Context(Execution(), Code($language)), evaluateArguments = false, body = ${js("hear.js")}))`);
say(`// What a word says about itself, here (hearing): Sense(position, Concept).
Concept(Sense(), IsA(Data()))

// "}" closes "{": the link a bracket's end has to it.
Concept(Closes(), IsA(LinkRole()))

// Before the links, what each word is here: a word says it under Sensing(), and nothing it does
// elsewhere runs.
Concept(Sensing(), IsA(ContextFacet()), Exclusive())`);
say(`// What a word hearing code sees: the kinds around it and the groups the links have made.
Concept(CodeView(), Realization(CodeView($prompt, $links), context = ${HEARS}, evaluateArguments = false, body = ${js("view.js")}))`);
const kinds = {
  Infix: `// Between two things: takes them by how tightly it binds. A word of the language used as a\n// name ("x.in", "{ from: 1 }") says it is only a name.\nConcept(Infix(), IsA(CodeWord()), ${senses("asname.js")}, ${hears("infix.js")})`,
  Prefix: `// Before a thing: takes what follows. Used as a name, only a name.\nConcept(Prefix(), IsA(CodeWord()), ${senses("asname.js")}, ${hears("prefix.js")})`,
  Opener: `// A bracket: finds what closes it, then groups what it holds, for whoever it belongs to.\nConcept(Opener(), IsA(CodeWord()), ${senses("pair.js")}, ${hears("opener.js")})`,
  Continues: `// Goes on from the statement before it. Used as a name, only a name.\nConcept(Continues(), IsA(Prefix()), IsA(CodeWord()), ${senses("asname.js")}, ${hears("else.js")})`,
  Scope: "// A block of statements.\nConcept(Scope(), IsA(Opener()), IsA(CodeWord()))",
  Closer: "Concept(Closer(), IsA(CodeWord()))",
  Separator: "Concept(Separator(), IsA(CodeWord()))",
  Round: "// Round brackets: after a name, its arguments.\nConcept(Round(), IsA(CodeWord()))",
  Postfix: "// Takes the thing before it too.\nConcept(Postfix(), IsA(CodeWord()))",
  Attached: "// Belongs to the name before it.\nConcept(Attached(), IsA(CodeWord()))",
  Juxtaposed: "// Takes each thing inside it, with nothing between them.\nConcept(Juxtaposed(), IsA(CodeWord()))",
  Transparent: "// Only how its one thing is said.\nConcept(Transparent(), IsA(CodeWord()))",
  Heads: "// Heads a statement: a bracketed header, then what it heads.\nConcept(Heads(), IsA(CodeWord()))",
  Unary: "// Can stand before a thing alone: \"-x\".\nConcept(Unary(), IsA(CodeWord()))",
  Callable: "// Leads, and can also be called: \"import(...)\".\nConcept(Callable(), IsA(CodeWord()))",
  Contextual: "// A word of the language only where it is not used as a name: \"get(x)\" calls get.\nConcept(Contextual(), IsA(CodeWord()))",
  TakesBlock: "// A brace after it opens a block.\nConcept(TakesBlock(), IsA(CodeWord()))",
};
for (const k of Object.values(kinds)) say(k);
say("// The words, their spellings, and how tightly each binds (higher is tighter).");
for (const entry of WORDS) {
  // A word that is one only in some language says so on each of its relations.
  const only = typeof entry[entry.length - 1] === "string" && entry[entry.length - 1].startsWith("Code(") ? entry[entry.length - 1] : undefined;
  const [head, ks, sym, binds, extra] = only ? entry.slice(0, -1) : entry;
  const here = (claim) => (only ? `Relation(${claim}, context = ${only})` : claim);
  const parts = ks.map((k) => here(k === "Keyword" ? "Keyword()" : `IsA(${k}())`));
  if (sym) parts.push(here(`Spelled(${JSON.stringify(sym)})`));
  // Written here only where no grammar says it for every language the word is in.
  const both = Object.keys(GRAMMARS).every((lang) => (derived.get(head) ?? []).some((r) => r.includes(lang)) || (only && only !== lang));
  if (typeof binds === "string" && !both) parts.push(here(binds));
  parts.push(...(Array.isArray(binds) ? binds : []), ...(Array.isArray(extra) ? extra.map((x) => (x.startsWith("Relation(") ? x : here(x))) : []));
  // Derived from the grammar, preferred in its language over what is written here.
  parts.push(...(derived.get(head) ?? []));
  // What a word says it is here, where only it can tell (Sensing), and its own hearing.
  const SENSE = { Question: "question-pair.js", Less: "less.js", Colon: "colon.js", Braces: "braces.js", Brackets: "brackets.js", Parens: "parens.js" };
  if (SENSE[head]) parts.push(senses(SENSE[head]));
  if (head === "Question") parts.push(hears("question.js"));
  parts.push(...(READINGS[head] ?? []));
  say(`Concept(${head}(), ${parts.join(", ")})`);
}
say("// Reading what was heard as the code IR.");
for (const [head, rs] of Object.entries(READINGS)) {
  if (!WORDS.some((w) => w[0] === head)) say(`Concept(${head}(), ${rs.join(", ")})`);
}
writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\n\n") + "\n"));
console.log("derived Binds:", [...derived.values()].flat().length, "relations on", derived.size, "words");
console.log("wrote packs/code-hearing.ncon");
