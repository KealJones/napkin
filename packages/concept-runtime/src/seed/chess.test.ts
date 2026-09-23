import assert from "node:assert/strict";
import { test } from "node:test";
import {
  c,
  call,
  format,
  isCall,
  named,
  parse,
  type Expr,
} from "../concept/expression.js";
import { isCodeBody } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { ConceptStore } from "../store/store.js";
import { seed } from "./seed.js";
import { chessUnits } from "./chess.js";
import { gamePrimitiveUnits } from "./game-primitives.js";

function runtime() {
  const store = new ConceptStore();
  seed(store);
  for (const unit of [...gamePrimitiveUnits, ...chessUnits]) store.seed(unit);
  return new Runtime(store, { maximumSteps: 1_000_000, maximumDepth: 256 });
}
const record = (head: string, fields: Record<string, Expr>) =>
  call(
    head,
    Object.entries(fields).map(([name, value]) => ({ name, value })),
  );
const square = (label: string) =>
  c("Square", label.charCodeAt(0) - 97, Number(label[1]) - 1);
const move = (from: string, to: string, promotion: Expr = null) =>
  record("Move", { from: square(from), to: square(to), promotion });
const piece = (kind: string, side: string, at: string) =>
  record("Piece", { kind: c(kind), side: c(side), square: square(at) });
const position = (
  pieces: Expr[],
  turn = "White",
  fields: Record<string, Expr> = {},
) =>
  record("ChessPosition", {
    board: c("List", ...pieces),
    turn: c(turn),
    rights: c("List"),
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    ...fields,
  });
const run = async (rt: Runtime, expression: Expr) => {
  rt.reset();
  return rt.evaluate(expression, c("Execution"));
};
const rules = async (rt: Runtime) => run(rt, c("ChessRules"));
const items = (value: Expr) => {
  assert.ok(isCall(value) && value.head === "List", format(value));
  return value.args.map((a) => a.value);
};
const field = (value: Expr, key: string) => {
  assert.ok(isCall(value));
  return named(value, key)!;
};
const moves = async (rt: Runtime, pos: Expr, rule?: Expr) =>
  items(
    await run(
      rt,
      c("ChessLegalMoves", pos, field(pos, "turn"), rule ?? (await rules(rt))),
    ),
  );
const contains = (list: Expr[], from: string, to: string) =>
  list.some(
    (m) =>
      format(field(m, "from")) === format(square(from)) &&
      format(field(m, "to")) === format(square(to)),
  );

test("all chess behavior is composed and the initial position has 20 legal moves", async () => {
  assert.ok(
    chessUnits.flatMap((u) => u.realizations).every((r) => !isCodeBody(r.body)),
  );
  const rt = runtime();
  const pos = await run(rt, c("ChessInitialPosition"));
  const legal = await moves(rt, pos);
  assert.equal(legal.length, 20);
  assert.ok(contains(legal, "e2", "e4"));
  assert.ok(contains(legal, "b1", "c3"));
  assert.equal(
    items(await run(rt, c("ChessLegalMoves", pos, c("Black"), await rules(rt))))
      .length,
    0,
  );
  assert.equal(
    await run(rt, c("ChessScore", pos, c("White"), await rules(rt))),
    0,
  );
  assert.equal(
    format(await run(rt, parse('Move(Square("e2"),Square("e4"))'))),
    format(move("e2", "e4")),
  );
});

test("pins constrain legal moves but a pinned knight still attacks a king destination", async () => {
  const rt = runtime();
  const pos = position([
    piece("King", "White", "e1"),
    piece("Rook", "White", "e2"),
    piece("Rook", "Black", "e8"),
    piece("King", "Black", "a8"),
  ]);
  const legal = await moves(rt, pos);
  assert.ok(!contains(legal, "e2", "d2"));
  assert.ok(contains(legal, "e2", "e8"));
  const pinned = position([
    piece("King", "White", "e4"),
    piece("Rook", "White", "g1"),
    piece("Knight", "Black", "g7"),
    piece("King", "Black", "g8"),
  ]);
  assert.ok(!contains(await moves(rt, pinned), "e4", "f5"));
});

