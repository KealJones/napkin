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
