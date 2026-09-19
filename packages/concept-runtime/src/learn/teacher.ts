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
import { type Expr, format, isCall, parse } from "../concept/expression.js";
import { lift } from "../ears/lift.js";
import { generate, type ModelOptions } from "../ears/ollama.js";
import { Relations } from "../store/relations.js";
import type { ConceptStore } from "../store/store.js";

export const TEACHER_MODEL = "qwen3.8:27b";

const SYSTEM = `You teach a Concept network. You are given one identity it does not know,
and the message that needed it. Return one declaration and nothing else.

FORM
Concept(identity="Name", relations=List(...), realizations=List(...))

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
4. Use realizations=List() when the Concept computes nothing. Never invent a computation
   you cannot justify.
5. Reuse an existing Concept where one fits, rather than coining a near-duplicate.

Output only the declaration. No prose, no markdown, no code fence.`;

export interface TeachRequest {
  readonly identity: string;
  readonly message: string;
  readonly expression: string;
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

export async function teach(
  store: ConceptStore,
  request: TeachRequest,
  options: ModelOptions = {},
): Promise<TeachResult> {
  const prompt = [
    `The message was: ${request.message}`,
    `It parsed to: ${request.expression}`,
    `The network does not know: ${request.identity}`,
    nearby(store, request.identity),
    `Teach ${request.identity}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await generate(SYSTEM, prompt, { model: TEACHER_MODEL, maxTokens: 1024, ...options });
  const lifted = lift(raw);
  const declaration = lifted.expression;

  if (!declaration || !isCall(declaration) || declaration.head !== "Concept") {
    return {
      identity: request.identity,
      raw,
      declaration: undefined,
      problem: `expected a Concept(...) declaration, got ${declaration ? format(declaration) : "nothing parseable"}`,
    };
  }
  return { identity: request.identity, raw, declaration };
}
