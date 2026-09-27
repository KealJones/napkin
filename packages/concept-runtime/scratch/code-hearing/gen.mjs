// SPIKE: writes packs/code-hearing.ncon from the JavaScript bodies beside this file.
// Run after `pnpm build`: node scratch/code-hearing/gen.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importTypeScript } from "../../dist/code/import.js";
import { formatNcon } from "../../dist/code/format.js";
import { format, isCall } from "../../dist/concept/expression.js";

const here = dirname(fileURLToPath(import.meta.url));
const js = (file, subs = {}) => {
  let src = readFileSync(join(here, file), "utf8");
  for (const [k, v] of Object.entries(subs)) src = src.replaceAll(k, v);
  const r = importTypeScript(`const body = ${src};`);
  if (r.unsupported.length) throw new Error(`${file}: ${JSON.stringify(r.unsupported)}`);
  let e = r.expression; // Module(Bind($body, <ir>))
  e = e.args[0].value;
  if (!isCall(e) || e.head !== "Bind") throw new Error(`${file}: ${format(e).slice(0, 80)}`);
  return `Code(ir = ${format(e.args[1].value)})`;
};
const HEARS = "Hearing(Code($language))";
const READS = "Context(Code($language), Reading())";
const hears = (file) => `Realization($word, context = ${HEARS}, evaluateArguments = false, body = ${js(file)})`;
// What a composed body builds is code already, so it is built under Code() alone and not read again.
const reads = (pattern, body, { context = READS, evaluate = true } = {}) =>
  `Realization(${pattern}, context = ${context}${evaluate ? "" : ", evaluateArguments = false"}${body.startsWith("Code(") ? "" : ", resultContext = Code()"}, body = ${body})`;
// A word read as what it already names in the code IR: built, not read again.
const keeps = (head) => `Realization(${head}(Rest($xs)), context = ${READS}, resultContext = Code(), body = ${head}(Rest($xs)))`;
const PY = "Context(Code(Python()), Reading())";

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

Concept(JavaScript(), Comments("//", "/*"))

Concept(TypeScript(), Comments("//", "/*"))

