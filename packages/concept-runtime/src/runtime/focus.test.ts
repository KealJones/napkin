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

test("a list made in conversation holds what is put on it and not taken off, and is found by what the words say of it", async () => {
  const { turn } = await import("./turn.js");
  const store = new ConceptStore();
  seed(store);
  const say = async (m: string) => {
    const runtime = new Runtime(store);
    return (await turn(runtime, m, c("Execution"), { learn: false, conversation: "Conversation_2" })).spoken;
  };
  assert.equal(await say("make a shopping list"), "Started your shopping list.");
  assert.equal(await say("add milk to my shopping list"), "Added milk to your shopping list.");
  assert.equal(await say("put eggs on my list"), "Added eggs to your shopping list.");
  assert.equal(await say("remove milk from my list"), "Took milk off your shopping list.");
  assert.equal(await say("what is on my shopping list?"), "Your shopping list has eggs.");
});

test("a doing that takes two things takes them as one group", async () => {
  const store = new ConceptStore();
  seed(store);
  const runtime = new Runtime(store);
  assert.equal(format(await runtime.evaluate(parse("Add(And(5, 3))"), c("Execution"))), "8");
  assert.equal(format(await runtime.evaluate(parse("Multiply(List(2, 3, 4))"), c("Execution"))), "24");
});
