/**
 * Durable knowledge (concept-spec Part 13).
 *
 * Learning something and remembering it are the same act: a learned Concept persists by
 * being a unit in the graph. So the graph is the only durable knowledge mechanism, and it
 * has to survive a restart or the system cannot actually grow.
 *
 * Stored as readable JSON rather than an opaque format, because a Concept graph you cannot
 * inspect by hand is one you cannot debug.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Expr, format, parse } from "../concept/expression.js";
import type { ConceptUnit, Realization, Relation, Stamp } from "../concept/unit.js";
import { ConceptStore } from "./store.js";

interface StoredRealization {
  pattern: string;
  context?: string;
  body: string;
  properties?: string[];
  evaluateArguments?: boolean;
  evaluateResult?: boolean;
  resultContext?: string;
  retired?: boolean;
  addedAt?: string;
  seededFrom?: string;
}

/**
 * A bare string is a relation from before contexts and stamps existed, and still loads
 * unchanged. Everything written now uses the object form, because the stamps are the
 * record of when it was taken in and what caused it (memory-spec Part 4.2), and
 * dropping them on save would make that history last one process.
 */
type StoredRelation = string | { claim: string; context?: string; stamps?: string[] };

/**
 * A stamp is written the way memory-spec writes one, `#42 2026-09-22T14:05:00.000Z from #41`:
 * one readable line rather than a nested object per assertion, which more than doubled the
 * size of the graph.
 */
const stampText = (s: Stamp): string =>
  `#${s.seq} ${s.recordedAt}${s.source === undefined ? "" : ` from #${s.source}`}${s.pack === undefined ? "" : ` pack ${s.pack}`}`;

const STAMP = /^#(\d+) (\S+)(?: from #(\d+))?(?: pack (\S+))?$/;

const readStamp = (text: string): Stamp => {
  const m = STAMP.exec(text);
  if (!m) throw new Error(`Unreadable stamp: ${text}`);
  return {
    seq: Number(m[1]),
    recordedAt: m[2],
    ...(m[3] === undefined ? {} : { source: Number(m[3]) }),
    ...(m[4] === undefined ? {} : { pack: m[4] }),
  };
};

interface StoredUnit {
  identity: string;
  relations: StoredRelation[];
  realizations: StoredRealization[];
  updatedAt?: string;
}

interface Snapshot {
  version: 1;
  savedAt: string;
  /** The next `seq`, so a restart never hands one out twice. Absent in older graphs. */
  sequence?: number;
  units: StoredUnit[];
}

const storeRelation = (r: Relation): StoredRelation => ({
  claim: format(r.claim),
  ...(r.context === undefined ? {} : { context: format(r.context) }),
  ...(r.stamps?.length ? { stamps: r.stamps.map(stampText) } : {}),
});

const loadRelation = (r: StoredRelation): Relation =>
  typeof r === "string"
    ? { claim: parse(r) }
    : {
        claim: parse(r.claim),
        ...(r.context === undefined ? {} : { context: parse(r.context) }),
        ...(r.stamps?.length ? { stamps: r.stamps.map(readStamp) } : {}),
      };

const toStored = (u: ConceptUnit): StoredUnit => ({
  identity: u.identity,
  relations: u.relations.map(storeRelation),
  realizations: u.realizations.map((r) => ({
    pattern: format(r.pattern),
    context: r.context === undefined ? undefined : format(r.context),
    body: format(r.body),
    properties: r.properties.length ? r.properties.map(format) : undefined,
    evaluateArguments: r.evaluateArguments === true ? undefined : r.evaluateArguments,
    evaluateResult: r.evaluateResult === false ? undefined : r.evaluateResult,
    resultContext: r.resultContext === undefined ? undefined : format(r.resultContext),
    retired: r.retired,
    addedAt: r.addedAt,
    seededFrom: r.seededFrom,
  })),
  updatedAt: u.updatedAt,
});

/**
 * One relation that does not parse is skipped and reported, not a graph that will not load:
 * `DistinctFrom(3())`, written by an import before names were checked, made every Concept
 * unreachable. The rest of the unit still loads.
 */
const unreadable: string[] = [];
const readable = (identity: string) => (r: StoredRelation): Relation[] => {
  try {
    return [loadRelation(r)];
  } catch {
    unreadable.push(`${identity}: ${typeof r === "string" ? r : r.claim}`);
    return [];
  }
};

const fromStored = (s: StoredUnit): ConceptUnit => ({
  identity: s.identity,
  relations: s.relations.flatMap(readable(s.identity)),
  realizations: s.realizations.map(
    (r): Realization => ({
      pattern: parse(r.pattern),
      context: r.context === undefined ? undefined : parse(r.context),
      body: parse(r.body),
      properties: (r.properties ?? []).map(parse),
      evaluateArguments: r.evaluateArguments ?? true,
      evaluateResult: r.evaluateResult ?? false,
      resultContext: r.resultContext === undefined ? undefined : parse(r.resultContext),
      retired: r.retired,
      addedAt: r.addedAt,
      ...(r.seededFrom === undefined ? {} : { seededFrom: r.seededFrom }),
    }),
  ),
  updatedAt: s.updatedAt,
});

export function save(store: ConceptStore, path: string): number {
  const snapshot: Snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    sequence: store.sequence,
    units: store.all().map(toStored),
  };
  mkdirSync(dirname(path), { recursive: true });
  // Write and rename, so an interrupted save cannot leave a truncated graph behind.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(snapshot, null, 2), "utf8");
  renameSync(temporary, path);
  return snapshot.units.length;
}

export function load(store: ConceptStore, path: string): number {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return 0;
  }
  const snapshot = JSON.parse(text) as Snapshot;
  if (snapshot.version !== 1) throw new Error(`Unknown graph version ${snapshot.version}`);
  let loaded = 0;
  for (const unit of snapshot.units) {
    // Loading is seeding: additive and idempotent, so a snapshot never clobbers what is
    // already held in memory.
    store.seed(fromStored(unit));
    loaded += 1;
  }
  if (snapshot.sequence !== undefined) store.resume(snapshot.sequence);
  if (unreadable.length) {
    console.warn(`Skipped ${unreadable.length} unreadable relation(s) in ${path}:\n  ${unreadable.splice(0).join("\n  ")}`);
  }
  return loaded;
}

/** Round-trip check: every unit must survive format-then-parse unchanged. */
export function verifyRoundTrip(store: ConceptStore): string[] {
  const problems: string[] = [];
  for (const unit of store.all()) {
    const back = fromStored(toStored(unit));
    if (back.relations.length !== unit.relations.length) problems.push(`${unit.identity}: relations lost`);
    if (back.realizations.length !== unit.realizations.length) problems.push(`${unit.identity}: realizations lost`);
    for (const [i, r] of unit.relations.entries()) {
      if ((r.stamps?.length ?? 0) !== (back.relations[i].stamps?.length ?? 0)) problems.push(`${unit.identity}: stamps ${i} lost`);
    }
    for (const [i, r] of unit.realizations.entries()) {
      if (format(r.body) !== format(back.realizations[i].body)) problems.push(`${unit.identity}: body ${i} differs`);
    }
  }
  return problems;
}
