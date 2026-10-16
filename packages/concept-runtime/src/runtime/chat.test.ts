import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { say } from "../ears/say.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const store = new ConceptStore();
seed(store);
// What Napkin says to a message: behaviour is what is said, not the form it is held in.
const ask = async (text: string) => (await turn(new Runtime(store), text, c("Execution"), { learn: false })).spoken;
const NOT_TALK = /tell me more|stuck|couldn't read|can't put it into words/i;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inDays = (n: number) => DAYS[new Date(Date.now() + n * 86_400_000).getDay()];

test("the when said after what is asked belongs to it", async () => {
  assert.match(await ask("what day will it be tomorrow"), new RegExp(inDays(1)!, "i"));
  assert.match(await ask("what day will it be in 5 days"), new RegExp(inDays(5)!, "i"));
  assert.match(await ask("what's the date tomorrow"), new RegExp(inDays(1)!, "i"));
  assert.match(await ask("what day is it"), new RegExp(inDays(0)!, "i"));
});

test("roots and percents, said the way people say them", async () => {
  assert.match(await ask("what is the square root of 144"), /\b12\b/);
  assert.match(await ask("whats the cube root of 27"), /\b3\b/);
  assert.match(await ask("what is 15% of 80"), /\b12\b/);
});

test("small talk is answered, not looked up", async () => {
  const talk: [string, RegExp][] = [
    ["good morning", /morning|hello|\bhi\b/i],
    ["how are you?", /good|well|fine|doing/i],
    ["cool", /glad|nice|great|cool/i],
    ["ok", /okay|got it|sure/i],
    ["lol", /\bha|laugh|glad|funny/i],
    ["good night", /night|bye|sleep/i],
  ];
  for (const [said, wanted] of talk) {
    const reply = await ask(said);
    assert.match(reply, wanted, `${said} -> ${reply}`);
    assert.doesNotMatch(reply, NOT_TALK, `${said} -> ${reply}`);
  }
  assert.doesNotMatch(await ask("ok"), /how do you feel/i);
  assert.equal(await say("cool", c("Answer", c("GladYouLikeIt"))), "Glad you like it!");
});

test("the system can say who it is and what it can do", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  assert.match(await ask("what is your name"), /napkin/i);
  assert.match(await ask("what can you do"), /arithmetic|calculat|math|add|answer/i);
  assert.match(await ask("who are you"), /napkin|assistant|\bAI\b/i);
  assert.doesNotMatch(await ask("who are you"), /what can you do|I can .*, .*, .*, /i, "capabilities are answered when asked, not recited");
});

test("everyday arithmetic words, chains of steps, and comparisons", async () => {
  assert.match(await ask("what is half of 90"), /\b45\b/);
  assert.match(await ask("what is double 8"), /\b16\b/);
  assert.match(await ask("what's the average of 2, 4 and 9"), /\b5\b/);
  assert.match(await ask("take 10, double it, then subtract 5"), /\b15\b/);
  assert.match(await ask("is 100 more than 99"), /^yes/i);
  assert.match(await ask("is 3 bigger than 5"), /^no/i);
});

test("each question in a message is answered", async () => {
  assert.equal(await say("cool, thanks", c("Sequence", c("Answer", c("GladYouLikeIt")), c("Answer", c("YoureWelcome")))), "Glad you like it! You're welcome!");
});

test("holidays are dates, and being told it was wrong is apologised for", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  const days = await ask("how many days until christmas");
  assert.match(days, /\d+ days?/i);
  assert.match(await ask("that was wrong"), /sorry/i);
  assert.match(await ask("no"), /okay|ok\b|alright/i);
});

test("a work sharing a word's name is learned as a namesake, not as what the word is", async () => {
  const { parse, format } = await import("../concept/expression.js");
  const learned = new ConceptStore();
  seed(learned);
  await new Runtime(learned).evaluate(
    parse('Concept(identity="Volcano", relations=List(IsA(Landform()), IsA(ElectronicGame())), realizations=List())'),
    c("Execution"),
  );
  const held = learned.get("Volcano")!.relations.map((r) => [format(r.claim), r.context ? format(r.context) : ""]);
  assert.deepEqual(held, [["IsA(Landform())", ""], ["IsA(ElectronicGame())", "Namesake()"]]);
});

test("known names read whole, even with a describing word in them", async () => {
  assert.match(await ask("how many days until new years day"), /\d+ days?/i);
});

