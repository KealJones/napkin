import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, format, parse } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { load, save } from "../store/persist.js";
import { ConceptStore } from "../store/store.js";
import { ConversationRepository } from "./conversations.js";

/**
 * Conversations run the way the studio runs them: the rules reader, no model, each turn
 * heard before it is read and recorded as said, and told which conversation it is in.
 */
function world(store = new ConceptStore(), fresh = true) {
  if (fresh) seed(store);
  const conversations = new ConversationRepository(store);
  const open = () => {
    const { id } = conversations.create();
    return async (text: string) => {
      const runtime = new Runtime(store);
      const heard = conversations.receive();
      runtime.trace.said(heard.seq);
      const r = await turn(runtime, text, c("Execution"), { backend: "rules", learn: false, speak: false, conversation: id });
      conversations.record(id, { message: text, ...(r.expression ? { parsed: r.expression } : {}), result: r.result ?? r.rendered, heard });
      return r.rendered;
    };
  };
  return { store, open };
}

const games = (store: ConceptStore) =>
  store.asObject("TicTacToe").filter((t) => t.predicate === "IsA").map((t) => t.subject);
const board = async (store: ConceptStore, game: string) => format(await new Runtime(store).evaluate(parse(`Board(${game}())`), c("Execution")));
const ended = (store: ConceptStore, game: string) => store.asSubject(game).some((t) => t.predicate === "Ended");

test("starting a game mints it, and a move is committed on it with the system's reply, echoed", async () => {
  const { store, open } = world();
  const say = open();
  assert.match(await say("let's play tic tac toe"), /^InGame\(Game_1\(\), echo="Tic tac toe against me", Started\(\)/);
  assert.equal(games(store).length, 1);
  const moved = await say("a1");
  assert.match(moved, /Moved\(X\(\), A1\(\)\), Moved\(O\(\), B2\(\)\), Board\("X\.\.", "\.O\.", "\.\.\."\)/);
  // The user's move is sourced from what was said; the reply from the move it answers.
  const [x] = store.get("Game_1")!.relations.filter((r) => format(r.claim) === "Moved(X(), A1())");
  const [o] = store.get("Game_1")!.relations.filter((r) => format(r.claim) === "Moved(O(), B2())");
  assert.match(format(store.findStamp(x.stamps![0].source!)!.relation.claim), /^Said\(Me\(\), Mood\(Imperative\(\), A1\(\)\)/);
  assert.equal(o.stamps![0].source, x.stamps![0].seq);
});

test("an illegal move commits nothing and answers with the kind's failure", async () => {
  const { store, open } = world();
  const say = open();
  await say("let's play tic tac toe");
  await say("a1");
  const before = store.get("Game_1")!.relations.length;
  assert.match(await say("b2"), /Illegal\(B2\(\), reason="taken"\)/);
  assert.equal(store.get("Game_1")!.relations.length, before);
  // "take c3" is the same move as "c3".
  assert.match(await say("take c3"), /^InGame\(Game_1\(\), .*Moved\(X\(\), C3\(\)\)/);
});

test("take back retracts the move and the reply to it, and the fold skips both", async () => {
  const { store, open } = world();
  const say = open();
  await say("let's play tic tac toe");
  await say("a1");
  assert.match(await say("take back"), /TookBack\(Moved\(X\(\), A1\(\)\), Moved\(O\(\), B2\(\)\)\), Board\("\.\.\.", "\.\.\.", "\.\.\."\)/);
  // Nothing was removed: the history holds the moves and what retracted them.
  assert.equal(store.asSubject("Game_1").filter((t) => t.predicate === "Retracts").length, 2);
  // The same move again is a second stamp on the one relation, and it counts.
  await say("a1");
  assert.equal(store.get("Game_1")!.relations.find((r) => format(r.claim) === "Moved(X(), A1())")!.stamps!.length, 2);
  assert.equal(await board(store, "Game_1"), 'Board("X..", ".O.", "...")');
});

test("with two open games a bare move routes by the Part 8.2 order, or asks", async () => {
  const { store, open } = world();
  const here = open();
  await here("let's play tic tac toe"); // Game_1, against the system
  assert.match(await here("let's play tic tac toe against greg"), /echo="Tic tac toe against Greg"/); // Game_2
  // Both are legal: the most recently focused one takes it, and the echo says which.
  assert.match(await here("b2"), /^InGame\(Game_2\(\), echo="Tic tac toe against Greg", Moved\(X\(\), B2\(\)\)/);
  // Legal in only one: that one, though it is not the most recent.
  assert.match(await here("b2"), /^InGame\(Game_1\(\), echo="Tic tac toe against me", Moved\(X\(\), B2\(\)\)/);
  // An explicit description beats recency.
  assert.match(await here("c3 in the game against greg"), /^InGame\(Game_2\(\), .*Moved\(O\(\), C3\(\)\)/);
  // Nothing focused, two legal: ask, describing each by what lasts.
  const elsewhere = open();
  assert.match(await elsewhere("a3"), /^Which\(Move\(A3\(\)\), List\("Tic tac toe against (me|Greg)", "Tic tac toe against (me|Greg)"\)\)/);
  assert.equal(store.asSubject("Game_1").filter((t) => t.predicate === "Moved").length + store.asSubject("Game_2").filter((t) => t.predicate === "Moved").length, 4);
  // Two games never share a move.
  assert.equal(await board(store, "Game_2"), 'Board("...", ".X.", "..O")');
});

test("a game started in one conversation, with talk between moves, is resumed and finished in another", async () => {
  const { store, open } = world();
  const first = open();
  await first("let's play tic tac toe");
  await first("a1");
  await first("i like pizza");
  await first("what is 2 plus 2");
  const second = open();
  assert.match(await second("continue the game"), /^InGame\(Game_1\(\), echo="Tic tac toe against me", Resumed\(\), Board\("X\.\.", "\.O\.", "\.\.\."\)\)/);
  // Play the first free square until it ends.
  let last = "";
  for (let i = 0; i < 5 && !ended(store, "Game_1"); i++) {
    const cells = (await board(store, "Game_1")).match(/"([XO.]{3})"/g)!.map((r) => r.slice(1, 4)).join("");
    const free = cells.indexOf(".");
    last = await second("abc"[free % 3] + (Math.floor(free / 3) + 1));
  }
  assert.ok(ended(store, "Game_1"));
  assert.match(last, /(Won|Drawn)\(/);
  // Closed now, so a bare move routes nowhere.
  assert.equal(await second("c3"), "C3()");
  // The talk in between never reached the game, and its moves came from both conversations.
  const sources = store.get("Game_1")!.relations.filter((r) => format(r.claim).startsWith("Moved(X()"))
    .flatMap((r) => r.stamps!).map((s) => store.findStamp(s.source!)!.identity);
  assert.equal(new Set(sources).size, 2);
});

test("the board is a fold that survives a save and load", async () => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-process-"));
  try {
    const path = join(dir, "graph.json");
    const one = world();
    const say = one.open();
    await say("let's play tic tac toe");
    await say("a1");
    await say("take back");
    await say("c1");
    const before = await board(one.store, "Game_1");
    save(one.store, path);

    const store = new ConceptStore();
    load(store, path);
    seed(store);
    assert.equal(await board(store, "Game_1"), before);
    const again = world(store, false).open();
    assert.match(await again("continue the game"), /Resumed\(\)/);
    assert.match(await again("a1"), /Moved\(X\(\), A1\(\)\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
