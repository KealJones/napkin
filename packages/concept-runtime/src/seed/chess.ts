/** Chess is data and composed Concepts. Only the reusable collection/grid operations
 * cross into host code; every chess decision remains editable in the Concept graph. */
import { parse } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const units: ConceptUnit[] = [];
const define = (pattern: string, body: string) => {
  const identity = pattern.slice(0, pattern.indexOf("("));
  const rule = realization({
    pattern,
    body: parse(body),
    properties: ["Pure()"],
  });
  const existing = units.findIndex((unit) => unit.identity === identity);
  if (existing < 0)
    units.push(
      concept(identity, {
        relations: ["IsA(ChessConcept())"],
        realizations: [rule],
      }),
    );
  else
    units[existing] = {
      ...units[existing]!,
      realizations: [...units[existing]!.realizations, rule],
    };
};
for (const name of [
  "ChessConcept",
  "ChessPosition",
  "Piece",
  "White",
  "Black",
  "Pawn",
  "Knight",
  "Bishop",
  "Rook",
  "Queen",
  "King",
  "CastleRight",
  "Checkmate",
  "Stalemate",
  "DeadPosition",
  "FivefoldRepetition",
  "SeventyFiveMoves",
  "ThreefoldRepetition",
  "FiftyMoves",
])
  units.push(concept(name, { relations: ["IsA(Data())"] }));

define(
  "Square($label)",
  'Let($coordinate,CoordinateFromLabel($label,"abcdefgh",1),If(And(BoolNot(Same($coordinate,null)),LessThan(Slot($coordinate,1),8)),$coordinate,null))',
);
define("Move($from, $to)", "Build(Move(from=$from, to=$to, promotion=null))");
define(
  "Move($from, $to, $promotion)",
  "Build(Move(from=$from, to=$to, promotion=$promotion))",
);
define("ChessOther($side)", "If(Same($side,White()),Black(),White())");
define("ChessForward($side)", "If(Same($side,White()),1,-1)");
define("ChessHome($side)", "If(Same($side,White()),0,7)");
define("ChessPawnHome($side)", "If(Same($side,White()),1,6)");
define("ChessPromotionRank($side)", "If(Same($side,White()),7,0)");
define(
  "ChessRules()",
  `GameRules(actions=ChessLegalMoves(), transition=ChessPositionAfter(), outcome=ChessOutcome(), evaluate=ChessScore(), setup=ChessInitialPosition(), claims=DrawClaimable(), editable=List(RuleOption(name="pawnDouble",values=List(true,false)),RuleOption(name="castling",values=List(true,false))), pawnDouble=true, castling=true, kingSafety=true)`,
);

// Static initial data, not an executable chess implementation.
const backRank = [
  "Rook",
  "Knight",
  "Bishop",
  "Queen",
  "King",
  "Bishop",
  "Knight",
  "Rook",
];
const initialPieces = ["White", "Black"].flatMap((side, s) =>
  backRank.flatMap((kind, file) => [
    `Piece(kind=${kind}(), side=${side}(), square=Square(${file}, ${s === 0 ? 0 : 7}))`,
    `Piece(kind=Pawn(), side=${side}(), square=Square(${file}, ${s === 0 ? 1 : 6}))`,
  ]),
);
const initialRights = ["White", "Black"].flatMap((side, s) =>
  [0, 7].map(
    (file) =>
      `CastleRight(side=${side}(), rook=Square(${file}, ${s === 0 ? 0 : 7}))`,
  ),
);
define(
  "ChessInitialPosition()",
  `ChessPosition(board=List(${initialPieces.join(",")}), turn=White(), rights=List(${initialRights.join(",")}), enPassant=null, halfmove=0, fullmove=1)`,
);

