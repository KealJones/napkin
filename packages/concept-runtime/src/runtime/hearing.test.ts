import assert from "node:assert/strict";
import { test } from "node:test";
import { type Expr, c, call, format, isCall } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

const store = new ConceptStore();
seed(store);
const heard = async (text: string) => format(await new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Execution")));
/** The structure alone: each line's mood is its own test. */
const unmood = (e: Expr): Expr =>
  isCall(e) ? ((e.head === "Mood" || e.head === "ContextScope") && e.args.length === 2 ? unmood(e.args[1].value) : call(e.head, e.args.map((a) => ({ ...a, value: unmood(a.value) })))) : e;
const hear = async (text: string) => format(unmood(await new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Execution"))));

test("things: describers and nouns before a thing are its arguments, and the thing is the head", async () => {
  assert.equal(await hear("my old car"), "Phrases(Car(My(), Old()))");
  assert.equal(await hear("ice cream"), "Phrases(Cream(Ice()))");
  assert.equal(await hear("the big red ball"), "Phrases(Ball(Big(), Red()))");
  assert.equal(await hear("a 1999 American teen comedy film"), "Phrases(Film(1999, American(), Teen(), Comedy()))");
});

test("the closed class: prepositions take the thing after them, and joins, is holds both sides", async () => {
  assert.equal(await hear("the capital of france"), "Phrases(Capital(Of(France())))");
  assert.equal(await hear("toilet paper and cheese sticks"), "Phrases(And(Paper(Toilet()), Sticks(Cheese())))");
  // The tagger calls "in" a noun here; the graph knows it is a preposition.
  assert.equal(await hear("napkin is a work in progress"), "Phrases(Is(Napkin(), Work(In(Progress()))))");
  assert.equal(await hear("directed and co-produced by Paul Weitz"), "Phrases(And(Directed(), CoProduced(By(Weitz(Paul())))))");
});

test("doings: a verb takes what follows and belongs to the thing before; after a verb, a doing is said about the thing", async () => {
  assert.equal(await hear("i need toilet paper and cheese sticks"), "Phrases(Me(Need(And(Paper(Toilet()), Sticks(Cheese())))))");
  assert.equal(await hear("the old dog barked at the mailman"), "Phrases(Dog(Old(), Barked(At(Mailman()))))");
  // design/prompt-hearing.md section 5, word for word.
  assert.equal(
    await hear("American Pie is a 1999 American teen comedy film directed and co-produced by Paul Weitz"),
    "Phrases(Is(Pie(American()), Film(1999, American(), Teen(), Comedy(), And(Directed(), CoProduced(By(Weitz(Paul())))))))",
  );
});

test("rambling: sentences stay apart, contractions are their words, filler is set aside", async () => {
  assert.equal(await hear("red light, speed camera ahead. work in progress."), "Phrases(Light(Red()), Camera(Speed()), Ahead(), Work(In(Progress())))");
  assert.equal(await hear("there's a way"), "Phrases(Is(There(), Way()))");
  assert.equal(await hear("i like uh pie"), "Phrases(Me(Like(Pie())), MarkAside(\"uh\"))");
});

test("after a determiner with no noun, a describer is the thing: the average of", async () => {
  assert.equal(await hear("the average of 3, 5 and 10"), "Phrases(Average(Of(List(3, 5, 10))))");
});

test("a pronoun takes no determiner: the us is a name, us alone is we", async () => {
  assert.equal(await hear("the us"), "Phrases(Us())");
  assert.equal(await hear("tell us a joke"), "Phrases(Tell(We(), Joke()))");
});

test("a comma before someone doing something starts a clause; nouns in a row with a plural are a list; a particle after its object is the verb's", async () => {
  assert.match(await hear("make a shopping list, I need cheese and fish"), /^Phrases\(Make\(List\(Shopping\(\)\)\), Me\(Need\(/);
  assert.equal(await hear("eggs aspirin and cheese"), "Phrases(And(And(Eggs(), Aspirin()), Cheese()))");
  assert.equal(await hear("look it up"), await hear("look up it"));
});

test("a word nobody knows hears as what the tagger says it looks like", async () => {
  assert.equal(await hear("the americanpie"), "Phrases(Americanpie())");
});

test("under Hearing a word only hears: nothing it does elsewhere runs", async () => {
  // Add and Delete have behaviour; heard, they are words.
  assert.equal(await hear("add 2 and 3 then delete everything"), "Phrases(Add(And(2, 3)), Then(), Delete(Everything()))");
});

test("questions: the question word leads, a helper first asks, and each line says how it was said", async () => {
  assert.equal(await heard("what is chess"), "Phrases(ContextScope(Interrogative(), What(Is(Chess()))))");
  assert.equal(await heard("who wrote hamlet"), "Phrases(ContextScope(Interrogative(), Who(Wrote(Hamlet()))))");
  assert.equal(await heard("is chess a sport"), "Phrases(ContextScope(Interrogative(), Is(Chess(), Sport())))");
  assert.equal(await heard("could you close the door?"), "Phrases(ContextScope(Interrogative(), Could(You(), Close(Door()))))");
  assert.equal(await heard("what do i like"), "Phrases(ContextScope(Interrogative(), What(Do(Me(), Like()))))");
  assert.equal(await heard("what is the capital of france?"), "Phrases(ContextScope(Interrogative(), What(Is(Capital(Of(France()))))))");
  assert.equal(await heard("close the door"), "Phrases(ContextScope(Imperative(), Close(Door())))");
  // A helper carries a doing, whatever the tagger made of the word in this sentence.
  assert.equal(await heard("who did hamlet kill"), "Phrases(ContextScope(Interrogative(), Who(Did(Hamlet(), Kill()))))");
  assert.equal(await heard("what time is it"), "Phrases(ContextScope(Interrogative(), What(Time(), Is(It()))))");
  assert.equal(await heard("which file did you open"), "Phrases(ContextScope(Interrogative(), Which(File(), Did(You(), Open()))))");
  assert.equal(await heard("i like pie"), "Phrases(ContextScope(Declarative(), Me(Like(Pie()))))");
});

test("orders, negation, politeness and several objects", async () => {
  assert.equal(await heard("please add 2 and 2"), "Phrases(ContextScope(Imperative(), Please(Add(And(2, 2)))))");
  assert.equal(await heard("define recursion"), "Phrases(ContextScope(Imperative(), Define(Recursion())))");
  assert.equal(await heard("what is not a mammal"), "Phrases(ContextScope(Interrogative(), What(Is(Not(Mammal())))))");
  assert.equal(await hear("write me a typescript function that says hello world"), "Phrases(Write(Me(), Function(Typescript(), That(Says(World(Hello()))))))");
  // A comma before a doing starts another clause.
  assert.equal(await hear("take 10, double it, then subtract 5"), "Phrases(Take(10), Double(Ref(\"it\")), Then(), Subtract(5))");
  assert.equal(await hear("remind me to call mum tomorrow"), "Phrases(Remind(Me(), Call(Mum(), Tomorrow())))");
});

test("pointing words are Refs for memory, a hesitation between two takes the first back, and a word said twice is said once", async () => {
  assert.equal(await hear("fix that bug"), 'Phrases(Fix(Ref("that bug")))');
  assert.equal(await hear("open the second one"), 'Phrases(Open(Ref("the second one")))');
  assert.equal(await hear("what is it"), 'Phrases(What(Is(Ref("it"))))');
  assert.equal(await hear("i need the report by 3, er, 4pm"), 'Phrases(Me(Need(Report(By(MarkCorrection(3, Time(4, Pm())))))), MarkAside("er"))');
  assert.equal(await hear("if if that works"), 'Phrases(MarkAside("if"), If(Ref("that works")))');
});

test("code, links and quotes are kept as typed, each one thing", async () => {
  assert.equal(await heard("fix `foo()` please"), 'Phrases(ContextScope(Imperative(), Please(Fix(InlineCode("foo()", ir=Module(Call($foo)), language=TypeScript())))))');
  assert.match(await hear("why does const x = items.map((i) => i * 2); fail"), /^Phrases\(Why\(Does\(InlineCode\("const x = items.map\(\(i\) => i \* 2\);", ir=Module\(Bind\(\$x, /);
  assert.equal(await hear('say "hello world" to me'), 'Phrases(Say("hello world", To(Me())))');
  assert.equal(await hear("what does this do\nfunction add(a, b) {\n  return a + b;\n}"), 'Phrases(What(Does(Ref("this"), Do())), Block("function add(a, b) {\\n  return a + b;\\n}", ir=Module(Func($add, List($a, $b), Return(Add($a, $b)))), language=TypeScript()))');
});

test("code is also read as Concepts, and its comments are heard where they are", async () => {
  assert.equal(await hear("fix `foo()` please"), 'Phrases(Please(Fix(InlineCode("foo()", ir=Module(Call($foo)), language=TypeScript()))))');
  const said = await hear("heres what i have `function whatever(args){\n// loop over args here\n}`");
  assert.match(said, /Block\("function whatever\(args\)\{\\n\/\/ loop over args here\\n\}", ir=Module\(Func\(\$whatever, List\(\$args\), Sequence\(Comment\("loop over args here", Loop\(/);
});
