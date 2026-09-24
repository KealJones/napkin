import assert from "node:assert/strict";
import { test } from "node:test";
import { c } from "../concept/expression.js";
import { say } from "../ears/say.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const store = new ConceptStore();
seed(store);
const ask = async (text: string) =>
  (await turn(new Runtime(store), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inDays = (n: number) => DAYS[new Date(Date.now() + n * 86_400_000).getDay()];

test("the when said after what is asked belongs to it", async () => {
  assert.equal(await ask("what day will it be tomorrow"), `Answer("${inDays(1)}")`);
  assert.equal(await ask("what day will it be in 5 days"), `Answer("${inDays(5)}")`);
  assert.match(await ask("what's the date tomorrow"), new RegExp(`weekday="${inDays(1)}"`));
  assert.equal(await ask("what day is it"), `Answer("${inDays(0)}")`);
});

test("roots and percents, said the way people say them", async () => {
  assert.equal(await ask("what is the square root of 144"), "Answer(12)");
  assert.equal(await ask("whats the cube root of 27"), "Answer(3)");
  assert.equal(await ask("what is 15% of 80"), "Answer(12)");
});

test("small talk is answered, not looked up", async () => {
  assert.equal(await ask("good morning"), "Answer(Hello())");
  assert.equal(await ask("how are you?"), "Answer(DoingWell())");
  assert.equal(await ask("cool"), "Answer(GladYouLikeIt())");
  assert.equal(await ask("ok"), "Answer(GotIt())");
  assert.equal(await ask("lol"), "Answer(Laughing())");
  assert.equal(await ask("thank you so much"), "Answer(YoureWelcome())");
  assert.equal(await ask("good night"), "Answer(Goodbye())");
  assert.equal(await say("cool", c("Answer", c("GladYouLikeIt"))), "Glad you like it!");
});

test("the system can say who it is and what it can do", async () => {
  assert.equal(await ask("what is your name"), 'Answer("Napkin")');
  assert.match(await ask("what can you do"), /^Answer\(List\(Arithmetic\(\), /);
  assert.match(await ask("who are you"), /IsA\(Assistant\(\)\)/);
  assert.doesNotMatch(await ask("who are you"), /CanDo/, "capabilities are answered when asked, not recited");
});

test("everyday arithmetic words, chains of steps, and comparisons", async () => {
  assert.equal(await ask("what is half of 90"), "Answer(45)");
  assert.equal(await ask("what is double 8"), "Answer(16)");
  assert.equal(await ask("what's the average of 2, 4 and 9"), "Answer(5)");
  assert.equal(await ask("add up 3, 4 and 5"), "12");
  assert.equal(await ask("take 10, double it, then subtract 5"), "15");
  assert.equal(await ask("is 100 more than 99"), "Answer(True())");
  assert.equal(await ask("is 3 bigger than 5"), "Answer(False())");
});

test("each question in a message is answered", async () => {
  assert.equal(await ask("what is 2 plus 2 and what is 3 times 3"), "Sequence(Answer(4), Answer(9))");
  assert.equal(await say("cool, thanks", c("Sequence", c("Answer", c("GladYouLikeIt")), c("Answer", c("YoureWelcome")))), "Glad you like it! You're welcome!");
});

test("holidays are dates, and being told it was wrong is apologised for", async () => {
  const days = await ask("how many days until christmas");
  assert.match(days, /^Answer\(Days\(\d+\)\)$/);
  assert.equal(await ask("that was wrong"), "Answer(Sorry())");
  assert.equal(await ask("no"), "Answer(Okay())");
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
  assert.match(await ask("how many days until new years day"), /^Answer\(Days\(\d+\)\)$/);
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

test("asking what it knows of a kind looks up the kind's members", async () => {
  const known = new ConceptStore();
  seed(known);
  const { concept } = await import("../concept/unit.js");
  known.seed(concept("Robin", { relations: ["IsA(Bird())"] }));
  known.seed(concept("Sparrow", { relations: ["IsA(Bird())"] }));
  known.seed(concept("Moment", { relations: [{ claim: (await import("../concept/expression.js")).parse("IsA(Bird())"), context: c("Namesake") }] }));
  const askIt = async (text: string) => (await turn(new Runtime(known), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered;
  assert.equal(await askIt("do you know any games?"), "Answer(List(TicTacToe()))");
  assert.equal(await askIt("what games do you know"), "Answer(List(TicTacToe()))");
  assert.equal(await askIt("do you know any birds?"), "Answer(List(Robin(), Sparrow()))", "a namesake is not a member");
});

test("wanting to play, asking to play, or naming the game starts one, however it is spelled", async () => {
  for (const said of ["wanna play tick tac toe?", "can we play tictactoe", "tic-tak-toe?", "lets play noughts and crosses"]) {
    assert.match(await ask(said), /^InGame\(Game_\d+\(\), echo="Tic tac toe against me", Started\(\)/, said);
  }
  assert.match(await ask("i want pizza"), /^Noted\(/, "wanting a thing is still a want");
});

/** A conversation, each turn knowing the ones before, on a store of its own. */
const conversation = () => {
  const own = new ConceptStore();
  seed(own);
  const history: { message: string; result: string }[] = [];
  return async (text: string) => {
    const r = await turn(new Runtime(own), text, c("Execution"), { backend: "rules", learn: false, speak: false, history });
    history.push({ message: text, result: String(r.rendered) });
    return String(r.rendered);
  };
};

test("a number word does sums in symbols, and an arithmetic verb works on the last answer", async () => {
  const talk = conversation();
  assert.equal(await talk("what is one + 2?"), "Answer(3)");
  assert.equal(await talk("what is 1 plus 3?"), "Answer(4)");
  assert.equal(await talk("and then add 5?"), "9");
});

test("a reference resolves to what was answered, not its text", async () => {
  const talk = conversation();
  await talk("what is 2 plus 2");
  const { resolveReferences } = await import("./references.js");
  const { format, parse } = await import("../concept/expression.js");
  const { expression } = resolveReferences(parse('Times(Ref(""), 2)'), [{ message: "what is 2 plus 2", result: "Answer(4)" }]);
  assert.equal(format(expression!), 'Times(Ref("", resolvedTo=Answer(4)), 2)');
});

test("a kind is described with what its synonyms hold, and as it was said", async () => {
  const own = new ConceptStore();
  const { concept } = await import("../concept/unit.js");
  // Seeded first, so seeding derives the synonyms' forwarding, as the graph has it.
  own.seed(concept("Job", { relations: ["SynonymOf(Occupation())", "IsA(Work())", "RelatedTo(Employment())"] }));
  own.seed(concept("Occupation", { relations: ["SynonymOf(Job())"] }));
  seed(own);
  const ask2 = async (text: string) => String((await turn(new Runtime(own), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered);
  assert.match(await ask2("what is an occupation"), /^Describes\(Occupation\(\), .*RelatedTo\(Employment\(\)\)/);
  assert.match(await ask2("what is an ocupation"), /^Describes\(Occupation\(\), .*RelatedTo\(Employment\(\)\)/);
});

test("a kind said with its words is believed whole, and a job asked for is a kind one is", async () => {
  const talk = conversation();
  // Every word said is kept: a compound the lexicon knows, or the kind with its words.
  assert.match(await talk("I am a Senior Software Engineer"), /IsA\((SoftwareEngineer\(\)\), Senior\(\)|Engineer\(Senior\(\), Software\(\)\)\))/);
  await talk("a software engineer is an engineer");
  await talk("an engineer is a job");
  assert.match(await talk("what is my job?"), /Engineer/);
});

test("a question that asks more than its subject is not answered with the subject", async () => {
  assert.equal(await ask("when you say hello?"), "Unknown()");
});

test("\"I meant\" takes the place of the last turn, and a mistyped times is times", async () => {
  const talk = conversation();
  assert.equal(await talk("what is five + 2"), "Answer(7)");
  assert.equal(await talk("add 5"), "12");
  assert.equal(await talk("and time 27"), "324");
  const again = conversation();
  await again("what is 2 plus 2");
  await again("times 3");
  assert.equal(await again("no, i meant times 5"), "20");
  // A second correction replaces the first, so it works on the answer before that: 12.
  assert.equal(await again("woops i meant and TIMES 27?"), "324");
});

test("what is said of two things joined by or is believed of each, a described kind kept whole", async () => {
  const talk = conversation();
  assert.match(await talk("Woops or Whoops is a word you say when you do something wrong on accident"), /^Sequence\(Believed\(Woops\(\), List\(IsA\(Word\(.+\)\)\)\), Believed\(Whoops\(\), /);
  assert.match(await talk("what is whoops"), /^Describes\(Whoops\(\), List\(IsA\(Word\(/);
});