define(
  "ChessDiagonalDirections()",
  "List(Square(1,1),Square(1,-1),Square(-1,1),Square(-1,-1))",
);
define(
  "ChessStraightDirections()",
  "List(Square(1,0),Square(-1,0),Square(0,1),Square(0,-1))",
);
define(
  "ChessKingDirections()",
  "ConcatLists(ChessDiagonalDirections(),ChessStraightDirections())",
);
define(
  "ChessKnightDirections()",
  "List(Square(1,2),Square(2,1),Square(-1,2),Square(-2,1),Square(1,-2),Square(2,-1),Square(-1,-2),Square(-2,-1))",
);
define(
  "ChessJumps($square,$directions)",
  `Filter(Map($directions,Lambda($delta,GridOffset($square,Slot($delta,0),Slot($delta,1),8,8))),Lambda($landing,BoolNot(Same($landing,null))))`,
);
define(
  "ChessRays($board,$square,$directions)",
  `FlatMap($directions,Lambda($delta,GridRay($board,$square,$delta,7,8,8,true)))`,
);
// Attack squares deliberately include friendly blockers and attacks by pinned pieces.
define(
  "ChessAttacks($piece,$board,$rules)",
  `Let($kind,Slot($piece,"kind"),ChessKindAttacks($kind,$piece,$board,$rules))`,
);
define(
  "ChessKindAttacks(Pawn(),$piece,$board,$rules)",
  `Let($direction,ChessForward(Slot($piece,"side")),ChessJumps(Slot($piece,"square"),MakeList(Build(Square(-1,$direction)),Build(Square(1,$direction)))))`,
);
define(
  "ChessKindAttacks(Knight(),$piece,$board,$rules)",
  'ChessJumps(Slot($piece,"square"),ChessKnightDirections())',
);
define(
  "ChessKindAttacks(King(),$piece,$board,$rules)",
  'ChessJumps(Slot($piece,"square"),ChessKingDirections())',
);
define(
  "ChessKindAttacks(Bishop(),$piece,$board,$rules)",
  'ChessRays($board,Slot($piece,"square"),ChessDiagonalDirections())',
);
define(
  "ChessKindAttacks(Rook(),$piece,$board,$rules)",
  'ChessRays($board,Slot($piece,"square"),ChessStraightDirections())',
);
define(
  "ChessKindAttacks(Queen(),$piece,$board,$rules)",
  'ChessRays($board,Slot($piece,"square"),ChessKingDirections())',
);
define(
  "ChessAttacked($board,$square,$by,$rules)",
  `Any($board,Lambda($attacker,And(Same(Slot($attacker,"side"),$by),Any(ChessAttacks($attacker,$board,$rules),Lambda($attack,Same($attack,$square))))))`,
);
define(
  "ChessCheck($position,$side,$rules)",
  `Let($board,Slot($position,"board"),Let($king,Find($board,Lambda($piece,And(Same(Slot($piece,"side"),$side),Same(Slot($piece,"kind"),King())))),If(Same($king,null),true,ChessAttacked($board,Slot($king,"square"),ChessOther($side),$rules))))`,
);
define(
  "ChessCanLand($board,$square,$side)",
  `Let($target,Occupant($board,$square),Or(Same($target,null),And(BoolNot(Same(Slot($target,"side"),$side)),BoolNot(Same(Slot($target,"kind"),King())))))`,
);
define(
  "ChessMovesTo($piece,$squares)",
  `FlatMap($squares,Lambda($destination,If(And(Same(Slot($piece,"kind"),Pawn()),Same(Slot($destination,1),ChessPromotionRank(Slot($piece,"side")))),Map(List(Queen(),Rook(),Bishop(),Knight()),Lambda($promotion,Build(Move(from=Slot($piece,"square"),to=$destination,promotion=$promotion)))),MakeList(Build(Move(from=Slot($piece,"square"),to=$destination,promotion=null))))))`,
);
define(
  "ChessEpCapture($piece,$position,$square)",
  `And(Same($square,Slot($position,"enPassant")),BoolNot(Same($square,null)),Same(Occupant(Slot($position,"board"),$square),null),Let($victim,Occupant(Slot($position,"board"),GridOffset($square,0,Multiply(-1,ChessForward(Slot($piece,"side"))),8,8)),And(Same(Slot($victim,"kind"),Pawn()),Same(Slot($victim,"side"),ChessOther(Slot($piece,"side"))))))`,
);
define(
  "ChessPawnDestinations($piece,$position,$rules)",
  `Let($board,Slot($position,"board"),Let($square,Slot($piece,"square"),Let($direction,ChessForward(Slot($piece,"side")),Let($one,GridOffset($square,0,$direction,8,8),ConcatLists(If(And(BoolNot(Same($one,null)),Same(Occupant($board,$one),null)),ConcatLists(MakeList($one),If(And(Same(Slot($rules,"pawnDouble"),true),Same(Slot($square,1),ChessPawnHome(Slot($piece,"side"))),Same(Occupant($board,GridOffset($square,0,Multiply(2,$direction),8,8)),null)),MakeList(GridOffset($square,0,Multiply(2,$direction),8,8)),List())),List()),Filter(ChessAttacks($piece,$board,$rules),Lambda($capture,Or(And(BoolNot(Same(Occupant($board,$capture),null)),ChessCanLand($board,$capture,Slot($piece,"side"))),ChessEpCapture($piece,$position,$capture)))))))))`,
);
define(
  "ChessPieceMoves($piece,$position,$rules)",
  `If(Same(Slot($piece,"kind"),Pawn()),ChessMovesTo($piece,ChessPawnDestinations($piece,$position,$rules)),ConcatLists(ChessMovesTo($piece,Filter(ChessAttacks($piece,Slot($position,"board"),$rules),Lambda($square,ChessCanLand(Slot($position,"board"),$square,Slot($piece,"side"))))),If(And(Same(Slot($piece,"kind"),King()),Same(Slot($rules,"castling"),true)),ChessCastleMoves($piece,$position,$rules),List())))`,
);
define(
  "ChessCastleMoves($piece,$position,$rules)",
  `Let($rank,ChessHome(Slot($piece,"side")),If(Same(Slot($piece,"square"),Build(Square(4,$rank))),ConcatLists(ChessCastleWing($piece,$position,$rules,7,6,5,List(5,6)),ChessCastleWing($piece,$position,$rules,0,2,3,List(1,2,3))),List()))`,
);
define(
  "ChessCastleWing($piece,$position,$rules,$rookFile,$destinationFile,$transitFile,$emptyFiles)",
  `Let($rank,ChessHome(Slot($piece,"side")),Let($rookSquare,Build(Square($rookFile,$rank)),Let($rook,Occupant(Slot($position,"board"),$rookSquare),If(And(Any(Slot($position,"rights"),Lambda($right,And(Same(Slot($right,"side"),Slot($piece,"side")),Same(Slot($right,"rook"),$rookSquare)))),Same(Slot($rook,"kind"),Rook()),Same(Slot($rook,"side"),Slot($piece,"side")),All($emptyFiles,Lambda($file,Same(Occupant(Slot($position,"board"),Build(Square($file,$rank))),null))),Or(Same(Slot($rules,"kingSafety"),false),And(BoolNot(ChessCheck($position,Slot($piece,"side"),$rules)),BoolNot(ChessCheck(With($position,"board",BoardChange(Slot($position,"board"),MakeList(Slot($piece,"square")),MakeList(With($piece,"square",Build(Square($transitFile,$rank)))))),Slot($piece,"side"),$rules))))),MakeList(Build(Move(from=Slot($piece,"square"),to=Build(Square($destinationFile,$rank)),promotion=null))),List()))))`,
);
define(
  "ChessLegalMoves($position,$actor,$rules)",
  `If(Same($actor,Slot($position,"turn")),Filter(FlatMap(Filter(Slot($position,"board"),Lambda($piece,Same(Slot($piece,"side"),$actor))),Lambda($piece,ChessPieceMoves($piece,$position,$rules))),Lambda($move,Or(Same(Slot($rules,"kingSafety"),false),BoolNot(ChessCheck(ChessPositionAfter($position,$move,$rules),$actor,$rules))))),List())`,
);

