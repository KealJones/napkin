import assert from "node:assert/strict";
import { test } from "node:test";
import { c, call, format, parse } from "../concept/expression.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";

/** A conversation about a director, then his two wives, with what is known of each. */
function talked(): { store: ConceptStore; runtime: Runtime } {
  const store = new ConceptStore();
  seed(store);
  for (const [who, sex] of [["StevenSpielberg", "Male"], ["KateCapshaw", "Female"]]) {
    store.addRelation(who, parse(`Named("${who}")`));
    store.addRelation(who, parse("IsA(Human())"));
    store.addRelation(who, parse(`SexOrGender(${sex}())`));
  }
  store.addRelation("AmyIrving", parse('Named("Amy Irving")'));
  const said = [
    'Said(Me(), Who(Is(Director(Of(Jaws())))), text="who directed jaws")',
    'Said(Self(), Answer(StevenSpielberg()), text="Steven Spielberg.")',
    'Said(Me(), Who(Is(Ref("he", resolvedTo=StevenSpielberg()), Married(), To())), text="who is he married to")',
    'Said(Self(), Answer(List(AmyIrving(), KateCapshaw())), text="Amy Irving and Kate Capshaw.")',
    'Said(Me(), Where(Was(Ref("he", resolvedTo=StevenSpielberg()), Born())), text="where was he born")',
    'Said(Self(), Answer(Cincinnati()), text="Cincinnati.")',
  ];
  for (const s of said) store.addRelation("Conversation_1", parse(s));
  const runtime = new Runtime(store);
  runtime.context.set("conversation", "Conversation_1");
  return { store, runtime };
}

test("a conversation's focus is what it answered and pointed at, newest first, each answer as the kind asked", async () => {
  const { runtime } = talked();
  const focus = format(await runtime.evaluate(call("ConversationFocus", [{ value: "Conversation_1" }]), c("Execution")));
  assert.equal(focus, "List(AskedAs(Cincinnati(), Place()), StevenSpielberg(), AskedAs(AmyIrving(), Someone()), AskedAs(KateCapshaw(), Someone()))");
});

test("he points at the man in play, past a newer place and the women after him; she at the woman", async () => {
  const { runtime } = talked();
  assert.equal(format(await runtime.evaluate(call("ReferentOf", [{ value: "he" }]), c("Execution"))), "StevenSpielberg()");
  // Kate Capshaw is known to be a woman; nothing is known of Amy Irving but her name.
  assert.equal(format(await runtime.evaluate(call("ReferentOf", [{ value: "she" }]), c("Execution"))), "KateCapshaw()");
  // A word that points at no kind is left to the last answer.
  assert.equal(format(await runtime.evaluate(call("ReferentOf", [{ value: "it" }]), c("Execution"))), 'ReferentOf("it")');
});

test("a thing made in conversation holds what is put in it and not taken out, and is found by what the words say of it", async () => {
  const { turn } = await import("./turn.js");
  const store = new ConceptStore();
  seed(store);
  let heard = 1000;
  const say = async (m: string) => {
    const runtime = new Runtime(store);
    // Each message stamped as the studio stamps it, so what a message makes is known as its.
    runtime.trace.said(++heard);
    return (await turn(runtime, m, c("Execution"), { learn: false, conversation: "Conversation_2" })).spoken;
  };
  assert.equal(await say("make a shopping list"), "Made a shopping list.");
  assert.equal(await say("add milk to my shopping list"), "Added milk to your shopping list.");
  assert.equal(await say("put eggs on my list"), "Added eggs to your shopping list.");
  assert.equal(await say("remove milk from my list"), "Removed milk from your shopping list.");
  assert.equal(await say("what is on my shopping list?"), "Eggs.");
  // Things told of a holder just made go in it: in the same message, or said alone after.
  assert.equal(await say("make a grocery list. I need socks and a charger"), "Made a grocery list. Added socks and charger to your grocery list.");
  // What a thing is made with goes in it; "make a list" then makes a list, not the grocery list.
  assert.equal(await say("make a grocery list with milk, bread and jam"), "Made a grocery list. Added milk, bread and jam to your grocery list.");
  assert.equal(await say("make a list"), "Made a list.");
  // Nothing here is about lists: once a box is known to hold things, one made holds keys.
  store.addRelation("Box", parse("IsA(Collection())"));
  assert.equal(await say("make a box"), "Made a box.");
  assert.equal(await say("put the keys in my box"), "Added keys to your box.");
  assert.equal(await say("what is in the box?"), "Keys.");
});

test("a doing says how many it takes: two, or as many as are given", async () => {
  const store = new ConceptStore();
  seed(store);
  const runtime = new Runtime(store);
  assert.equal(format(await runtime.evaluate(parse("Add(3, 4, 5)"), c("Execution"))), "12");
  assert.equal(format(await runtime.evaluate(parse("Multiply(2, 3, 4)"), c("Execution"))), "24");
});

test("a relation's properties declared in a context hold only for facts there: what a list contains is not a time", async () => {
  const { Relations } = await import("../store/relations.js");
  const store = new ConceptStore();
  seed(store);
  store.addRelation("ShoppingList_1", parse("Contains(Milk())"));
  store.addRelation("Morning", parse("Contains(Breakfast())"), parse("Interval()"));
  const of = (x: string) => new Relations(store).of(x).map((t) => format(t.expr));
  assert.ok(!of("Milk").includes("During(ShoppingList_1())"));
  assert.ok(of("Breakfast").includes("During(Morning())"));
});