test("a namesake learned flat is left out of what is said when the word has another category", async () => {
  const { parse, format } = await import("../concept/expression.js");
  const { forSaying } = await import("./individuals.js");
  const said = forSaying(store, parse("Describes(Volcano(), List(IsA(Landform()), IsA(ElectronicGame())))"));
  assert.equal(format(said), "Describes(Volcano(), List(IsA(Landform())))");
  // Known only as a name, the name is what it is.
  assert.equal(format(forSaying(store, parse("Describes(Emmy(), List(IsA(GivenName())))"))), "Describes(Emmy(), List(IsA(GivenName())))");
});

test("a Teacher's IsA held in a sense named after its own object is not saved", async () => {
  const { parse, format } = await import("../concept/expression.js");
  const learned = new ConceptStore();
  seed(learned);
  await new Runtime(learned).evaluate(
    parse('Concept(identity="GeologicalFeature", relations=List(IsA(Landform()), In(IsA(Volcano()), Volcano())), realizations=List())'),
    c("Execution"),
  );
  assert.deepEqual(learned.get("GeologicalFeature")!.relations.map((r) => format(r.claim)), ["IsA(Landform())"]);
});

test("a game reply is said directly, with the board as a labelled grid", async () => {
  const { parse } = await import("../concept/expression.js");
  const spoken = await say("b2", parse('InGame(Game_1(), echo="Tic tac toe against me", Moved(X(), B2()), Moved(O(), A1()), Board("O..", ".X.", "..."))'));
  assert.equal(spoken, "You played B2. I played A1.\n  a b c\n1 O . .\n2 . X .\n3 . . .");
});

test("asking what it knows of a kind looks up the kind's members", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  const known = new ConceptStore();
  seed(known);
  const { concept } = await import("../concept/unit.js");
  known.seed(concept("Robin", { relations: ["IsA(Bird())"] }));
  known.seed(concept("Sparrow", { relations: ["IsA(Bird())"] }));
  known.seed(concept("Moment", { relations: [{ claim: (await import("../concept/expression.js")).parse("IsA(Bird())"), context: c("Namesake") }] }));
  const askIt = async (text: string) => (await turn(new Runtime(known), text, c("Execution"), { learn: false })).spoken;
  assert.match(await askIt("do you know any games?"), /tic.?tac.?toe/i);
  assert.match(await askIt("what games do you know"), /tic.?tac.?toe/i);
  const birds = await askIt("do you know any birds?");
  assert.match(birds, /robin/i);
  assert.match(birds, /sparrow/i);
  assert.doesNotMatch(birds, /moment/i, "a namesake is not a member");
});

/** A conversation, each turn knowing the ones before, on a store of its own. */
const conversation = () => {
  const own = new ConceptStore();
  seed(own);
  const history: { message: string; result: string; spoken?: string }[] = [];
  return async (text: string) => {
    const r = await turn(new Runtime(own), text, c("Execution"), { learn: false, history });
    history.push({ message: text, result: r.result === undefined ? String(r.rendered) : format(r.result), spoken: r.spoken });
    return r.spoken;
  };
};

test("a number word does sums in symbols, and an arithmetic verb works on the last answer", async () => {
  const talk = conversation();
  assert.match(await talk("what is one + 2?"), /\b3\b/);
  assert.match(await talk("what is 1 plus 3?"), /\b4\b/);
  assert.match(await talk("and then add 5?"), /\b9\b/);
});

test("a reference resolves to what was answered, not its text", async () => {
  const talk = conversation();
  await talk("what is 2 plus 2");
  const { resolveReferences } = await import("./references.js");
  const { format, parse } = await import("../concept/expression.js");
  const { expression } = resolveReferences(parse('Times(Ref(""), 2)'), [{ message: "what is 2 plus 2", result: "Answer(4)" }]);
  assert.equal(format(expression!), 'Times(Ref("", resolvedTo=Answer(4)), 2)');
});

test("a kind is described with what its synonyms hold, and as it was said", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  const own = new ConceptStore();
  const { concept } = await import("../concept/unit.js");
  // Seeded first, so seeding derives the synonyms' forwarding, as the graph has it.
  own.seed(concept("Job", { relations: ["SynonymOf(Occupation())", "IsA(Work())", "RelatedTo(Employment())"] }));
  own.seed(concept("Occupation", { relations: ["SynonymOf(Job())"] }));
  seed(own);
  const ask2 = async (text: string) => (await turn(new Runtime(own), text, c("Execution"), { learn: false })).spoken;
  assert.match(await ask2("what is an occupation"), /employment/i);
  assert.match(await ask2("what is an ocupation"), /employment/i);
});

test("a kind said with its words is believed whole, and a job asked for is a kind one is", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  const talk = conversation();
  // Every word said is kept: a compound the lexicon knows, or the kind with its words.
  assert.doesNotMatch(await talk("I am a Senior Software Engineer"), NOT_TALK);
  await talk("a software engineer is an engineer");
  await talk("an engineer is a job");
  assert.match(await talk("what is my job?"), /Engineer/);
});

