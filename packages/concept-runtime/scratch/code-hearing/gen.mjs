// SPIKE: writes packs/code-hearing.ncon from the JavaScript bodies beside this file (the words
// themselves are packs/codewords.ncon, written by hand), and packs/codebinds.ncon from the
// languages' tree-sitter grammars. Run after `pnpm build`: node scratch/code-hearing/gen.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatNcon } from "../../dist/code/format.js";
import { ConceptStore } from "../../dist/store/store.js";
import { seed } from "../../dist/seed/seed.js";
import { readdirSync, readFileSync } from "node:fs";
import { js, readsWord } from "./lib.mjs";
import { deriveBinds } from "./binds.mjs";

// How tightly operators bind in each language, from its tree-sitter grammar (binds.mjs): an
// operator between two things whose binding falls among the ones written here (not assignments,
// which the words below say, nor "as"), and a leading word before one thing.
const GRAMMARS = { "Code(TypeScript())": "tree-sitter-typescript/typescript/src/grammar.json", "Code(Python())": "tree-sitter-python/src/grammar.json" };
const derived = new Map(); // head -> [relation]
// Which word an operator is: the one the graph says spells it, or the keyword of that name.
const store = new ConceptStore();
seed(store);
const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
const spelling = new Map();
const kindsOf = new Map();
for (const u of store.all()) {
  for (const r of u.relations) {
    if (isCall(r.claim) && r.claim.head === "Spelled") spelling.set(r.claim.args[0].value, u.identity);
    if (isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value)) kindsOf.set(u.identity, [...(kindsOf.get(u.identity) ?? []), r.claim.args[0].value.head]);
  }
}
const spelledAs = (op) => spelling.get(op) ?? (/^[a-z]/.test(op) && store.get(op[0].toUpperCase() + op.slice(1)) ? op[0].toUpperCase() + op.slice(1) : undefined);
for (const [lang, file] of Object.entries(GRAMMARS)) {
  const d = deriveBinds(file);
  for (const [op, x] of d.infix) {
    const head = spelledAs(op);
    if (!head || x.binds < 30 || x.binds > 200 || (/=$/.test(op) && !/^(==|!=|===|!==|<=|>=)$/.test(op)) || ["As", "Satisfies", "Colon"].includes(head)) continue;
    derived.set(head, [...(derived.get(head) ?? []), `Relation(Binds(${x.binds}${x.right ? ", Right()" : ""}), context = ${lang})`]);
  }
  for (const [op, x] of d.prefix) {
    const head = spelledAs(op);
    if (!head || x.binds < 30 || x.binds > 200 || (kindsOf.get(head) ?? []).includes("Infix")) continue;
    derived.set(head, [...(derived.get(head) ?? []), `Relation(Binds(${x.binds}), context = ${lang})`]);
  }
}
const here = dirname(fileURLToPath(import.meta.url));

const HEARS = "Hearing(Code($language))";
const READS = "Context(Code($language), Reading())";
const hears = (file) => `Realization($word, context = ${HEARS}, evaluateArguments = false, body = ${js(file)})`;
const SENSES = "Sensing(Code($language))";
const senses = (file) => `Realization($word, context = ${SENSES}, evaluateArguments = false, body = ${js(file)})`;

// What the grammars say, as data: packs/codebinds.ncon.
const binds = [`// How tightly operators bind in each language, from its tree-sitter grammar (grammar.json),
// written by scratch/code-hearing/gen.mjs. Do not edit by hand; derive it again. Where a
// language says, it wins over what packs/codewords.ncon says for every language.
Requires(CodeWords())`];
for (const [head, rs] of derived) binds.push(`Concept(${head}(), ${rs.join(", ")})`);
writeFileSync(join(here, "../../packs/codebinds.ncon"), formatNcon(binds.join("\n\n") + "\n"));

