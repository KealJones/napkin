// SPIKE: writes packs/code-hearing.ncon from the JavaScript bodies beside this file and the
// words in words.mjs. Run after `pnpm build`: node scratch/code-hearing/gen.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatNcon } from "../../dist/code/format.js";
import { WORDS } from "./words.mjs";
import { READINGS } from "./readings.mjs";
import { js } from "./lib.mjs";
const here = dirname(fileURLToPath(import.meta.url));

const HEARS = "Hearing(Code($language))";
const READS = "Context(Code($language), Reading())";
const hears = (file) => `Realization($word, context = ${HEARS}, evaluateArguments = false, body = ${js(file)})`;

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
Concept(Python(), Comments("#"), Offside())

Concept(JavaScript(), Comments("//", "/*"), Templates("\`"), RegexLiterals())

Concept(TypeScript(), Comments("//", "/*"), Templates("\`"), RegexLiterals())

// What code's words are, for hearing.
Concept(CodeWord(), IsA(Category()))`);

say(`// Code heard: its words, the links they find in rounds, each word written as its Concept.
Concept(Hear(), Realization(Hear($text), context = Context(Execution(), Code($language)), evaluateArguments = false, body = ${js("hear.js")}))`);
say(`// What a word hearing code sees: the kinds around it and the groups the links have made.
Concept(CodeView(), Realization(CodeView($prompt, $links), context = ${HEARS}, evaluateArguments = false, body = ${js("view.js")}))`);
const kinds = {
  Infix: `// Between two things: takes them by how tightly it binds.\nConcept(Infix(), IsA(CodeWord()), ${hears("infix.js")})`,
  Prefix: `// Before a thing: takes what follows.\nConcept(Prefix(), IsA(CodeWord()), ${hears("prefix.js")})`,
  Opener: `// A bracket: groups what it holds, for whoever it belongs to.\nConcept(Opener(), IsA(CodeWord()), ${hears("opener.js")})`,
  Continues: `// Goes on from the statement before it.\nConcept(Continues(), IsA(Prefix()), IsA(CodeWord()), ${hears("else.js")})`,
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
  if (typeof binds === "string") parts.push(here(binds));
  parts.push(...(Array.isArray(binds) ? binds : []), ...(Array.isArray(extra) ? extra.map((x) => (x.startsWith("Relation(") ? x : here(x))) : []));
  if (head === "Question") parts.push(hears("question.js"));
  parts.push(...(READINGS[head] ?? []));
  say(`Concept(${head}(), ${parts.join(", ")})`);
}
say("// Reading what was heard as the code IR.");
for (const [head, rs] of Object.entries(READINGS)) {
  if (!WORDS.some((w) => w[0] === head)) say(`Concept(${head}(), ${rs.join(", ")})`);
}
writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\n\n") + "\n"));
console.log("wrote packs/code-hearing.ncon");
