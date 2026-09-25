import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRules } from "./rules.js";

/** The reading without its mood, for the shape tests; mood has its own test below. */
const unmood = (line: string) => line.replace(/^Mood\((Imperative|Declarative|Interrogative|Checking)\(\), (.*)\)$/, "$2");
const read = (message: string) => parseRules(message).reading?.lines.map(unmood).join(" | ");
const lines = (message: string) => parseRules(message).reading?.lines.join(" | ");

test("the same message always reads the same way", () => {
  const m = "what day will it be in 5 days?";
  assert.equal(read(m), read(m));
  assert.equal(read(m), "What(Day(), Will(It(), Be(In(Days(5)))))");
});

test("questions lead with their question word, a helper holds the rest, yes/no leads with the helper", () => {
  assert.equal(read("who wrote hamlet"), "Who(Wrote(Hamlet()))");
  assert.equal(read("where did i put my keys"), "Where(Did(Me(), Put(My(Keys()))))");
  assert.equal(read("how did the build go?"), "How(Did(Build(), Go()))");
  assert.equal(read("could you close the door please"), "Could(You(), Close(Door()))");
  assert.equal(read("how many angels can dance on the head of a pin"), "HowMany(Angels(), Can(Dance(On(Head(Of(Pin()))))))");
});

test("claims are subject first, with the predicate inside owners and describers", () => {
  assert.equal(read("i'm allergic to peanuts"), "Me(AllergicTo(Peanuts()))");
  assert.equal(read("colorless green ideas sleep furiously"), "Colorless(Green(Ideas(Sleep(Furiously()))))");
  assert.equal(read("that was wrong"), 'Was(Ref("that"), Wrong())', "a Ref is never a head");
});

test("orders are verb first, and clauses split into lines", () => {
  assert.equal(read("turn off the lights"), "TurnOff(Lights())");
  assert.equal(read("please add 2 and 2"), "Please(Add(2, 2))");
  assert.equal(read("take 10, double it, then subtract 5"), 'Take(10) | Double(Ref("it")) | Subtract(5)');
  assert.equal(read("do NOT delete the backups"), 'MarkEmphasis("NOT", DoNot(Delete(Backups())))');
});

test("amounts, clock times, arithmetic and pointing phrases", () => {
  assert.equal(read("set a timer for 10 minutes"), "Set(Timer(), For(Minutes(10)))");
  assert.equal(read("what is 17 times 4"), "What(Is(Times(17, 4)))");
  assert.equal(read("open the second one"), 'Open(Ref("the second one"))');
});

test("each line carries the mood of the clause it came from", () => {
  assert.equal(lines("who wrote hamlet"), "Mood(Interrogative(), Who(Wrote(Hamlet())))");
  assert.equal(lines("colorless green ideas sleep furiously"), "Mood(Declarative(), Colorless(Green(Ideas(Sleep(Furiously())))))");
  assert.equal(lines("chess is a sport?"), "Mood(Checking(), Chess(IsA(Sport())))");
  assert.equal(lines("it's tuesday, right?"), "Mood(Checking(), It(Is(Tuesday()))) | Right()");
  assert.equal(lines("banana"), "Banana()", "a fragment has no mood");
  assert.equal(lines("thanks!"), 'MarkEmphasis("!", Thanks())');
});

test("markup and verbatim spans are structure before any grammar", () => {
  assert.equal(lines("## Task\nRefactor `parseConfig`"), 'Heading(2, "Task") | Mood(Imperative(), Refactor(InlineCode("parseConfig")))');
  assert.equal(lines("1. clone the repo\n2. run the tests"), "Item(1, Mood(Imperative(), Clone(Repo()))) | Item(2, Mood(Imperative(), Run(Tests())))");
  assert.equal(
    lines("fix this bug:\n```\nboom\n```"),
    '$block1 = Block("boom") | Mood(Imperative(), Fix(Ref("this bug", $block1)))',
  );
});

test("misspellings are corrected before tagging and kept as said", () => {
  assert.equal(read("whats the wether in pittsburgh"), 'What(Is(MarkMisspelling("wether", Weather(In(Pittsburgh())))))');
  assert.equal(read("book a flight to pheonix"), 'Book(Flight(), To(MarkMisspelling("pheonix", Phoenix())))');
  assert.equal(read("colorless green ideas sleep furiously"), "Colorless(Green(Ideas(Sleep(Furiously()))))", "a spelling variant is not a typo");
  assert.equal(lines("asdkjh qwe zzz"), 'Unclear("asdkjh qwe zzz")');
});

test("pointing words are references, except the ambient it", () => {
  assert.equal(read("what is it?"), 'What(Is(Ref("it")))');
  assert.equal(read("what time is it?"), "What(Time(), Is(It()))");
  assert.equal(read("grab those logs from yesterday"), 'Grab(Ref("those logs"), From(Yesterday()))');
});

test("prepositions are a closed class, including the ones taggers get wrong", () => {
  assert.equal(read("put it on the shelf beside the lamp"), 'Put(Ref("it"), On(Shelf()), Beside(Lamp()))');
  assert.equal(read("i hid it behind the couch"), 'Me(Hid(Ref("it"), Behind(Couch())))');
  assert.equal(read("can you sort these by date"), 'Can(You(), Sort(Ref("these"), By(Date())))');
});