const out = [];
const say = (s) => out.push(s);
say(`// SPIKE (spike/hear-code-words): code heard the way a message is. Each word of the code is
// its own Concept (packs/codewords.ncon). Before the links, each says what it is here under
// Sensing(Code(<language>)); then each hears under Hearing(Code(<language>)): an operator takes
// the things either side of it, a leading word takes what follows, a bracket groups, a block
// belongs to the word that leads it. The heard words then realize, under
// Context(Code(<language>), Reading()), as the code IR (ForOf, Func, If, Call ...), which the
// language packs write out. Bodies written from the JavaScript in scratch/code-hearing by gen.mjs.
Requires(Hearing(), Code(), Python(), TypeScript(), CodeWords(), CodeBinds(), CodeReadings())

// What a word says about itself, here: Sense(position, Concept).
Concept(Sense(), IsA(Data()))

// "}" closes "{": a bracket and its end.
Concept(Closes(), IsA(LinkRole()))

// Before the links, what each word is here: a word says it under Sensing(), and nothing it does
// elsewhere runs.
Concept(Sensing(), IsA(ContextFacet()), Exclusive())`);
say(`// Code heard: what each word is, the links they find in rounds, each word written as its Concept.
Concept(Hear(), Realization(Hear($text), context = Context(Execution(), Code($language)), evaluateArguments = false, body = ${js("hear.js")}))`);
say(`// What a word hearing code sees: the kinds around it and the groups the links have made.
Concept(CodeView(), Realization(CodeView($prompt, $links), context = ${HEARS}, evaluateArguments = false, body = ${js("view.js")}))`);
say(`// Between two things: takes them by how tightly it binds. A word of the language used as a
// name ("x.in", "{ from: 1 }") says it is only a name.
Concept(Infix(), ${senses("asname.js")}, ${hears("infix.js")})`);
say(`// Before a thing: takes what follows. Used as a name, only a name.
Concept(Prefix(), ${senses("asname.js")}, ${hears("prefix.js")})`);
say(`// A bracket: finds what closes it, then groups what it holds, for whoever it belongs to.
Concept(Opener(), ${senses("pair.js")}, ${hears("opener.js")})`);
say(`// Goes on from the statement before it. Used as a name, only a name.
Concept(Continues(), ${senses("asname.js")}, ${hears("else.js")})`);
say(`// "a ? b : c": finds its ":", then takes what is asked and the two answers.
Concept(Question(), ${senses("question-pair.js")}, ${hears("question.js")})`);
say(`// "<" after a name, closing on a ">" around nothing that computes: the name's angles.
Concept(Less(), ${senses("less.js")})`);
say(`// ":" before a block only separates it; right after round brackets, what they give.
Concept(Colon(), ${senses("colon.js")})`);
say(`// "{" where a statement starts, or after what a block follows: a block.
Concept(Braces(), ${senses("braces.js")})`);
say(`// "[" after a thing: its index.
Concept(Brackets(), ${senses("brackets.js")})`);
say(`// "(" after a closed group: what it gives, called.
Concept(Parens(), ${senses("parens.js")})`);
say("// Reading what was heard as the code IR, where that works something out: each Concept's own, from\n// read/<Concept>.js (read/<Concept>.<Language>.js for one language only). Readings that only say\n// it with other Concepts are packs/codereadings.ncon.");
for (const file of readdirSync(join(here, "read")).filter((f) => f.endsWith(".js")).sort()) {
  const [head, language] = file.replace(/\.js$/, "").split(".");
  const context = language ? `Context(Code(${language}()), Reading())` : "Context(Code($language), Reading())";
  say(`Concept(${head}(), ${readsWord(readFileSync(join(here, "read", file), "utf8"), context)})`);
}
writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\n\n") + "\n"));
console.log("derived Binds:", [...derived.values()].flat().length, "relations on", derived.size, "words");
console.log("wrote packs/code-hearing.ncon, packs/codebinds.ncon");