test("en passant removes its pawn and rejects discovered self-check", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const base = [
    piece("King", "White", "e1"),
    piece("King", "Black", "a8"),
    piece("Pawn", "White", "e5"),
    piece("Pawn", "Black", "d5"),
  ];
  const pos = position(base, "White", { enPassant: square("d6") });
  assert.ok(contains(await moves(rt, pos), "e5", "d6"));
  const after = await run(
    rt,
    c("ChessPositionAfter", pos, move("e5", "d6"), rule),
  );
  assert.equal(items(field(after, "board")).length, 3);
  assert.equal(field(after, "halfmove"), 0);
  assert.equal(field(after, "enPassant"), null);
  const pinned = position([...base, piece("Rook", "Black", "e8")], "White", {
    enPassant: square("d6"),
  });
  assert.ok(!contains(await moves(rt, pinned), "e5", "d6"));
  assert.equal(await run(rt, c("ChessRepetitionEp", pinned, rule)), null);
});

test("castling requires its right, rook, empty route, and unattacked king route", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const right = record("CastleRight", { side: c("White"), rook: square("h1") });
  const base = [
    piece("King", "White", "e1"),
    piece("Rook", "White", "h1"),
    piece("King", "Black", "a8"),
  ];
  const pos = position(base, "White", { rights: c("List", right) });
  assert.ok(contains(await moves(rt, pos), "e1", "g1"));
  const after = await run(
    rt,
    c("ChessPositionAfter", pos, move("e1", "g1"), rule),
  );
  assert.equal(
    format(
      await run(
        rt,
        c("Slot", c("Occupant", field(after, "board"), square("f1")), "kind"),
      ),
    ),
    "Rook()",
  );
  assert.equal(items(field(after, "rights")).length, 0);
  assert.ok(!contains(await moves(rt, position(base)), "e1", "g1"));
  const attacked = position([...base, piece("Rook", "Black", "f8")], "White", {
    rights: c("List", right),
  });
  assert.ok(!contains(await moves(rt, attacked), "e1", "g1"));
  assert.ok(
    !contains(
      await moves(
        rt,
        pos,
        record("GameRules", {
          pawnDouble: true,
          castling: false,
          kingSafety: true,
        }),
      ),
      "e1",
      "g1",
    ),
  );
});

test("promotion offers four choices and promotion capture changes the piece", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const pos = position([
    piece("King", "White", "a1"),
    piece("King", "Black", "h8"),
    piece("Pawn", "White", "b7"),
    piece("Rook", "Black", "c8"),
  ]);
  const legal = await moves(rt, pos);
  assert.equal(
    legal.filter((m) => format(field(m, "from")) === format(square("b7")))
      .length,
    8,
  );
  const after = await run(
    rt,
    c("ChessPositionAfter", pos, move("b7", "c8", c("Knight")), rule),
  );
  assert.equal(
    format(
      await run(
        rt,
        c("Slot", c("Occupant", field(after, "board"), square("c8")), "kind"),
      ),
    ),
    "Knight()",
  );
  assert.equal(items(field(after, "board")).length, 3);
});

test("checkmate precedes automatic draws; stalemate and common dead positions are recognized", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const mate = position(
    [
      piece("King", "Black", "h8"),
      piece("King", "White", "f6"),
      piece("Queen", "White", "g7"),
    ],
    "Black",
    { halfmove: 150 },
  );
  assert.equal(
    format(await run(rt, c("ChessOutcome", mate, c("List"), rule))),
    "Win(White(), Checkmate())",
  );
  const stale = position(
    [
      piece("King", "Black", "h8"),
      piece("King", "White", "f7"),
      piece("Queen", "White", "g6"),
    ],
    "Black",
  );
  assert.equal(
    format(await run(rt, c("ChessOutcome", stale, c("List"), rule))),
    "Draw(Stalemate())",
  );
  const bare = position([
    piece("King", "White", "a1"),
    piece("King", "Black", "h8"),
  ]);
  assert.equal(
    format(await run(rt, c("ChessOutcome", bare, c("List"), rule))),
    "Draw(DeadPosition())",
  );
  const clock = position(
    [
      piece("King", "White", "a1"),
      piece("King", "Black", "h8"),
      piece("Rook", "White", "b1"),
    ],
    "White",
    { halfmove: 150 },
  );
  assert.equal(
    format(await run(rt, c("ChessOutcome", clock, c("List"), rule))),
    "Draw(SeventyFiveMoves())",
  );
});

