/**
 * The Teacher (concept-spec Part 12.1).
 *
 * It is a Concept whose realization calls a larger model, reached only when the cheaper
 * paths fail. The model is a realization detail and swapping it must not require touching
 * host code. Its output is ordinary Concepts, subject to everything else in the design.
 *
 * It is given a lookup rather than the whole library, because a retrieved subset injected
 * up front invites the conclusion that anything absent does not exist, and a retrieval
 * miss is indistinguishable from a genuine absence.
 */
import { type Call, type Expr, call, format, isCall } from "../concept/expression.js";
import { lift } from "../ears/lift.js";
import { generate, type ModelOptions } from "../ears/ollama.js";
import { Relations } from "../store/relations.js";
import type { ConceptStore } from "../store/store.js";

export const TEACHER_MODEL = "qwen3.8:27b";

const SYSTEM = `You teach a Concept network. You are given one identity it does not know,
and the message that needed it. Return one declaration and nothing else.

FORM
Concept(identity="Name", relations=List(...), realizations=List(...))

A realization is how it behaves, written as:
  Realization(pattern=Name($x), body=SomethingElse($x))

A relation is a fact about the Concept, written as a Concept call:
  IsA(BoardGame())        MinimumNumberOfPlayers(2)        SynonymOf(Multiply())
  InverseOf(IsYoungerThan())    Symmetric()    Transitive()

RULES
1. Every name starts with a capital letter and is followed by parentheses.
   Write BoardGame(), never board_game or "board game".
2. Prefer relations. Most Concepts are not computations; what a thing IS lives in its
   relations. Give at least one IsA(...) where one is true.
3. If the Concept is a RELATION, say whether it is Symmetric(), Transitive(),
   Asymmetric(), and what its InverseOf(...) is. Each of those licenses inference over
   every future use, so a relation taught without them is inert in one direction.
4. If the Concept CAN be expressed using Concepts that already exist, give it a
   realization that composes them. Relations say what a thing is; they never say how to do
   it, so a Concept taught with relations alone can be described but never computed.
     Tomorrow      -> Realization(pattern=Tomorrow(), body=DayAfter(Today()))
     Double        -> Realization(pattern=Double($x), body=Multiply($x, 2))
   Use realizations=List() only when the Concept genuinely computes nothing, as with an
   entity such as Chess. Never invent a computation you cannot justify, and never name a
   Concept in a body that does not already exist.
7. A body must REDUCE. It may never lead back to the Concept it defines, directly or by a
   detour, because a realization that reaches itself can never finish.
     Choose -> Realization(pattern=Choose($a, $b), body=Select($a, $b))   WRONG if Select
     is then realized as Choose: the pair is inert in both directions.
   Renaming is not realizing. If all you can say is that two names mean the same thing,
   say it as a relation -- SynonymOf(Other()) -- and leave realizations=List().
5. Reuse an existing Concept where one fits, rather than coining a near-duplicate.
6. If EVIDENCE is given, ground the relations in it. Prefer what the evidence says over
   what you recall. If the evidence describes something other than what was asked, say so
   by returning relations you can actually support and nothing more.

Output only the declaration. No prose, no markdown, no code fence.`;

/** Teaching behaviour rather than identity: what is missing is a realization. */
const BEHAVIOUR_SYSTEM = `You teach a Concept network how to DO something.

A Concept it already knows was called in a way nothing realizes. Give it a realization.
Return one declaration and nothing else.

FORM
Concept(identity="Name", relations=List(), realizations=List(
  Realization(pattern=Name($a, $b), body=SomethingElse($a, $b))
))

RULES
1. The pattern must match the call you were shown, with variables where the arguments go.
2. The body must compose Concepts THAT ALREADY EXIST. You are given the ones nearby; if
   you cannot build it from those, return realizations=List() rather than inventing a name.
3. Never write Code(...). You cannot write executable bodies, only compositions.
   The body must REDUCE: it may never name the Concept you are realizing, and it may not
   name one that leads back to it. A body that reaches itself never finishes.
   If the only body you can write is a rename, write realizations=List() instead and say
   the sameness as a relation.
4. Add context=Execution() when the realization does something, and leave context off when
   it holds in any situation.
5. Every name starts with a capital letter and is followed by parentheses.

Output only the declaration. No prose, no markdown, no code fence.`;

