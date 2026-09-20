/**
 * Conversations are Concepts (concept-spec Part 14).
 *
 * Each holds the original message, the parse, and the result, so the record of a
 * conversation is the same kind of thing as everything else and is searchable and
 * traversable the same way. Memory is not "resend the transcript": it is lookup, and only
 * when a parse says a reference needs resolving.
 */
import { type Expr, c, call, format, isCall } from "../concept/expression.js";
import { claims, concept } from "../concept/unit.js";
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
   * A turn is a relation on the conversation Concept, holding what was said, how it was
   * parsed, and what came back.
   */
  record(id: string, turn: { message: string; parsed?: string; result?: string }): void {
    if (!this.store.has(id)) this.store.seed(concept(id, { relations: [c("IsA", c("Conversation"))] }));
    this.store.addRelation(
      id,
      call("HasTurn", [
        { name: "at", value: new Date().toISOString() },
        { name: "message", value: turn.message },
        { name: "parsed", value: turn.parsed ?? "" },
        { name: "result", value: turn.result ?? "" },
      ]),
    );
  }

  turns(id: string): Turn[] {
    const unit = this.store.get(id);
    const out: Turn[] = [];
    for (const { claim: relation } of unit?.relations ?? []) {
      if (!isCall(relation) || relation.head !== "HasTurn") continue;
      const field = (name: string): string => {
        const found = relation.args.find((a) => a.name === name)?.value;
        return typeof found === "string" ? found : "";
      };
      out.push({ at: field("at"), message: field("message"), parsed: field("parsed"), result: field("result") });
    }
    return out;
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
  readonly parsed: string;
  readonly result: string;
}

const startedAt = (relations: readonly Expr[]): string | undefined => {
  for (const r of relations) {
    if (isCall(r) && r.head === "StartedAt") {
      const value = r.args[0]?.value;
      if (typeof value === "string") return value;
    }
  }
  return undefined;
};
