/**
 * Conversations are Concepts (concept-spec Part 14).
 *
 * A conversation is an index over what was said, not a container of everything that
 * happened (memory-spec Part 5.1). Every message is a `Said(speaker, content, text=)`
 * relation on it: the speaker first, the parse as an expression so it can be found by
 * what it names, and the verbatim words, since a parse can be wrong and the words are the
 * only thing a later re-read can start from (Part 5.2). The reply is `Said(Self(), ...)`,
 * sourced from the stamp of the message it answers.
 *
 * Memory is not "resend the transcript": it is lookup, and only when a parse says a
 * reference needs resolving.
 */
import { type Expr, c, call, format, isCall, named } from "../concept/expression.js";
import { claims, concept, type Stamp } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";

export interface ConversationSummary {
  readonly id: string;
  readonly persistent: boolean;
  readonly startedAt: string;
  readonly turns: number;
  readonly lastMessage?: string;
}

const PREFIX = "Conversation_";
const ISOLATED = "IsolatedConversation_";

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

export class ConversationRepository {
  constructor(private readonly store: ConceptStore) {}

  create(persistent = true): ConversationSummary {
    const id = `${persistent ? PREFIX : ISOLATED}${stamp()}`;
    this.store.seed(
      concept(id, {
        relations: [
          c("IsA", c("Conversation")),
          call("StartedAt", [{ value: new Date().toISOString() }]),
          persistent ? c("Persistent") : c("Isolated"),
        ],
      }),
    );
    return { id, persistent, startedAt: new Date().toISOString(), turns: 0 };
  }

  get(id: string): { identity: string; relations: string[]; turns: Turn[] } | undefined {
    const unit = this.store.get(id);
    if (!unit) return undefined;
    return {
      identity: unit.identity,
      relations: claims(unit).map(format),
      turns: this.turns(id),
    };
  }

  /**
   * A message has arrived. Its stamp is taken now, before it is read, so everything reading
   * it causes (the trace, anything learned) can point at it. Pass it to `record`.
   */
  receive(): Stamp {
    return this.store.reserve();
  }

  /**
   * One exchange: what the user said, and what came back, sourced from it.
   *
   * `parsed` is the reading as an expression. With no reading the words stand in for it,
   * so an unreadable message is still recorded as said.
   */
  record(
    id: string,
    turn: { message: string; parsed?: Expr; result?: Expr | string; spoken?: string; heard?: Stamp },
  ): { said: Stamp; reply: Stamp } {
    if (!this.store.has(id)) this.store.seed(concept(id, { relations: [c("IsA", c("Conversation"))] }));
    const said = this.store.addRelation(id, saidBy("Me", turn.parsed ?? turn.message, turn.message), undefined, turn.heard);
    const reply = this.store.addRelation(
      id,
      saidBy("Self", turn.result ?? "", turn.spoken ?? ""),
      undefined,
      said.seq,
    );
    return { said, reply };
  }

  /**
   * The exchanges, in the order they happened.
   *
   * A relation said twice holds two stamps (memory-spec Part 4.3), so this reads
   * (relation, stamp) pairs in `seq` order, not relations. A reply belongs to the message
   * its stamp is sourced from.
   */
  turns(id: string): Turn[] {
    const unit = this.store.get(id);
    const said: { seq: number; at: string; speaker: string; content: Expr; text: string; source?: number }[] = [];
    const legacy: { seq: number; turn: Turn }[] = [];
    for (const { claim, stamps = [] } of unit?.relations ?? []) {
      if (!isCall(claim)) continue;
      if (claim.head === "HasTurn") {
        legacy.push({ seq: stamps[0]?.seq ?? 0, turn: hasTurn(claim) });
        continue;
      }
      if (claim.head !== "Said") continue;
      const speaker = claim.args[0]?.value;
      const content = claim.args[1]?.value;
      const text = named(claim, "text");
      if (!isCall(speaker) || content === undefined) continue;
      for (const stamp of stamps) {
        said.push({
          seq: stamp.seq,
          at: stamp.recordedAt,
          speaker: speaker.head,
          content,
          text: typeof text === "string" ? text : "",
          ...(stamp.source === undefined ? {} : { source: stamp.source }),
        });
      }
    }
    const replies = new Map(said.filter((s) => s.speaker === "Self" && s.source !== undefined).map((s) => [s.source!, s]));
    const out = [
      ...legacy,
      ...said
        .filter((s) => s.speaker !== "Self")
        .map((s) => {
          const reply = replies.get(s.seq);
          return {
            seq: s.seq,
            turn: {
              at: s.at,
              message: s.text,
              // Words standing in for a reading were never parsed.
              parsed: typeof s.content === "string" ? "" : format(s.content),
              result: reply === undefined ? "" : typeof reply.content === "string" ? reply.content : format(reply.content),
              spoken: reply?.text ?? "",
            },
          };
        }),
    ];
    return out.sort((a, b) => a.seq - b.seq).map((x) => x.turn);
  }

  listActive(): ConversationSummary[] {
    return this.store
      .all()
      .filter((u) => u.identity.startsWith(PREFIX) || u.identity.startsWith(ISOLATED))
      .map((u) => {
        const turns = this.turns(u.identity);
        return {
          id: u.identity,
          persistent: u.identity.startsWith(PREFIX),
          startedAt: startedAt(claims(u)) ?? "",
          turns: turns.length,
          lastMessage: turns[turns.length - 1]?.message,
        };
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * Isolation is a choice about saving the conversation, not a separate network: an
   * isolated conversation may read global memory and may change shared Concepts, and only
   * its own transcript is discarded.
   */
  closeIsolated(id: string): boolean {
    if (!id.startsWith(ISOLATED) || !this.store.has(id)) return false;
    this.store.forgetConcept(id);
    return true;
  }

  /** Relevant prior messages, found rather than resent. */
  search(query: string, limit = 5): { id: string; turn: Turn }[] {
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    const hits: { id: string; turn: Turn; score: number }[] = [];
    for (const summary of this.listActive()) {
      for (const turn of this.turns(summary.id)) {
        const text = `${turn.message} ${turn.result}`.toLowerCase();
        const score = terms.filter((t) => text.includes(t)).length;
        if (score) hits.push({ id: summary.id, turn, score });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ id, turn }) => ({ id, turn }));
  }
}

export interface Turn {
  readonly at: string;
  readonly message: string;
  readonly spoken?: string;
  readonly parsed: string;
  readonly result: string;
}

const saidBy = (speaker: string, content: Expr, text: string): Expr =>
  call("Said", [{ value: c(speaker) }, { value: content }, { name: "text", value: text }]);

/** A turn written before `Said`, when one relation held the whole exchange as strings. */
const hasTurn = (relation: Expr): Turn => {
  const field = (name: string): string => {
    const found = named(relation, name);
    return typeof found === "string" ? found : "";
  };
  return {
    at: field("at"),
    message: field("message"),
    parsed: field("parsed"),
    result: field("result"),
    spoken: field("spoken"),
  };
};

const startedAt = (relations: readonly Expr[]): string | undefined => {
  for (const r of relations) {
    if (isCall(r) && r.head === "StartedAt") {
      const value = r.args[0]?.value;
      if (typeof value === "string") return value;
    }
  }
  return undefined;
};