test("answers and interjections are said on their own line", () => {
  assert.equal(lines("no, not that one"), 'No() | Not(Ref("that one"))');
  assert.equal(lines("not that one, the blue one"), 'Not(Ref("that one")) | Ref("the blue one")');
  assert.equal(lines("yeah keep going"), "Yeah() | Mood(Imperative(), Keep(Going()))");
  assert.equal(lines("yes please"), "Please(Yes())");
  assert.equal(lines("omg thank you"), 'MarkAside("omg") | ThankYou()');
  assert.equal(lines("lol ok do it"), 'MarkAside("lol ok") | Mood(Imperative(), Do(Ref("it")))');
});

test("a fragment has no mood unless it is asked", () => {
  assert.equal(lines("no problem"), "No(Problem())");
  assert.equal(lines("maybe tuesday?"), 'Mood(Checking(), MarkFuzzy("maybe", Tuesday()))');
});

test("filler like hedges what it stands before", () => {
  assert.equal(read("we need to add a like checklist to this"), 'We(Need(Add(MarkFuzzy("like", Checklist()), To(Ref("this")))))');
  assert.equal(lines("like isnt that obvious?")?.split(" | ")[0], 'MarkAside("like")');
});

test("code pasted without backticks is kept as typed", () => {
  assert.equal(lines('ItIs(Imperative(You(), Watch(Ref("this"))'), 'InlineCode("ItIs(Imperative(You(), Watch(Ref(\\"this\\"))")');
});

test("ordinals and comparatives keep their words", () => {
  assert.equal(lines("not the first batch"), 'Not(Batch(Ordinal("first")))');
  assert.equal(read("say if its bigger than before"), 'Say(If(Is(Ref("it"), BiggerThan(Before()))))');
  assert.equal(read("i bought apples, pears and plums"), "Me(Bought(Apples(), Pears(), Plums()))");
  assert.equal(read("every dog barks"), "Every(Dog(Barks()))");
});

test("words the rules cannot read are kept as typed, and the rest is still read", () => {
  const r = parseRules("of to in, can you check the logs");
  assert.deepEqual(r.unread, ["of to in"]);
  assert.equal(r.reading?.lines[0], 'Unclear("of to in", Of(), To(), In())', "the words are still Concepts to learn");
  assert.equal(parseRules("is is is, can you check the logs").reading?.lines[0], 'Unclear("is is is", Is(), Is(), Is())', "neighbouring spans are one");
  assert.match(r.reading!.lines[1], /Can\(You\(\), Check\(Logs\(\)\)\)/);
  assert.equal(parseRules("check the logs").unread, undefined);
});

test("who is spoken to is an aside, and a typo between numbers is an operator", () => {
  assert.equal(
    lines("yo homie can you help me figure out what 5 time 17 is?"),
    'MarkAside("yo homie") | Mood(Interrogative(), Can(You(), Help(Me(), FigureOut(What(Is(MarkMisspelling("time", Times(5, 17))))))))',
  );
  assert.equal(lines("dude where is my car"), 'MarkAside("dude") | Mood(Interrogative(), Where(Is(My(Car()))))');
});

test("two swapped letters are the commonest typo, at any length", () => {
  assert.equal(read("what ahppened to that hsit"), 'What(MarkMisspelling("ahppened", Happened(To(Ref("that shit")))))');
  assert.equal(read("waht is teh time"), read("what is the time"));
});

test("an invented word is not corrected to a rare one", () => {
  assert.equal(read("blorp zap the frobnicator"), "Blorp(Zap(), Frobnicator())");
  assert.equal(read("you specificlly stated it"), 'You(MarkMisspelling("specificlly", Specifically(Stated(Ref("it")))))');
});

test("symbols in a sentence: arithmetic, amounts and codes", () => {
  assert.equal(read("what is 5 * 3?"), "What(Is(Times(5, 3)))");
  assert.equal(read("what is (2 + 3) * 4"), "What(Is(Times(Plus(2, 3), 4)))");
  assert.equal(read("is 5 > 3?"), "Is(GreaterThan(5, 3))");
  assert.equal(read("it costs $5"), "Costs(Ref(\"it\"), Dollars(5))");
  assert.equal(read("call me at 555-1234"), 'Call(Me(), At("555-1234"))');
  assert.equal(read("we are open 24/7"), 'We(Are(Open("24/7")))');
});

test("a phrasal verb is one verb, and an embedded question reads like a plain one", () => {
  assert.equal(read("look up the word"), "LookUp(Word())");
  assert.equal(read("tell me where the station is"), "Tell(Me(), Where(Is(Station())))");
  assert.equal(read("what 17 times 3 is?"), "What(Is(Times(17, 3)))");
  assert.equal(lines("hi"), "Hi()", "a greeting alone is said, not filler");
});

test("an operator with nothing before it works on the last answer, and one after a pointing word on what it points at", () => {
  assert.equal(lines("and plus 3?"), 'Mood(Interrogative(), Plus(Ref(""), 3))');
  assert.equal(lines("and minus 1"), 'Mood(Interrogative(), Minus(Ref(""), 1))');
  assert.equal(read("times that by 2"), 'Times(Ref("that"), 2)');
  assert.equal(read("what is that plus 3"), 'What(Is(Plus(Ref("that"), 3)))');
  assert.equal(read("5 plus 3"), "Plus(5, 3)", "two values are unchanged");
});