test("repetition ignores piece ordering and unusable en passant; claims and fivefold are distinct", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const pieces = [
    piece("King", "White", "a1"),
    piece("King", "Black", "h8"),
    piece("Rook", "White", "b1"),
  ];
  const pos = position(pieces, "White", { halfmove: 100 });
  const prior = position([...pieces].reverse(), "White", {
    enPassant: square("c6"),
  });
  assert.equal(await run(rt, c("ChessSamePosition", pos, prior, rule)), true);
  assert.equal(
    format(
      await run(rt, c("DrawClaimable", pos, c("List", prior, prior), rule)),
    ),
    "List(ThreefoldRepetition(), FiftyMoves())",
  );
  assert.equal(
    format(
      await run(
        rt,
        c("ChessOutcome", pos, c("List", prior, prior, prior, prior), rule),
      ),
    ),
    "Draw(FivefoldRepetition())",
  );
});

test("pawn-double variant changes the executable legal move set", async () => {
  const rt = runtime();
  const pos = await run(rt, c("ChessInitialPosition"));
  const variant = await run(
    rt,
    c("With", await rules(rt), "pawnDouble", false),
  );
  const legal = await moves(rt, pos, variant);
  assert.equal(legal.length, 12);
  assert.ok(!contains(legal, "e2", "e4"));
});

test("initial position perft depth two is 400 through the Concept transition", async () => {
  let rt = runtime();
  const rule = await rules(rt),
    pos = await run(rt, c("ChessInitialPosition"));
  const first = await moves(rt, pos, rule);
  let nodes = 0;
  for (const action of first) {
    // Each evaluation has its own trace so the test does not retain every search node.
    rt = runtime();
    const after = await run(rt, c("ChessPositionAfter", pos, action, rule));
    nodes += (await moves(rt, after, rule)).length;
  }
  assert.equal(nodes, 400);
});

test("castling-rich middlegame has 48 legal moves", async () => {
  const rt = runtime();
  const kinds: Record<string, string> = {
    r: "Rook",
    n: "Knight",
    b: "Bishop",
    q: "Queen",
    k: "King",
    p: "Pawn",
  };
  const board: Expr[] = [];
  const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R";
  fen.split("/").forEach((rank, row) => {
    let file = 0;
    for (const letter of rank) {
      if (/\d/.test(letter)) file += Number(letter);
      else {
        board.push(
          piece(
            kinds[letter.toLowerCase()]!,
            letter === letter.toUpperCase() ? "White" : "Black",
            `${String.fromCharCode(97 + file)}${8 - row}`,
          ),
        );
        file++;
      }
    }
  });
  const initial = await run(rt, c("ChessInitialPosition"));
  const pos = position(board, "White", { rights: field(initial, "rights") });
  assert.equal((await moves(rt, pos)).length, 48);
});

test("double pushes, black counters, and rook captures update position metadata", async () => {
  const rt = runtime(),
    rule = await rules(rt);
  const initial = await run(rt, c("ChessInitialPosition"));
  const white = await run(
    rt,
    c("ChessPositionAfter", initial, move("e2", "e4"), rule),
  );
  assert.equal(format(field(white, "enPassant")), format(square("e3")));
  assert.equal(field(white, "fullmove"), 1);
  const black = await run(
    rt,
    c("ChessPositionAfter", white, move("b8", "c6"), rule),
  );
  assert.equal(field(black, "enPassant"), null);
  assert.equal(field(black, "halfmove"), 1);
  assert.equal(field(black, "fullmove"), 2);
  const corner = position(
    [
      piece("King", "White", "e1"),
      piece("King", "Black", "e8"),
      piece("Rook", "White", "h1"),
      piece("Rook", "Black", "h8"),
    ],
    "White",
    { rights: field(initial, "rights") },
  );
  const captured = await run(
    rt,
    c("ChessPositionAfter", corner, move("h1", "h8"), rule),
  );
  assert.equal(items(field(captured, "rights")).length, 2);
  assert.ok(
    items(field(captured, "rights")).every(
      (right) => !format(field(right, "rook")).startsWith("Square(7,"),
    ),
  );
  assert.equal(await run(rt, parse('Square("a9")')), null);
  assert.equal(
    format(await run(rt, parse('Move(Square("b7"),Square("b8"),Queen())'))),
    format(move("b7", "b8", c("Queen"))),
  );
});
