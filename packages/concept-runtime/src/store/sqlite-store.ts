import type { DatabaseSync } from "node:sqlite";
import { validateConceptUnit, type ConceptUnit } from "../concept/unit.js";
import type { EvaluationTrace, TraceEvent } from "../runtime/trace.js";

export class SQLiteConceptStore {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec(
      "PRAGMA foreign_keys = ON;" +
        "CREATE TABLE IF NOT EXISTS concepts (" +
        "identity TEXT PRIMARY KEY, gloss TEXT NOT NULL, relations_json TEXT NOT NULL, " +
        "realizations_json TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;" +
        "CREATE TABLE IF NOT EXISTS traces (" +
        "trace_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT) STRICT;" +
        "CREATE TABLE IF NOT EXISTS trace_events (" +
        "event_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE, " +
        "sequence INTEGER NOT NULL, event_json TEXT NOT NULL, UNIQUE(trace_id, sequence)) STRICT;" +
        "CREATE INDEX IF NOT EXISTS trace_events_by_trace ON trace_events(trace_id, sequence);" +
        "CREATE TABLE IF NOT EXISTS seed_snapshots (" +
        "identity TEXT PRIMARY KEY, unit_json TEXT NOT NULL) STRICT;",
    );
    this.database.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(identity, gloss, relations_json);",
    );
    const indexSchema = this.database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'concepts_fts'",
      )
      .get() as { sql?: string } | undefined;
    if (indexSchema?.sql?.includes("identity UNINDEXED")) {
      this.database.exec(
        "DROP TABLE concepts_fts; " +
          "CREATE VIRTUAL TABLE concepts_fts USING fts5(identity, gloss, relations_json);",
      );
    }
    this.rebuildConceptIndex();
  }

  saveConcept(unit: ConceptUnit): ConceptUnit {
    validateConceptUnit(unit);
    const updatedAt = unit.updatedAt ?? new Date().toISOString();
    const saved: ConceptUnit = {
      ...structuredClone(unit),
      updatedAt,
    };
    this.database
      .prepare(
        "INSERT INTO concepts(identity, gloss, relations_json, realizations_json, updated_at) " +
          "VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(identity) DO UPDATE SET gloss = excluded.gloss, " +
          "relations_json = excluded.relations_json, realizations_json = excluded.realizations_json, " +
          "updated_at = excluded.updated_at",
      )
      .run(
        saved.identity,
        saved.gloss,
        JSON.stringify(saved.relations),
        JSON.stringify(saved.realizations),
        updatedAt,
      );
    this.database
      .prepare("DELETE FROM concepts_fts WHERE identity = ?")
      .run(saved.identity);
    this.database
      .prepare(
        "INSERT INTO concepts_fts(identity, gloss, relations_json) VALUES (?, ?, ?)",
      )
      .run(saved.identity, saved.gloss, JSON.stringify(saved.relations));
    return saved;
  }

  getConcept(identity: string): ConceptUnit | undefined {
    const row = this.database
      .prepare(
        "SELECT identity, gloss, relations_json, realizations_json, updated_at FROM concepts WHERE identity = ?",
      )
      .get(identity) as
      | {
          identity: string;
          gloss: string;
          relations_json: string;
          realizations_json: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return undefined;

    const unit: ConceptUnit = {
      identity: row.identity,
      gloss: row.gloss,
      relations: JSON.parse(row.relations_json) as ConceptUnit["relations"],
      realizations: JSON.parse(
        row.realizations_json,
      ) as ConceptUnit["realizations"],
      updatedAt: row.updated_at,
    };
    validateConceptUnit(unit);
    return unit;
  }

  listConcepts(): ConceptUnit[] {
    const rows = this.database
      .prepare("SELECT identity FROM concepts ORDER BY identity")
      .all() as Array<{ identity: string }>;
    return rows.map((row) => {
      const concept = this.getConcept(row.identity);
      if (!concept) throw new Error("Concept disappeared during list");
      return concept;
    });
  }

  getSeedSnapshot(identity: string): ConceptUnit | undefined {
    const row = this.database
      .prepare("SELECT unit_json FROM seed_snapshots WHERE identity = ?")
      .get(identity) as { unit_json: string } | undefined;
    return row ? (JSON.parse(row.unit_json) as ConceptUnit) : undefined;
  }

  saveSeedSnapshot(unit: ConceptUnit): void {
    const snapshot = { ...structuredClone(unit) };
    delete snapshot.updatedAt;
    this.database
      .prepare(
        "INSERT INTO seed_snapshots(identity, unit_json) VALUES (?, ?) " +
          "ON CONFLICT(identity) DO UPDATE SET unit_json = excluded.unit_json",
      )
      .run(unit.identity, JSON.stringify(snapshot));
  }

  searchConcepts(query: string, limit = 10): ConceptUnit[] {
    const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (terms.length === 0) return [];
    const matchExpression = terms
      .map((term) => '"' + term.replaceAll('"', '""') + '"*')
      .join(" OR ");
    const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = this.database
      .prepare(
        "SELECT identity FROM concepts_fts WHERE concepts_fts MATCH ? ORDER BY rank LIMIT ?",
      )
      .all(matchExpression, boundedLimit) as Array<{ identity: string }>;
    return rows.flatMap((row) => {
      const concept = this.getConcept(row.identity);
      return concept ? [concept] : [];
    });
  }

  deleteConcept(identity: string): boolean {
    this.database
      .prepare("DELETE FROM concepts_fts WHERE identity = ?")
      .run(identity);
    const result = this.database
      .prepare("DELETE FROM concepts WHERE identity = ?")
      .run(identity);
    return Number(result.changes) > 0;
  }

  beginTrace(traceId: string, startedAt: string): void {
    this.database
      .prepare("INSERT INTO traces(trace_id, started_at) VALUES (?, ?)")
      .run(traceId, startedAt);
  }

  finishTrace(trace: EvaluationTrace): void {
    this.database
      .prepare("UPDATE traces SET ended_at = ? WHERE trace_id = ?")
      .run(trace.endedAt, trace.traceId);
  }

  saveTraceEvent(event: TraceEvent): void {
    this.database
      .prepare(
        "INSERT INTO trace_events(event_id, trace_id, sequence, event_json) " +
          "VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(event_id) DO UPDATE SET event_json = excluded.event_json",
      )
      .run(event.id, event.traceId, event.sequence, JSON.stringify(event));
  }

  getTraceEvents(traceId: string): TraceEvent[] {
    const rows = this.database
      .prepare(
        "SELECT event_json FROM trace_events WHERE trace_id = ? ORDER BY sequence",
      )
      .all(traceId) as Array<{ event_json: string }>;
    return rows.map((row) => JSON.parse(row.event_json) as TraceEvent);
  }

  listTraces(limit = 100): Array<{
    traceId: string;
    startedAt: string;
    endedAt: string | null;
    eventCount: number;
  }> {
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    return this.database
      .prepare(
        "SELECT traces.trace_id AS traceId, traces.started_at AS startedAt, " +
          "traces.ended_at AS endedAt, COUNT(trace_events.event_id) AS eventCount " +
          "FROM traces LEFT JOIN trace_events ON trace_events.trace_id = traces.trace_id " +
          "GROUP BY traces.trace_id ORDER BY traces.started_at DESC LIMIT ?",
      )
      .all(boundedLimit) as Array<{
      traceId: string;
      startedAt: string;
      endedAt: string | null;
      eventCount: number;
    }>;
  }

  getConceptUsage(identity: string): {
    events: number;
    lastUsedAt: string | null;
  } {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS events, MAX(json_extract(event_json, '$.startedAt')) AS lastUsedAt " +
          "FROM trace_events WHERE json_extract(event_json, '$.concept') = ?",
      )
      .get(identity) as { events: number; lastUsedAt: string | null };
    return { events: row.events, lastUsedAt: row.lastUsedAt };
  }

  close(): void {
    this.database.close();
  }

  private rebuildConceptIndex(): void {
    this.database.exec("DELETE FROM concepts_fts;");
    this.database.exec(
      "INSERT INTO concepts_fts(identity, gloss, relations_json) " +
        "SELECT identity, gloss, relations_json FROM concepts;",
    );
  }
}
