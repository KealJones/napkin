import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { c } from "../concept/expression.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { jsonIn, taughtBefore, teachEvent, teachWord } from "./teacher.js";
import { learnedReadings } from "../resolve/learned.js";

// Every source finds nothing: the teacher is what is left.
const nothing = async (): Promise<unknown> => ({});

test("what a teacher says is kept in the graph's own relations, stamped, and not asked twice", async () => {
  const store = new ConceptStore();
  seed(store);
  const prompts: string[] = [];
  const ask = async (p: string) => {
    prompts.push(p);
    return '```json\n{"kind":"word","means":"the upper edge of the side of a boat","IsA":["edge","the rim"],"PartOf":["boat"],"Invents":["x"],"UsedFor":["a whole sentence that is far too long to be a phrase"]}\n```';
  };
  const taught = await teachWord(store, "Gunwale", "gunwale", "she leaned on the gunwale", { ask });
  assert.deepEqual(taught!.relations.map(format), ['Means("the upper edge of the side of a boat")', "IsA(Edge())", "IsA(Rim())", "PartOf(Boat())"]);
  // Asked in relations the graph has, and nothing it does not.
  assert.ok(!/"Invents"/.test(prompts[0]!));
  assert.ok(taughtBefore(store, "gunwale", "word"));
  assert.equal(await teachWord(store, "Gunwale", "gunwale", "again", { ask }), undefined);
  assert.equal(prompts.length, 1);
  // A misspelling is kept as a reading of what was typed; a name as a name of someone.
  await teachWord(store, "Recieve", "recieve", "did you recieve it", { ask: async () => '{"kind":"misspelling","meant":"receive"}' });
  assert.ok(learnedReadings(store, "recieve").some((l) => l.meant === "receive"));
  const named = await teachWord(store, "Mishka", "mishka", "mishka bought a car", { ask: async () => '{"kind":"name","nameOf":"person"}' });
  assert.deepEqual(named!.relations.map(format), ["IsA(Name())", "IsA(Person())"]);
  // Not known is kept as nothing, not guessed.
  assert.deepEqual((await teachWord(store, "Zorp", "zorp", "zorp", { ask: async () => '{"kind":"unknown"}' }))!.relations, []);
  assert.equal(jsonIn("no json here"), undefined);
});

test("an event no source has is taught in ATOMIC's relations, and the reply is Napkin's, from what it holds", async () => {
  const store = new ConceptStore();
  seed(store);
  const ask = async () => '{"xReact":["upset"],"xWant":["to buy a new blender"],"xEffect":["has no smoothie"],"oReact":["PersonY is sad"]}';
  const event = await teachEvent(store, "blender explode", "my blender exploded", { ask });
  assert.deepEqual(event.relations.map(format), ["XReact(Upset())", "XWant(BuyANewBlender())", "XEffect(HasNoSmoothie())"]);
  const store2 = new ConceptStore();
  seed(store2);
  const t = await turn(new Runtime(store2, {}), "my blender exploded", c("Execution"), { fetch: nothing, teacher: ask });
  assert.match(t.spoken, /buy a new blender/i);
  // Told again, it is held: nothing is asked.
  let asked = 0;
  await turn(new Runtime(store2, {}), "my blender exploded", c("Execution"), { fetch: nothing, teacher: async () => { asked++; return "{}"; } });
  assert.equal(asked, 0);
});
