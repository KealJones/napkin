import { randomUUID } from "node:crypto";
import { application, type Expr } from "../concept/expression.js";
import { createConceptUnit, type ConceptUnit } from "../concept/unit.js";
import { SQLiteConceptStore } from "../store/sqlite-store.js";

export interface ConversationSummary {
  id: string;
  title: string;
  persistent: boolean;
  updatedAt: string;
}

export interface TurnMemory {
  userText: string;
  assistantText: string;
  promptMeaning: Expr | null;
  result: Expr;
  traceIds: string[];
  teacherUsed?: boolean;
  teacherLesson?: Expr | null;
  teacherResponse?: Expr | null;
}

export class ConversationRepository {
  private readonly isolated = new Map<string, ConceptUnit>();

  constructor(private readonly store: SQLiteConceptStore) {}

  create(persistent: boolean): ConversationSummary {
    const id =
      (persistent ? "Conversation_" : "IsolatedConversation_") + randomUUID();
    const createdAt = new Date().toISOString();
    const unit = createConceptUnit({
      identity: id,
      gloss: "New conversation",
      relations: [
        application("ConversationMetadata", [
          {
            name: "mode",
            value: application(persistent ? "Persistent" : "Isolated"),
          },
          {
            name: "createdAt",
            value: application("Timestamp", [{ value: createdAt }]),
          },
        ]),
      ],
      realizations: [],
    });
    if (persistent) this.store.saveConcept(unit);
    else this.isolated.set(id, unit);
    return { id, title: unit.gloss, persistent, updatedAt: createdAt };
  }

  appendTurn(id: string, turn: TurnMemory): ConversationSummary {
    const persistent = id.startsWith("Conversation_");
    const unit = persistent ? this.store.getConcept(id) : this.isolated.get(id);
    if (!unit) throw new Error("Conversation not found: " + id);

    const now = new Date().toISOString();
    if (unit.gloss === "New conversation") {
      unit.gloss = titleFrom(turn.userText);
    }
    unit.relations.push(
      application("Message", [
        { name: "role", value: application("User") },
        { name: "content", value: turn.userText },
        {
          name: "timestamp",
          value: application("Timestamp", [{ value: now }]),
        },
      ]),
      application("Message", [
        { name: "role", value: application("Assistant") },
        { name: "content", value: turn.assistantText },
        { name: "result", value: turn.result },
        {
          name: "timestamp",
          value: application("Timestamp", [{ value: now }]),
        },
      ]),
      application("TeacherUsage", [
        { name: "used", value: turn.teacherUsed === true },
        ...(turn.teacherLesson == null
          ? []
          : [{ name: "lesson", value: turn.teacherLesson }]),
        ...(turn.teacherResponse == null
          ? []
          : [{ name: "response", value: turn.teacherResponse }]),
      ]),
    );
    if (turn.promptMeaning !== null) {
      unit.relations.push(
        application("InterpretedAs", [{ value: turn.promptMeaning }]),
      );
    }

    const saved = persistent ? this.store.saveConcept(unit) : unit;
    if (!persistent) this.isolated.set(id, saved);
    return {
      id,
      title: saved.gloss,
      persistent,
      updatedAt: saved.updatedAt ?? now,
    };
  }

  get(id: string): ConceptUnit | undefined {
    return this.isolated.get(id) ?? this.store.getConcept(id);
  }

  listPersistent(): ConversationSummary[] {
    return this.store
      .listConcepts()
      .filter((unit) => unit.identity.startsWith("Conversation_"))
      .map((unit) => ({
        id: unit.identity,
        title: unit.gloss,
        persistent: true,
        updatedAt: unit.updatedAt ?? "",
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  listActive(): ConversationSummary[] {
    const isolated = [...this.isolated.entries()].map(([id, unit]) => ({
      id,
      title: unit.gloss,
      persistent: false,
      updatedAt: unit.updatedAt ?? "",
    }));
    return [...this.listPersistent(), ...isolated].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  closeIsolated(id: string): boolean {
    if (!id.startsWith("IsolatedConversation_")) return false;
    return this.isolated.delete(id);
  }
}

function titleFrom(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 64) return compact || "Conversation";
  return compact.slice(0, 61) + "...";
}