// Transition assumes the caller has checked membership in ChessLegalMoves.
define(
  "ChessPositionAfter($position,$move,$rules)",
  `Let($board,Slot($position,"board"),Let($from,Slot($move,"from"),Let($to,Slot($move,"to"),Let($piece,Occupant($board,$from),Let($pawn,Same(Slot($piece,"kind"),Pawn()),Let($ep,And($pawn,ChessEpCapture($piece,$position,$to)),Let($castle,And(Same(Slot($piece,"kind"),King()),Same(Abs(Subtract(Slot($to,0),Slot($from,0))),2)),Let($newBoard,BoardChange($board,ConcatLists(MakeList($from,$to),If($ep,MakeList(GridOffset($to,0,Multiply(-1,ChessForward(Slot($piece,"side"))),8,8)),List())),MakeList(With(With($piece,"square",$to),"kind",If(And($pawn,BoolNot(Same(Slot($move,"promotion"),null))),Slot($move,"promotion"),Slot($piece,"kind"))))),Build(ChessPosition(board=If($castle,ChessCastleBoard($newBoard,$from,$to),$newBoard),turn=ChessOther(Slot($position,"turn")),rights=Filter(Slot($position,"rights"),Lambda($right,BoolNot(Or(And(Same(Slot($piece,"kind"),King()),Same(Slot($piece,"side"),Slot($right,"side"))),Same($from,Slot($right,"rook")),Same($to,Slot($right,"rook")))))),enPassant=If(And($pawn,Same(Abs(Subtract(Slot($to,1),Slot($from,1))),2)),GridOffset($from,0,ChessForward(Slot($piece,"side")),8,8),null),halfmove=If(Or($pawn,$ep,BoolNot(Same(Occupant($board,$to),null))),0,Add(Slot($position,"halfmove"),1)),fullmove=Add(Slot($position,"fullmove"),If(Same(Slot($position,"turn"),Black()),1,0))))))))))))`,
);
define(
  "ChessCastleBoard($board,$from,$to)",
  `Let($rookSquare,Build(Square(If(GreaterThan(Slot($to,0),Slot($from,0)),7,0),Slot($from,1))),BoardChange($board,MakeList($rookSquare),MakeList(With(Occupant($board,$rookSquare),"square",Build(Square(If(GreaterThan(Slot($to,0),Slot($from,0)),5,3),Slot($from,1)))))))`,
);

