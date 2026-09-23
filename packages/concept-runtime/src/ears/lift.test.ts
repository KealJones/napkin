import assert from "node:assert/strict";
import { test } from "node:test";
import { format, parse } from "../concept/expression.js";
import { balance, dropArticles, lift, mendNumbers, mendWords } from "./lift.js";
import { check, looksLikeQuestion } from "./ears.js";

test("one line lifts to itself, with no root wrapper", () => {
  assert.equal(format(lift("What(Date())").expression!), "What(Date())");
});

test("several lines lift to Sequence", () => {
  const e = lift("Fact(A())\nFact(B())\nAside(\"x\")").expression!;
  assert.equal(format(e), 'Sequence(Fact(A()), Fact(B()), Aside("x"))');
});

test("an assignment scopes over everything after it", () => {
  const e = lift("$x = Add(1, 2)\nMultiply($x, 10)").expression!;
  assert.equal(format(e), "Let($x, Add(1, 2), Multiply($x, 10))");
});

test("a bad line costs one clause, not the whole parse", () => {
  // Fault isolation: the malformed line is rejected and the other two still parse.
  // A single wrapped expression has no such property — one slip destroys everything.
  const lifted = lift('Fact(A())\nFact(((\nAside("kept")');
  assert.equal(lifted.clauses, 2);
  assert.equal(lifted.rejected.length, 1);
  assert.match(format(lifted.expression!), /Fact\(A\(\)\).*Aside\("kept"\)/);
});

test("paren balancing repairs the measured failure", () => {
  assert.equal(balance("Fact(Visited(Me()"), "Fact(Visited(Me()))");
});

test("a question with no interrogative is caught mechanically", () => {
  const problems = check("What is 5 times three?", lift('Multiply(5, Number("three"))').expression);
  assert.match(problems.join(" "), /no interrogative/);
  assert.deepEqual(check("What is 5 times three?", lift('What(Multiply(5, Number("three")))').expression), []);
});

test("a statement is not required to carry an interrogative", () => {
  assert.ok(!looksLikeQuestion("i went to virginya"));
  assert.ok(looksLikeQuestion("can you write me a typescript function"), "mood, not use");
  assert.ok(!looksLikeQuestion("do NOT delete the backups"));
  assert.ok(looksLikeQuestion("can birds fly"));
  assert.ok(looksLikeQuestion("do you know the time?"));
  assert.deepEqual(check("i went to virginya", lift("Fact(Visited(Me()))").expression), []);
});

test("single quotes are repaired, because a small model writes them anyway", () => {
  const e = lift("Count(String('r'), String('strawberry'))").expression!;
  assert.equal(format(e), 'Count(String("r"), String("strawberry"))');
});

test("a trailing comma is repaired", () => {
  assert.equal(format(lift("Fact(A(), B(),)").expression!), "Fact(A(), B())");
});

test("repair never rewrites a line that already parses", () => {
  const e = lift('Aside("it\'s fine")').expression!;
  assert.equal(format(e), 'Aside("it\'s fine")');
});

test("a placeholder ? becomes an anonymous unknown rather than a dropped clause", () => {
  const lifted = lift('Not(Wrong())\n$math = What(Multiply(?, ?))');
  assert.equal(lifted.rejected.length, 0);
  assert.equal(lifted.clauses, 2);
  assert.match(format(lifted.expression!), /\$_/);
});

test("a ? inside a string is the user's own words and stays put", () => {
  const lifted = lift('Aside("really?")');
  assert.equal(format(lifted.expression!), 'Aside("really?")');
});

test("output cut off by a generation cap keeps what was said before the cut", () => {
  const truncated =
    'Concept(identity="Money", relations=List(IsA(Asset()), IsA(MediumOfExchange()), SynonymOf(Curren';
  const lifted = lift(truncated);
  assert.equal(lifted.rejected.length, 0);
  const text = format(lifted.expression!);
  assert.match(text, /identity="Money"/);
  assert.match(text, /IsA\(MediumOfExchange\(\)\)/);
  // The half-written argument is gone rather than the whole declaration.
  assert.ok(!text.includes("Curren"));
});