export interface TeachRequest {
  readonly identity: string;
  readonly message: string;
  readonly expression: string;
  /** Source-attributed research, so the Teacher grounds rather than invents. */
  readonly evidence?: string;
  /**
   * The call that went unrealized. When present, the Concept already exists and what is
   * missing is behaviour for this shape — a realization, not a definition.
   */
  readonly unrealizedCall?: string;
  /** What the graph can already do with this Concept, so a new realization fits. */
  readonly existing?: string;
}

export interface TeachResult {
  readonly identity: string;
  readonly raw: string;
  readonly declaration: Expr | undefined;
  readonly problem?: string;
}

/** What the graph already knows nearby, so the Teacher can reuse rather than coin. */
export function nearby(store: ConceptStore, identity: string, limit = 24): string {
  const relations = new Relations(store);
  const cluster = relations.cluster(identity).map((x) => x.identity);
  const lexical = store
    .all()
    .map((u) => u.identity)
    .filter((id) => id.toLowerCase().includes(identity.toLowerCase().slice(0, 4)))
    .slice(0, 8);
  const known = [...new Set([...cluster, ...lexical])].slice(0, limit);
  return known.length ? `Concepts that already exist nearby: ${known.join(", ")}` : "";
}

/**
 * The line form means a Teacher can answer with the Concept on one line and its
 * realizations on the next, which is a correct answer in the wrong shape. Folding the
 * siblings in is mechanical, so rejecting the whole reply over layout threw away work the
 * model had actually done.
 */
export function declarationFrom(lifted: Expr | undefined): Call | undefined {
  if (!lifted || !isCall(lifted)) return undefined;
  if (lifted.head === "Concept") return lifted;
  if (lifted.head !== "Sequence") return undefined;

  const clauses = lifted.args.map((a) => a.value);
  const head = clauses.find((x): x is Call => isCall(x) && x.head === "Concept");
  if (!head) return undefined;
  const loose = clauses.filter((x): x is Call => isCall(x) && x.head === "Realization");
  if (!loose.length) return head;

  const existing = head.args.find((a) => a.name === "realizations")?.value;
  const already =
    existing !== undefined && isCall(existing) && existing.head === "List"
      ? existing.args.map((a) => a.value)
      : [];
  const merged = call("List", [...already, ...loose].map((value) => ({ value })));
  return call("Concept", [
    ...head.args.filter((a) => a.name !== "realizations"),
    { name: "realizations", value: merged },
  ]);
}

export async function teach(
  store: ConceptStore,
  request: TeachRequest,
  options: ModelOptions = {},
): Promise<TeachResult> {
  const teachingBehaviour = request.unrealizedCall !== undefined;
  const prompt = [
    `The message was: ${request.message}`,
    `It parsed to: ${request.expression}`,
    teachingBehaviour
      ? `${request.identity} exists, but nothing realizes this call:\n  ${request.unrealizedCall}`
      : `The network does not know: ${request.identity}`,
    request.existing ? `${request.identity} can already do:\n${request.existing}` : "",
    nearby(store, request.identity),
    request.evidence ? `EVIDENCE\n${request.evidence}` : "",
    teachingBehaviour
      ? `Give ${request.identity} a realization that handles that call, composed from ` +
        `Concepts that already exist. Keep every relation it already has.`
      : `Teach ${request.identity}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // There are two models and only two: the Ears parse, the Teacher teaches. `options`
  // carries the Ears model, and spreading it last silently demoted the Teacher to it.
  // The endpoint and timeout are shared; the model is not.
  const { model: _ears, ...shared } = options;
  const raw = await generate(
    teachingBehaviour ? BEHAVIOUR_SYSTEM : SYSTEM,
    prompt,
    { maxTokens: 1024, ...shared, model: TEACHER_MODEL },
  );
  const declaration = declarationFrom(lift(raw).expression);

  if (!declaration) {
    return {
      identity: request.identity,
      raw,
      declaration: undefined,
      problem: `expected a Concept(...) declaration, got ${
        lift(raw).expression ? format(lift(raw).expression as Expr) : "nothing parseable"
      }`,
    };
  }
  return { identity: request.identity, raw, declaration };
}
