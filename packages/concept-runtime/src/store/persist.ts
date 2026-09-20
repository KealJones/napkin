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
import type { ConceptUnit, Realization } from "../concept/unit.js";
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
}

/**
 * A relation with no context is stored as the bare string it always was, so every graph
 * written before contexts existed loads unchanged and means the same thing. Only a
 * contextual one needs the object form.
 */
type StoredRelation = string | { claim: string; context: string };

interface StoredUnit {
  identity: string;
  relations: StoredRelation[];
  realizations: StoredRealization[];
  updatedAt?: string;
}

interface Snapshot {
  version: 1;
  savedAt: string;
  units: StoredUnit[];
}

const toStored = (u: ConceptUnit): StoredUnit => ({
  identity: u.identity,
  relations: u.relations.map((r) =>
    r.context === undefined ? format(r.claim) : { claim: format(r.claim), context: format(r.context) },
  ),
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
  })),
  updatedAt: u.updatedAt,
});

const fromStored = (s: StoredUnit): ConceptUnit => ({
  identity: s.identity,
  relations: s.relations.map((r) =>
    typeof r === "string" ? { claim: parse(r) } : { claim: parse(r.claim), context: parse(r.context) },
  ),
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
    }),
  ),
  updatedAt: s.updatedAt,
});

export function save(store: ConceptStore, path: string): number {
  const snapshot: Snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
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
  return loaded;
}

/** Round-trip check: every unit must survive format-then-parse unchanged. */
export function verifyRoundTrip(store: ConceptStore): string[] {
  const problems: string[] = [];
  for (const unit of store.all()) {
    const back = fromStored(toStored(unit));
    if (back.relations.length !== unit.relations.length) problems.push(`${unit.identity}: relations lost`);
    if (back.realizations.length !== unit.realizations.length) problems.push(`${unit.identity}: realizations lost`);
    for (const [i, r] of unit.realizations.entries()) {
      if (format(r.body) !== format(back.realizations[i].body)) problems.push(`${unit.identity}: body ${i} differs`);
    }
  }
  return problems;
}