test("salvage never wins over something that already parses", () => {
  const fine = 'Concept(identity="Money", relations=List(IsA(Asset())))';
  assert.equal(format(lift(fine).expression!), fine);
});

test("the vocabulary keeps what matters when the graph outgrows the prompt", async () => {
  const { vocabulary } = await import("./prompt.js");
  const { ConceptStore } = await import("../store/store.js");
  const { seed } = await import("../seed/seed.js");
  const { concept } = await import("../concept/unit.js");

  const store = new ConceptStore();
  seed(store);
  // Enough junk to push everything past the limit, all of it alphabetically early.
  for (let i = 0; i < 600; i += 1) store.seed(concept(`Aardvark${String(i).padStart(4, "0")}`));

  const shown = vocabulary(store, 120, "what time is it").split("\n")[1]!;
  // Alphabetical truncation lost the interrogatives and everything that computes.
  assert.match(shown, /\bWhat\(/, "an interrogative is required by the rules beside this list");
  assert.match(shown, /\bTime\(/, "naming a Concept that realizes is the difference from a residual");
  assert.match(shown, /\bMultiply\(/);
});

test("the message pulls in Concepts that are otherwise nowhere near the front", async () => {
  const { vocabulary } = await import("./prompt.js");
  const { ConceptStore } = await import("../store/store.js");
  const { concept } = await import("../concept/unit.js");

  const store = new ConceptStore();
  for (let i = 0; i < 300; i += 1) store.seed(concept(`Aardvark${String(i).padStart(4, "0")}`));
  store.seed(concept("Zebra"));

  assert.match(vocabulary(store, 50, "tell me about a zebra").split("\n")[1]!, /\bZebra\(/);
  assert.ok(!vocabulary(store, 50, "tell me about a horse").split("\n")[1]!.includes("Zebra("));
});

test("the Ears is shown no vocabulary, so it renders the idea rather than picking one", async () => {
  const { earsPrompt } = await import("./prompt.js");
  const { ConceptStore } = await import("../store/store.js");
  const { seed } = await import("../seed/seed.js");
  const store = new ConceptStore();
  seed(store);
  const prompt = earsPrompt(store, [], "what time is it?");
  assert.ok(!prompt.includes("VOCABULARY"));
  // The form rules are the contract (ir-spec Part 9), and they stay.
  assert.match(prompt, /one line for each phrase/i);
  assert.match(prompt, /MUST start that line with the question word/);
});

test("history shows the parser what was said, not the expression that said it", async () => {
  const { recent } = await import("./prompt.js");
  const shown = recent([
    { message: "what time is it?", result: 'Answer(Time(hour=10, spoken="10:15 AM"))', spoken: "It is 10:15 AM." },
  ]);
  // Handing it IR invited copying an earlier answer as the reading of a new message.
  assert.match(shown, /It is 10:15 AM\./);
  assert.ok(!shown.includes("Answer(Time("));
  assert.match(shown, /Never copy an earlier answer/);
});

test("Number(...) slips are mended mechanically, and only the unambiguous ones", () => {
  const mend = (text: string, message: string) => format(mendNumbers(lift(text).expression!, message));
  assert.equal(mend('Take(Number("10"))', "take 10"), "Take(10)");
  assert.equal(mend('Times(17, Number("four"))', "what is 17 times 4"), "Times(17, 4)");
  assert.equal(mend('Times(5, Number("three"))', "what is 5 times three"), 'Times(5, Number("three"))');
  assert.equal(mend('What(Multiply(21, Number("double")))', "what is double 21"), "What(Multiply(21, Double()))");
  assert.equal(mend('Names(Fuzzy(Number("five-ish")))', "five-ish names"), 'Names(Fuzzy(Number("five-ish")))');
  assert.equal(mend("In(Days(Five()))", "what day will it be in 5 days"), "In(Days(5))");
  assert.equal(mend("Three(Examples())", "give me three examples"), "Three(Examples())");
});

test("articles come off mechanically, and only ones the message said", () => {
  const drop = (text: string, message: string) => format(dropArticles(lift(text).expression!, message));
  const msg = "can you write me a typescript function that says hello world";
  assert.equal(drop('Can(You(), Write(Me(), A(TypeScript(Function(Says("hello world"))))))', msg),
    'Can(You(), Write(Me(), TypeScript(Function(Says("hello world")))))');
  assert.equal(drop("Is(Tomato(), A(), Fruit())", "is a tomato a fruit"), "Is(Tomato(), Fruit())");
  assert.equal(drop("Option(A(Sept(20)))", "today is ____. A. Sept 20"), "Option(A(Sept(20)))");
  assert.equal(drop('Write(Me(), A(TypeScript(Function()), That(Says("hi"))))', msg), 'Write(Me(), TypeScript(Function()), That(Says("hi")))');
});

test("surface slips are mended against the message", () => {
  const mend = (text: string, message: string) => format(mendWords(lift(text).expression!, message));
  assert.equal(mend("Send(Ref(\"it\"), To(Him()))", "send it to him"), 'Send(Ref("it"), To(Ref("him")))');
  assert.equal(mend("Can(You(), Add(Empphasis()))", "can you add emphasis to this"), "Can(You(), Add(Emphasis()))");
  assert.equal(mend("Run(Ussual())", "run the usual"), "Run(Usual())");
  assert.equal(mend("Me(Visited(Mom()))", "i visit my mom"), "Me(Visited(Mom()))", "an inflection is not a typo");
  assert.equal(mend("Dont(Tell(Me()))", "dont tell me"), "DoNot(Tell(Me()))");
  assert.equal(mend("What(Time(), Is(It()))", "what time is it"), "What(Time(), Is(It()))");
});

test("a Ref that does not point is mended, and one that does is kept", () => {
  const mend = (text: string, message: string) => format(mendWords(lift(text).expression!, message));
  assert.equal(mend('WhichOf(Ref("these"), Ref("21"), Ref("27"))', "which of these: 21, 27"), 'WhichOf(Ref("these"), 21, 27)');
  assert.equal(mend('Bigger(Ref("a mouse"), Ref("an elephant"))', "which is bigger, a mouse or an elephant"), "Bigger(Mouse(), Elephant())");
  assert.equal(mend('Refactor(Ref("parseConfig"))', "refactor `parseConfig`"), 'Refactor("parseConfig")');
  assert.equal(mend('Give(Three(Examples(), Ref("a"), Bird()))', "give me three examples of a bird"), "Give(Three(Examples(), Bird()))");
  assert.equal(mend("That(Was(Wrong()))", "that was wrong"), 'Was(Ref("that"), Wrong())');
  assert.equal(mend('Tell(More(About(Ref("the second one"))))', "tell me more about the second one"), 'Tell(More(About(Ref("the second one"))))');
});

test("slips that break parsing are repaired: digit calls, missing commas, calls side by side", () => {
  assert.equal(format(lift("My(Birthday(On(June(), 3())))").expression!), "My(Birthday(On(June(), 3)))");
  assert.equal(format(lift("Saying(The(Heater()) Is(Broken()))").expression!), "Saying(The(Heater()), Is(Broken()))");
  assert.equal(format(lift("I(Me()) Am(Allergic())").expression!), "Sequence(I(Me()), Am(Allergic()))");
});

test("pointing phrases folded or wrapped are references, and unquoted digit strings are numbers", () => {
  const mend = (text: string, message: string) => format(mendWords(lift(text).expression!, message));
  assert.equal(mend("Do(TheSameThing(), For(TheOtherFile()))", "do the same thing for the other file"), 'Do(Ref("the same thing"), For(Ref("the other file")))');
  assert.equal(mend("Run(The(Ussual()))", "run the usual"), 'Run(Ref("the usual"))');
  assert.equal(mend('Review(Pr("482"))', "review PR #482"), "Review(Pr(482))");
});

test("i is Me, spelled once", () => {
  assert.equal(format(mendWords(lift("I(Me())").expression!, "i'm allergic")), "Me()");
});

test("a marked misspelling keeps the word it says was meant", () => {
  const e = parse('What(MarkMisspelling("ahppened", Happened()))');
  assert.equal(format(mendWords(e, "what ahppened")), 'What(MarkMisspelling("ahppened", Happened()))');
});