define("ChessMaterial(Pawn())", "100");
define("ChessMaterial(Knight())", "320");
define("ChessMaterial(Bishop())", "330");
define("ChessMaterial(Rook())", "500");
define("ChessMaterial(Queen())", "900");
define("ChessMaterial(King())", "0");
define(
  "ChessScore($position,$side,$rules)",
  `Sum(Map(Slot($position,"board"),Lambda($piece,Multiply(If(Same(Slot($piece,"side"),$side),1,-1),Let($kind,Slot($piece,"kind"),ChessMaterial($kind))))))`,
);
define(
  "ChessSquareColor($square)",
  "Modulo(Add(Slot($square,0),Slot($square,1)),2)",
);
// This proves common dead positions. It does not claim to solve arbitrary blocked positions.
define(
  "ChessDeadPosition($position)",
  `Let($pieces,Filter(Slot($position,"board"),Lambda($piece,BoolNot(Same(Slot($piece,"kind"),King())))),Or(Same(Length($pieces),0),And(Same(Length($pieces),1),Or(Same(Slot(At($pieces,0),"kind"),Bishop()),Same(Slot(At($pieces,0),"kind"),Knight()))),And(All($pieces,Lambda($piece,Same(Slot($piece,"kind"),Bishop()))),All($pieces,Lambda($piece,Same(ChessSquareColor(Slot($piece,"square")),ChessSquareColor(Slot(At($pieces,0),"square"))))))))`,
);
// En passant changes repetition identity only when a legal en passant capture exists.
define(
  "ChessRepetitionEp($position,$rules)",
  `If(Same(Slot($position,"enPassant"),null),null,If(Any(Filter(Slot($position,"board"),Lambda($piece,And(Same(Slot($piece,"kind"),Pawn()),Same(Slot($piece,"side"),Slot($position,"turn"))))),Lambda($piece,And(Any(ChessAttacks($piece,Slot($position,"board"),$rules),Lambda($square,Same($square,Slot($position,"enPassant")))),ChessEpCapture($piece,$position,Slot($position,"enPassant")),Or(Same(Slot($rules,"kingSafety"),false),BoolNot(ChessCheck(ChessPositionAfter($position,Build(Move(from=Slot($piece,"square"),to=Slot($position,"enPassant"),promotion=null)),$rules),Slot($position,"turn"),$rules)))))),Slot($position,"enPassant"),null))`,
);
define(
  "ChessSamePosition($left,$right,$rules)",
  `And(Same(Slot($left,"turn"),Slot($right,"turn")),Same(Slot($left,"rights"),Slot($right,"rights")),Same(Length(Slot($left,"board")),Length(Slot($right,"board"))),All(Slot($left,"board"),Lambda($piece,Any(Slot($right,"board"),Lambda($other,Same($piece,$other))))),Same(ChessRepetitionEp($left,$rules),ChessRepetitionEp($right,$rules)))`,
);
define(
  "ChessRepetitionCount($position,$history,$rules)",
  `Add(1,Length(Filter($history,Lambda($prior,ChessSamePosition($position,$prior,$rules)))))`,
);
define(
  "DrawClaimable($position,$history,$rules)",
  `ConcatLists(If(GreaterThan(ChessRepetitionCount($position,$history,$rules),2),List(ThreefoldRepetition()),List()),If(GreaterThan(Slot($position,"halfmove"),99),List(FiftyMoves()),List()))`,
);
define(
  "ChessOutcome($position,$history,$rules)",
  `If(Same(Length(ChessLegalMoves($position,Slot($position,"turn"),$rules)),0),If(ChessCheck($position,Slot($position,"turn"),$rules),Build(Win(ChessOther(Slot($position,"turn")),Checkmate())),Draw(Stalemate())),If(ChessDeadPosition($position),Draw(DeadPosition()),If(GreaterThan(Slot($position,"halfmove"),149),Draw(SeventyFiveMoves()),If(GreaterThan(ChessRepetitionCount($position,$history,$rules),4),Draw(FivefoldRepetition()),Ongoing()))))`,
);

export const chessUnits: readonly ConceptUnit[] = units;
