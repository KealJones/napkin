import assert from "node:assert/strict";
import { test } from "node:test";
import { c } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { sayAmount, situationOf, solve } from "./situation.js";

const store = new ConceptStore();
seed(store);
const answer = (q: string) => {
  const s = situationOf(store, q);
  return s ? solve(s.amounts, s.asked)?.value : undefined;
};

test("amounts are read with their units, and the units asked decide how they combine", () => {
  const s = situationOf(store, "Janet's ducks lay 16 eggs per day. She eats three for breakfast every morning and bakes muffins for her friends every day with four. She sells the remainder at the farmers' market daily for $2 per fresh duck egg. How much in dollars does she make every day at the farmers' market?")!;
  assert.deepEqual(s.asked.unit, { dollar: 1, day: -1 });
  assert.deepEqual(s.amounts[0]!.unit, { egg: 1, day: -1 });
  assert.equal(solve(s.amounts, s.asked)!.value, 18);
  assert.equal(answer("I have 12 apples and eat 5. How many apples do I have left?"), 7);
});

test("ratios, comparisons and changes are worked from what they are of, in any order told", () => {
  assert.equal(answer("Toulouse has twice as many sheep as Charleston. Charleston has 4 times as many sheep as Seattle. How many sheep do Toulouse, Charleston, and Seattle have together if Seattle has 20 sheep?"), 260);
  assert.equal(answer("Tim has 30 less apples than Martha, and Harry has half as many apples as Tim. If Martha has 68 apples, how many apples does Harry have?"), 19);
  assert.equal(answer("Mel is three years younger than Katherine. When Katherine is two dozen years old, how old will Mel be in years?"), 21);
  assert.equal(answer("A one-year subscription to a newspaper is offered with a 45% discount. How much does the discounted subscription cost if a subscription normally costs $80?"), 44);
  assert.equal(answer("Brandon sold 86 geckos last year. He sold twice that many the year before. How many geckos has Brandon sold in the last two years?"), 258);
});

test("amounts are said as people say them", () => {
  assert.equal(sayAmount(18, { dollar: 1, day: -1 }), "18 dollars a day");
  assert.equal(sayAmount(260, { sheep: 1 }), "260 sheep");
  assert.equal(sayAmount(1, { hour: 1 }), "1 hour");
});

test("a situation asked about in conversation is answered with its working; names in it are not looked up", async () => {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    return {};
  };
  const t = await turn(new Runtime(store, {}), "Tim has 30 less apples than Martha, and Harry has half as many apples as Tim. If Martha has 68 apples, how many apples does Harry have?", c("Execution"), { fetch });
  assert.equal(t.spoken, "68 apples - 30 = 38; half of 38 = 19. So 19 apples.");
  assert.deepEqual(asked, []);
  // Not a situation: arithmetic and questions about things are heard as before.
  assert.equal((await turn(new Runtime(store, {}), "what is 3 times 4?", c("Execution"), { learn: false })).spoken, "12.");
});