test("a question that asks more than its subject is not answered with the subject", async () => {
  assert.doesNotMatch(await ask("when you say hello?"), /^hello\W*$/i);
});

test("a sum in symbols, then an arithmetic word, works on the last answer", async () => {
  const talk = conversation();
  assert.match(await talk("what is five + 2"), /\b7\b/);
  assert.match(await talk("add 5"), /\b12\b/);
});

test("what is said of two things joined by or is believed of each, a described kind kept whole", { todo: "recall and belief left the seed (packs/memory.ncon.bak); a target for Pursue" }, async () => {
  const talk = conversation();
  assert.doesNotMatch(await talk("Woops or Whoops is a word you say when you do something wrong on accident"), NOT_TALK);
  assert.match(await talk("what is whoops"), /word|wrong|accident/i);
  assert.match(await talk("what is woops"), /word|wrong|accident/i);
});

test("hearing: what the rules parser heard that hearing does not yet", { todo: "hearing grammar: an adverb after a phrase (\"so much\"), a verb and its particle (\"add up\"), two questions joined by \"and\", an arithmetic word used as a verb (\"times that by 2\"), a mistyped operator (\"time\"), an operator word leading with one number (\"times 3\"), \"I meant\" corrections" }, async () => {
  assert.match(await ask("thank you so much"), /welcome/i);
  assert.match(await ask("add up 3, 4 and 5"), /\b12\b/);
  assert.match(await ask("what is 2 plus 2 and what is 3 times 3"), /\b4\b.*\b9\b/);
  const talk = conversation();
  assert.match(await talk("what is five + 2"), /\b7\b/);
  assert.match(await talk("add 5"), /\b12\b/);
  assert.match(await talk("and time 27"), /\b324\b/);
  // An operator word leading with one number ("times 3"), and "I meant" taking a turn's place.
  const again = conversation();
  await again("what is 2 plus 2");
  await again("times 3");
  assert.match(await again("no, i meant times 5"), /\b20\b/);
  // A second correction replaces the first, so it works on the answer before that: 12.
  assert.match(await again("woops i meant and TIMES 27?"), /\b324\b/);
});

test("arithmetic in symbols, with grouping, powers and fractions, is the sum it writes", async () => {
  assert.match(await ask("what is (2+3)*4"), /\b20\b/);
  assert.match(await ask("what is 2^10"), /\b1024\b/);
  assert.match(await ask("whats 3/4"), /0?\.75/);
  assert.match(await ask("what's 12 * 12 - 4"), /\b140\b/);
});

test("a thing named that works out to a value is answered, and lists and counts are said as words", async () => {
  assert.match(await ask("average of 3, 5, 10"), /\b6\b/);
  assert.match(await ask("sort 5, 3, 9, 1"), /1\D+3\D+5\D+9/);
  assert.match(await ask('reverse "hello"'), /olleh/i);
  assert.match(await ask("how many days until christmas"), /\d+ days?/i);
});

test("what a doing is done to, said with of, and a number with the doing said after it", async () => {
  assert.match(await ask("what is the largest of 4, 17, 2"), /\b17\b/);
  assert.match(await ask("min of 4, 17, 2"), /^\W*2\b/);
  assert.match(await ask("square root of 144"), /\b12\b/);
  assert.match(await ask("whats 2 to the power of 10"), /\b1024\b/);
  assert.match(await ask("what is 12 multiplied by 3"), /\b36\b/);
  assert.match(await ask("what is 100 divided by 4"), /\b25\b/);
  assert.match(await ask("subtract 3 from 10"), /^\W*7\b/);
  assert.match(await ask("divide 100 by 4"), /^\W*25\b/);
});

test("sentences no reading takes whole are each heard on their own and each answered; a thing named in passing is not described", async () => {
  const s = new ConceptStore();
  seed(s);
  const spoken = async (text: string) => (await turn(new Runtime(s), text, c("Execution"), { learn: false })).spoken;
  const said = await spoken("lol. You're kinda bad at talking. What time is it?");
  assert.match(said, /\bha\b|laugh|glad|funny|lol/i);
  assert.doesNotMatch(said, /stuck|don't know yet/i);
  assert.match(said, /\d+:\d\d [AP]M/);
  // Guess the clothing brand, known to the graph, is not what "guess what" asks about.
  s.addRelation("Guess", c("IsA", c("Brand")));
  s.addRelation("Guess", c("Means", "American clothing line brand"));
  assert.doesNotMatch(await spoken("Hey so guess what"), /clothing|brand/);
});
