import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { ConversationRepository } from "../memory/conversations.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

/** A conversation on a store of its own, recording what was said the way the studio does. */
const conversation = () => {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const r = await turn(runtime, text, c("Execution"), { learn: false, conversation: id });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, spoken: r.spoken, heard });
    return { said: r.spoken, gaps: r.gaps.map((g) => g.expression) };
  };
  return { store, say };
};

test("what was said is found by its shape when asked after, with nothing written for names", async () => {
  const { say } = conversation();
  assert.doesNotMatch((await say("my name is Keal")).said, /stuck|couldn't read|nothing for/i, "a statement is kept, not run");
  assert.match((await say("what is my name?")).said, /keal/i);
  await say("my dog's name is Bolt");
  assert.match((await say("what is my dog's name?")).said, /bolt/i);
  await say("the capital of france is paris");
  assert.match((await say("what is the capital of france?")).said, /paris/i);
});

test("the newest statement wins, a question asserts nothing, and what was never said stays unknown", async () => {
  const { say } = conversation();
  await say("my favorite color is green");
  await say("is my favorite color blue?");
  await say("my favorite color is red");
  const color = (await say("what is my favorite color?")).said;
  assert.match(color, /red/i);
  assert.doesNotMatch(color, /green/i, "the old colour is not said");
  const cat = await say("what is my cat's name?");
  assert.match(cat.said, /don't know|haven't/i);
  assert.doesNotMatch(cat.said, /declares|Cat S/i);
  assert.ok(cat.gaps.length, "an unanswered question is still something to learn");
});

test("an answer found another way leaves no gap behind", async () => {
  const { say } = conversation();
  await say("my name is Keal");
  assert.deepEqual((await say("what is my name?")).gaps, []);
});

test("Extends answers with what the stored expression says beyond the goal, or False", async () => {
  const store = new ConceptStore();
  seed(store);
  const run = async (e: string) => format(await new Runtime(store).evaluate(parse(e), c("Execution")));
  assert.equal(await run("Extends(My(Name(Is(Keal()))), My(Name()))"), "List(Is(Keal()))");
  assert.equal(await run("Extends(Capital(Of(France()), Is(Paris())), Capital(Of(France())))"), "List(Is(Paris()))");
  assert.equal(await run("Extends(My(Dog()), My(Name()))"), "False()");
});

test("said in another shape: the question's words are in the statement, and the rest answers", async () => {
  const { say } = conversation();
  await say("i live in phoenix");
  await say("i ate an apple");
  await say("greg is my coworker");
  await say("my sister lives in denver");
  assert.match((await say("where do i live?")).said, /phoenix/i);
  assert.match((await say("what did i eat?")).said, /apple/i, "ate is eat");
  // Greg is someone met here, an individual of his own, said "Greg".
  assert.match((await say("who is my coworker?")).said, /greg/i);
  assert.match((await say("where does my sister live?")).said, /denver/i);
  assert.match((await say("who is greg?")).said, /coworker/i);
});

test("an answer of the wrong kind is passed over: who asks for someone", async () => {
  const { say } = conversation();
  await say("my favorite number is 7");
  assert.match((await say("what is my favorite number?")).said, /\b7\b/);
  assert.doesNotMatch((await say("who is my favorite number?")).said, /^\W*7\b/);
});

test("what my or your names is what that one holds by it", async () => {
  const { say } = conversation();
  assert.match((await say("what is your name?")).said, /napkin/i);
});

// Wikidata, Wiktionary and Wikibooks as they answer for a cake: the Cookbook holds recipes, the page
// has its ingredients and numbered steps. Stands in for the network while the test runs.
const RAW_RECIPE = "== Ingredients ==\n* 2 cups flour\n* 1 cup sugar\n== Procedure ==\n# Mix the flour and sugar.\n# Bake for 30 minutes.\n";
const cookbook = async (url: unknown): Promise<Response> => {
  const u = new URL(String(url));
  const q = u.searchParams;
  const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
  if (u.hostname === "en.wiktionary.org") return json({ en: [{ partOfSpeech: decodeURIComponent(u.pathname.split("/").pop() ?? "") === "bake" ? "Verb" : "Noun", definitions: [{ definition: "x" }] }] });
  if (u.hostname === "www.wikidata.org") {
    const word = q.get("search");
    if (q.get("action") === "wbsearchentities") return json({ search: q.get("type") === "item" && (word === "recipe" || word === "cake") ? [{ id: word === "recipe" ? "Q1" : "Q2", label: word, description: word }] : [] });
    if (q.get("action") === "wbgetentities") return json({ entities: { Q1: { sitelinks: { enwikibooks: { title: "Cookbook:Recipe" } } }, Q2: { sitelinks: { enwikibooks: { title: "Cookbook:Cake" } } } } });
  }
  if (u.hostname === "en.wikibooks.org") {
    if (q.get("meta") === "siteinfo") return json({ query: { namespaces: { "0": { id: 0, "*": "", content: "" }, "102": { id: 102, "*": "Cookbook" } } } });
    if (q.get("list") === "search") return json({ query: { search: [{ title: "Cookbook:Chocolate Cake" }] } });
    if (q.get("action") === "raw") return new Response(RAW_RECIPE, { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

test("what a line leaves undone is looked for further, in what the world has written", async () => {
  const { say } = conversation();
  const real = globalThis.fetch;
  globalThis.fetch = cookbook as typeof fetch;
  try {
    // "give me" does its part and leaves a cake recipe as it was said: that is what is looked for.
    const recipe = (await say("can you give me a cake recipe?")).said;
    assert.match(recipe, /ingredients/i);
    assert.match(recipe, /flour/i);
    // How asks for steps, and steps are written at Wikibooks.
    assert.match((await say("how do you bake a cake?")).said, /1\.|first|step/i);
  } finally {
    globalThis.fetch = real;
  }
});

test("a command is not answered with a fact found for its words", async () => {
  const { say } = conversation();
  // Not the sort of reply a fact found for "Keal" or "Hi" would be.
  assert.doesNotMatch((await say('make a function that console logs "Hi Keal"')).said, /^(Keal|Hi)\b.*\bis\b/);
});

test("told something of a word never met, with learning on, what was told answers who it is, not a guess that it is a name", async () => {
  const store = new ConceptStore();
  seed(store);
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const say = async (text: string) => {
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const r = await turn(runtime, text, c("Execution"), { conversation: id, fetch: async () => ({}) });
    conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
    return r.spoken;
  };
  await say("Gunter is my friend.");
  assert.match(await say("who is gunter?"), /friend/i);
});