// What code's words are, for hearing.
Concept(CodeWord(), IsA(Category()))`);

say(`// Code heard: its words, the links they find in rounds, each word written as its Concept.
Concept(Hear(), Realization(Hear($text), context = Context(Execution(), Code($language)), evaluateArguments = false, body = ${js("hear.js")}))`);
say(`// What a word hearing code sees: the kinds around it and the groups the links have made.
Concept(CodeView(), Realization(CodeView($prompt, $links), context = ${HEARS}, evaluateArguments = false, body = ${js("view.js")}))`);
say(`// An operator or a leading word reads as the Concept it is a synonym of ("+" is Plus, a
// synonym of Add), or else as itself, its arguments read.
Concept(Infix(), IsA(CodeWord()), ${hears("infix.js")}, ${reads("$word", js("reads-as.js"))})`);
say(`Concept(Prefix(), IsA(CodeWord()), ${hears("prefix.js")}, ${reads("$word", js("reads-as.js"))})`);
say(`Concept(Opener(), IsA(CodeWord()), ${hears("opener.js")})`);
say(`Concept(Block(), IsA(Opener()), IsA(CodeWord()))`);
say(`Concept(Closer(), IsA(CodeWord()))`);
say(`Concept(Separator(), IsA(CodeWord()))`);
say(`Concept(Else(), ${hears("else.js")}, ${keeps("Else")})`);

// Symbols and the words they spell; how tightly each operator binds (higher is tighter).
const infix = [
  ["Dot", ".", "Binds(20)"],
  ["Power", "**", "Binds(14, Right())"],
  ["Times", "*", "Binds(12)"],
  ["Over", "/", "Binds(12)"],
  ["Modulo", "%", "Binds(12)"],
  ["Plus", "+", "Binds(11)"],
  ["Minus", "-", "Binds(11)"],
  ["Greater", ">", "Binds(9)"],
  ["Less", "<", "Binds(9)"],
  ["AtLeast", ">=", "Binds(9)"],
  ["AtMost", "<=", "Binds(9)"],
  ["In", undefined, "Binds(9)"],
  ["Equals", "===", "Binds(8)"],
  ["NotEquals", "!==", "Binds(8)"],
  ["And", "&&", "Binds(5)"],
  ["Or", "||", "Binds(4)"],
  ["Of", undefined, "Binds(3)"],
  ["Assign", "=", "Binds(2, Right())"],
];
say("// Operators: symbols spell words, and each binds as tightly as its Binds says.");
// Plus, Times, Minus and Over are synonyms of Add, Multiply, Subtract and Divide already (basic.ncon).
const SYNONYM = { Greater: "GreaterThan", Less: "LessThan" };
for (const [head, sym, binds] of infix) {
  const parts = [`IsA(Infix())`];
  if (sym) parts.push(`Spelled(${JSON.stringify(sym)})`);
  if (head === "Equals") parts.push(`Relation(Spelled("=="), context = Code(Python()))`);
  if (head === "NotEquals") parts.push(`Relation(Spelled("!="), context = Code(Python()))`);
  parts.push(binds);
  if (SYNONYM[head]) parts.push(`SynonymOf(${SYNONYM[head]}())`);
  if (head === "Minus") parts.push(reads("Minus($a)", "Negate($a)"));
  else if (head === "Dot") parts.push(reads("$word", js("dot.js"), { evaluate: false }));
  else if (head === "Assign") parts.push(reads("Assign($place, $value)", js("assign.js")), reads("Assign($place, $value)", js("assign-python.js"), { context: PY }));
  say(`Concept(${head}(), ${parts.join(", ")})`);
}
say(`Concept(Not(), IsA(Prefix()), Spelled("!"), Binds(15), Relation(Binds(6), context = Code(Python())))`);

say("// Words that lead: each takes what follows it, as far as its Binds lets it.");
say(`Concept(Const(), IsA(Prefix()), Binds(18))`);
say(`Concept(Let(), IsA(Prefix()), Binds(18))`);
say(`Concept(Var(), IsA(Prefix()), Binds(18))`);
say(`Concept(Return(), IsA(Prefix()), Binds(0))`);
say(`Concept(For(), IsA(Prefix()), Binds(0), ${reads("For($header, Rest($body))", js("for.js", { __LOOPS__: '{ Of: "ForOf", In: "ForIn" }' }))}, ${reads("For($header, Rest($body))", js("for.js", { __LOOPS__: '{ In: "ForOf" }' }), { context: PY })})`);
say(`Concept(If(), IsA(Prefix()), Binds(0), ${reads("If($condition, Rest($then))", js("if.js"))})`);
say(`Concept(While(), IsA(Prefix()), Binds(0))`);
say(`Concept(Function(), IsA(Prefix()), Binds(0), ${reads("Function($signature, Rest($body))", js("function.js"))})`);
say(`Concept(Def(), IsA(Prefix()), Binds(0), ${reads("Def($signature, Rest($body))", js("function.js"), { context: PY })})`);

say("// Brackets, separators and layout.");
say(`Concept(OpenParen(), IsA(Opener()), Spelled("("))`);
say(`Concept(CloseParen(), IsA(Closer()), Spelled(")"))`);
say(`Concept(OpenBracket(), IsA(Opener()), Spelled("["))`);
say(`Concept(CloseBracket(), IsA(Closer()), Spelled("]"))`);
say(`Concept(OpenBrace(), IsA(Block()), Spelled("{"))`);
say(`Concept(CloseBrace(), IsA(Closer()), Spelled("}"))`);
say(`Concept(Indent(), IsA(Block()))`);
say(`Concept(Dedent(), IsA(Closer()))`);
say(`Concept(Comma(), IsA(Separator()), Spelled(","))`);
say(`Concept(Semicolon(), IsA(Separator()), Spelled(";"))`);
say(`Concept(Colon(), IsA(Separator()), Spelled(":"))`);
say(`Concept(Newline(), IsA(Separator()))`);

say("// Reading what was heard as the code IR.");
say(`Concept(Concept(), ${reads("$word", js("read-default.js"))})`);
say(`Concept(Phrases(), ${reads("Phrases(Rest($statements))", js("phrases.js"))})`);
say(`Concept(Comment(), ${keeps("Comment")})`);
say(`Concept(Number(), ${reads("Number($said)", js("number.js", { __SUFFIX__: '{ n: "BigInt" }' }))}, ${reads("Number($said)", js("number.js", { __SUFFIX__: "{}" }), { context: PY })})`);
say("// Python's own words for values and for doing nothing.");
say(`Concept(True(), ${reads("True(Rest($_))", "true", { context: PY })})`);
say(`Concept(False(), ${reads("False(Rest($_))", "false", { context: PY })})`);
say(`Concept(None(), ${reads("None(Rest($_))", "null", { context: PY })})`);
say(`Concept(Pass(), ${reads("Pass()", "Undefined()", { context: PY })})`);

writeFileSync(join(here, "../../packs/code-hearing.ncon"), formatNcon(out.join("\n\n") + "\n"));
console.log("wrote packs/code-hearing.ncon");
