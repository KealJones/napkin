/**
 * The graph as its packs plus a journal (concept-spec Part 13).
 *
 * The packs are the seed, seeded again on every load. Everything the store does beyond them
 * is appended to `store.ncon` as it happens, one change per line, written in the IR:
 *
 *   Journal(version = 1, sequence = 4813)
 *   Mint(User_1())
 *   Assert(User_1(), Named("Keal"), seq = 4812, at = "2026-09-24T05:47:23.000Z", source = 4810)
 *   Realize(Add(), Realization(Add($a, $b), body = ...), at = "...")
 *
 * A save is an append, so a crash loses at most the line being written, and the graph can be
 * read, searched and edited as text. Loading replays the lines over the seeded packs.
 * `compact` rewrites the journal as the fewest lines that rebuild what the graph holds now,
 * which is also when something forgotten physically leaves the file.
 *
 * The lines are one per change and never formatted (code/format.ts leaves a journal alone):
 * a machine writes them, and the journal is the file that grows.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Call, type Expr, call, format, isCall, parse } from "../concept/expression.js";
import type { ConceptUnit, Realization, Relation, Stamp } from "../concept/unit.js";
import { readRealization, realizationExpr } from "../code/ncon.js";
import { load as loadJson } from "./persist.js";
import { type Change, ConceptStore } from "./store.js";

const VERSION = 1;

const named = (e: Call, name: string): Expr | undefined => e.args.find((a) => a.name === name)?.value;
const positional = (e: Call): Expr[] => e.args.filter((a) => a.name === undefined).map((a) => a.value);
/** An identity as the IR writes a Concept, or as text where it is not a name the IR reads. */
const id = (identity: string): Expr => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(identity) ? call(identity, []) : identity);
const identityOf = (e: Expr | undefined): string => {
  if (typeof e === "string") return e;
  if (e === undefined) throw new Error("Expected an identity, got nothing");
  if (!isCall(e)) throw new Error(`Expected an identity, got ${format(e)}`);
  return e.head;
};

/** The packs a Concept came from, if any did: what a change to it is made over. */
function packsOf(store: ConceptStore, identity: string): string[] {
  const unit = store.get(identity);
  if (!unit) return [];
  const packs = new Set<string>();
  for (const r of unit.realizations) if (r.seededFrom) packs.add(r.seededFrom);
  for (const r of unit.relations) for (const s of r.stamps ?? []) if (s.pack) packs.add(s.pack);
  return [...packs];
}

const over = (store: ConceptStore, identity: string) => {
  const packs = packsOf(store, identity);
  return packs.length ? [{ name: "over", value: packs.length === 1 ? call("Pack", [{ value: packs[0] }]) : call("List", packs.map((p) => ({ value: call("Pack", [{ value: p }]) }))) }] : [];
};

const stampArgs = (s: Stamp) => [
  { name: "seq", value: s.seq },
  { name: "at", value: s.recordedAt },
  ...(s.source === undefined ? [] : [{ name: "source", value: s.source }]),
];

/** A realization with what only a graph knows of it: when it was added, whether retired, whose. */
function realizationEntry(r: Realization): Expr {
  const e = realizationExpr(r) as Call;
  return call("Realization", [
    ...e.args,
    ...(r.addedAt === undefined ? [] : [{ name: "at", value: r.addedAt }]),
    ...(r.retired ? [{ name: "retired", value: true }] : []),
    ...(r.seededFrom === undefined ? [] : [{ name: "seededFrom", value: r.seededFrom }]),
  ]);
}

function readRealizationEntry(e: Expr): Realization {
  if (!isCall(e) || e.head !== "Realization") throw new Error(`Expected a Realization, got ${format(e)}`);
  const r = readRealization("journal", e);
  const at = named(e, "at");
  const seededFrom = named(e, "seededFrom");
  return {
    ...r,
    ...(typeof at === "string" ? { addedAt: at } : {}),
    ...(named(e, "retired") === true ? { retired: true } : {}),
    ...(typeof seededFrom === "string" ? { seededFrom } : {}),
  };
}

const unitEntry = (u: ConceptUnit): Expr =>
  call("Concept", [
    { value: id(u.identity) },
    ...u.relations.map((r) => ({ value: r.context === undefined ? r.claim : call("Relation", [{ value: r.claim }, { name: "context", value: r.context }]) })),
    ...u.realizations.map((r) => ({ value: realizationEntry(r) })),
  ]);

function readUnitEntry(e: Expr): ConceptUnit {
  if (!isCall(e) || e.head !== "Concept") throw new Error(`Expected a Concept, got ${format(e)}`);
  const [identity, ...parts] = positional(e);
  const relations: Relation[] = [];
  const realizations: Realization[] = [];
  for (const p of parts) {
    if (isCall(p) && p.head === "Realization") realizations.push(readRealizationEntry(p));
    else if (isCall(p) && p.head === "Relation") {
      const context = named(p, "context");
      relations.push({ claim: positional(p)[0], ...(context === undefined ? {} : { context }) });
    } else relations.push({ claim: p });
  }
  return { identity: identityOf(identity), relations, realizations };
}

/** A change as the line the journal holds for it. */
export function entryFor(store: ConceptStore, change: Change): Expr {
  switch (change.kind) {
    case "mint":
      return call("Mint", [{ value: id(change.identity) }]);
    case "seed":
      return call("Seed", [{ value: unitEntry(change.unit) }]);
    case "assert":
      return call("Assert", [
        { value: id(change.identity) },
        { value: change.relation.claim },
        ...(change.relation.context === undefined ? [] : [{ name: "context", value: change.relation.context }]),
        ...stampArgs(change.stamp),
        ...over(store, change.identity),
      ]);
    case "realize":
      return call("Realize", [{ value: id(change.identity) }, { value: realizationEntry(change.realization) }, ...over(store, change.identity)]);
    case "realizations":
      return call("Realizations", [
        { value: id(change.identity) },
        { value: call("List", change.realizations.map((r) => ({ value: realizationEntry(r) }))) },
        ...over(store, change.identity),
      ]);
    case "collect":
      return call("Collect", [{ value: call("List", change.seqs.map((value) => ({ value }))) }]);
    case "resource":
      return call("Resource", [{ value: call("List", change.from.map((value) => ({ value }))) }, { value: change.to }]);
    case "forget":
      return call("Forget", [{ value: id(change.identity) }]);
  }
}

/**
 * A unit's realizations as a journal says they were, over what the packs seed now: a seeded
 * one the journal names keeps the retirement the journal gives it, one the packs no longer
 * seed is gone, and one the packs seed now that the journal never saw is kept.
 */
function mergeRealizations(current: readonly Realization[], said: readonly Realization[]): Realization[] {
  const sameKey = (a: Realization, b: Realization) => format(a.pattern) === format(b.pattern) && format(a.context ?? null) === format(b.context ?? null) && format(a.body) === format(b.body);
  const seededNow = current.filter((r) => r.seededFrom !== undefined);
  const out: Realization[] = [];
  for (const r of said) {
    if (r.seededFrom === undefined) {
      out.push(r);
      continue;
    }
    const now = seededNow.find((x) => sameKey(x, r));
    if (now) out.push({ ...now, ...(r.retired ? { retired: true } : {}) });
  }
  for (const r of seededNow) if (!said.some((x) => x.seededFrom !== undefined && sameKey(x, r))) out.unshift(r);
  return out;
}

/** One line read back into the store. `loaded` is the packs seeded, for `over`. */
function apply(store: ConceptStore, e: Expr, loaded: ReadonlySet<string>, missing: Map<string, number>): void {
  if (!isCall(e)) throw new Error(`Not an entry: ${format(e)}`);
  const noteOver = () => {
    const o = named(e, "over");
    const packs = o === undefined ? [] : isCall(o) && o.head === "List" ? positional(o) : [o];
    for (const p of packs) {
      const name = isCall(p) ? positional(p)[0] : undefined;
      if (typeof name === "string" && !loaded.has(name)) missing.set(name, (missing.get(name) ?? 0) + 1);
    }
  };
  switch (e.head) {
    case "Journal":
      return;
    case "Mint": {
      const identity = identityOf(positional(e)[0]);
      if (!store.has(identity)) store.seed({ identity, relations: [], realizations: [] });
      return;
    }
    case "Seed":
      store.seed(readUnitEntry(positional(e)[0]));
      return;
    case "Assert": {
      noteOver();
      const [who, claim] = positional(e);
      const context = named(e, "context");
      const seq = named(e, "seq");
      const at = named(e, "at");
      const source = named(e, "source");
      if (typeof seq !== "number" || typeof at !== "string") throw new Error(`An Assert needs seq and at: ${format(e)}`);
      const stamp: Stamp = { seq, recordedAt: at, ...(typeof source === "number" ? { source } : {}) };
      store.addRelation(identityOf(who), context === undefined ? { claim } : { claim, context }, undefined, stamp);
      return;
    }
    case "Realize": {
      noteOver();
      const [who, r] = positional(e);
      const realization = readRealizationEntry(r);
      store.addRealization(identityOf(who), realization, realization.addedAt);
      return;
    }
    case "Realizations": {
      noteOver();
      const [who, list] = positional(e);
      const identity = identityOf(who);
      if (!isCall(list)) throw new Error(`Realizations needs a List: ${format(e)}`);
      store.replaceRealizations(identity, mergeRealizations(store.get(identity)?.realizations ?? [], positional(list).map(readRealizationEntry)));
      return;
    }
    case "Retire": {
      noteOver();
      const [who, r] = positional(e);
      const identity = identityOf(who);
      const target = readRealizationEntry(r);
      const unit = store.get(identity);
      const same = (x: Realization) => format(x.pattern) === format(target.pattern) && format(x.context ?? null) === format(target.context ?? null) && format(x.body) === format(target.body);
      if (unit?.realizations.some(same)) store.replaceRealizations(identity, unit.realizations.map((x) => (same(x) ? { ...x, retired: true } : x)));
      return;
    }
    case "Collect": {
      const list = positional(e)[0];
      store.collect(new Set(isCall(list) ? positional(list).filter((x): x is number => typeof x === "number") : []));
      return;
    }
    case "Resource": {
      const [list, to] = positional(e);
      if (typeof to !== "number") throw new Error(`Resource needs a seq: ${format(e)}`);
      store.resource(new Set(isCall(list) ? positional(list).filter((x): x is number => typeof x === "number") : []), to);
      return;
    }
    case "Forget":
      store.forgetConcept(identityOf(positional(e)[0]));
      return;
    default:
      throw new Error(`Unknown entry ${e.head}`);
  }
}

export interface GraphReport {
  /** Where the graph is. */
  path: string;
  /** Lines replayed. */
  replayed: number;
  /** Lines that did not read, skipped: a torn last line, or a hand edit gone wrong. */
  skipped: string[];
  /** Changes made over a pack that is not loaded now, by pack. Kept, and reported. */
  overMissing: Record<string, number>;
  /** Migrated from a graph.json this time. */
  migratedFrom?: string;
  /** Another process holds the graph: opened to read only, and nothing is written. */
  readOnly: boolean;
}

const HEADER = (sequence: number) =>
  "// Napkin's graph beyond its packs (concept-spec Part 13): one change per line, in the order made.\n" +
  "// Appended as the graph changes and read back over the packs on load. Not formatted.\n" +
  `${format(call("Journal", [{ name: "version", value: VERSION }, { name: "sequence", value: sequence }]))}\n`;

/**
 * The fewest entries that rebuild what `store` holds beyond what the packs seed: each
 * assertion no pack made, one per stamp in the order they were made, each learned or
 * retired realization, and each Concept minted and not yet described.
 */
export function compactEntries(store: ConceptStore): Expr[] {
  const asserts: { seq: number; entry: Expr }[] = [];
  const rest: Expr[] = [];
  for (const unit of store.all()) {
    const packs = packsOf(store, unit.identity);
    const fromPack = packs.length > 0;
    let kept = 0;
    for (const r of unit.relations) {
      for (const s of r.stamps ?? []) {
        if (s.pack !== undefined) continue;
        kept += 1;
        asserts.push({
          seq: s.seq,
          entry: call("Assert", [
            { value: id(unit.identity) },
            { value: r.claim },
            ...(r.context === undefined ? [] : [{ name: "context", value: r.context }]),
            ...stampArgs(s),
            ...over(store, unit.identity),
          ]),
        });
      }
    }
    // A relation with no stamps at all (built by hand, seeded by a caller) is a Seed.
    const unstamped = unit.relations.filter((r) => !r.stamps?.length);
    const learned = unit.realizations.filter((r) => r.seededFrom === undefined);
    // A pack's realization retired with nothing live in its place was retired by hand (or
    // its pack dropped it, when retiring it again changes nothing). One retired for a newer
    // copy of itself was the pack's own doing, and the pack does it again.
    const live = (r: Realization) => unit.realizations.some((x) => !x.retired && format(x.pattern) === format(r.pattern) && format(x.context ?? null) === format(r.context ?? null));
    const retiredSeeded = unit.realizations.filter((r) => r.seededFrom !== undefined && r.retired && !live(r));
    if (!fromPack && !kept && !learned.length && !unstamped.length) {
      rest.push(call("Mint", [{ value: id(unit.identity) }]));
      continue;
    }
    if (unstamped.length) rest.push(call("Seed", [{ value: unitEntry({ identity: unit.identity, relations: unstamped, realizations: [] }) }]));
    for (const r of learned) rest.push(call("Realize", [{ value: id(unit.identity) }, { value: realizationEntry(r) }, ...over(store, unit.identity)]));
    for (const r of retiredSeeded) rest.push(call("Retire", [{ value: id(unit.identity) }, { value: realizationEntry(r) }, ...over(store, unit.identity)]));
  }
  // Mints first, so a Concept exists before anything is said of it; then what was asserted,
  // in the order it was; then what was learned to do.
  const mints = rest.filter((e) => isCall(e) && (e.head === "Mint" || e.head === "Seed"));
  const others = rest.filter((e) => !(isCall(e) && (e.head === "Mint" || e.head === "Seed")));
  return [...mints, ...asserts.sort((a, b) => a.seq - b.seq).map((a) => a.entry), ...others];
}

/** Rewrite the journal as the fewest lines that rebuild the graph now. */
export function compact(store: ConceptStore, path: string): number {
  const entries = compactEntries(store);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, HEADER(store.sequence) + entries.map((e) => `${format(e)}\n`).join(""), "utf8");
  renameSync(temporary, path);
  return entries.length;
}

/** Whether a process id is running. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Open the graph at `path` (`~/.napkin/store.ncon`): seed the packs, replay the journal over
 * them, and append every change from now on. `seedPacks` seeds whatever packs the caller
 * uses, and answers the names of those it seeded. A `graph.json` beside it, with no journal
 * yet, is migrated: read the old way, compacted into the journal, and kept as
 * `graph.json.migrated`.
 */
export function openGraph(store: ConceptStore, path: string, seedPacks: (store: ConceptStore) => readonly string[]): GraphReport {
  const report: GraphReport = { path, replayed: 0, skipped: [], overMissing: {}, readOnly: false };
  const lock = `${path}.lock`;
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8").trim());
    if (pid && pid !== process.pid && alive(pid)) report.readOnly = true;
  }

  const legacy = path.replace(/store\.ncon$/, "graph.json");
  if (!existsSync(path) && legacy !== path && existsSync(legacy) && !report.readOnly) {
    // The old graph, read as it always was (loaded, then the packs seeded over it), and
    // written as the journal. What runs is then what the journal holds, read back below.
    const old = new ConceptStore();
    loadJson(old, legacy);
    seedPacks(old);
    compact(old, path);
    renameSync(legacy, `${legacy}.migrated`);
    report.migratedFrom = legacy;
  }

  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = text.split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("//"));
  const entries: Expr[] = [];
  let sequence = 0;
  for (const line of lines) {
    try {
      const e = parse(line);
      entries.push(e);
      if (isCall(e)) {
        const seq = named(e, e.head === "Journal" ? "sequence" : "seq");
        if (typeof seq === "number") sequence = Math.max(sequence, e.head === "Journal" ? seq : seq + 1);
      }
    } catch {
      report.skipped.push(line.length > 120 ? `${line.slice(0, 120)}...` : line);
    }
  }
  store.resume(sequence);
  const loaded = new Set(seedPacks(store));
  const missing = new Map<string, number>();
  store.replaying(() => {
    for (const e of entries) {
      try {
        apply(store, e, loaded, missing);
        report.replayed += 1;
      } catch (error) {
        report.skipped.push(`${format(e).slice(0, 120)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  report.overMissing = Object.fromEntries(missing);

  if (!report.readOnly) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) writeFileSync(path, HEADER(store.sequence), "utf8");
    writeFileSync(lock, String(process.pid), "utf8");
    const release = () => {
      try {
        if (existsSync(lock) && readFileSync(lock, "utf8").trim() === String(process.pid)) unlinkSync(lock);
      } catch {
        // Leaving a stale lock is harmless: the next process sees its pid is not running.
      }
    };
    process.once("exit", release);
    store.onChange = (change) => {
      // What is deleted leaves the file: forgetting that stayed as lines a later line undoes
      // would not be forgetting.
      if (change.kind === "collect" || change.kind === "forget") compact(store, path);
      else appendFileSync(path, `${format(entryFor(store, change))}\n`, "utf8");
    };
  }
  return report;
}

/** Stop appending to the journal (a test's store, or a process handing the graph over). */
export function closeGraph(store: ConceptStore, path: string): void {
  store.onChange = undefined;
  const lock = `${path}.lock`;
  try {
    if (existsSync(lock) && readFileSync(lock, "utf8").trim() === String(process.pid)) unlinkSync(lock);
  } catch {
    // As above.
  }
}


/**
 * A Napkin graph at `path`, opened the way the CLI and the studio open it: the built-in
 * packs and a user's own beside it (`packs/`), then the journal, appended to from now on.
 * A path ending `.json` is an old snapshot, read and saved whole as it always was.
 */
export async function openNapkinGraph(
  store: ConceptStore,
  path: string,
): Promise<{ units: number; seeded: import("../seed/seed.js").SeedReport; journal?: GraphReport; save: () => void }> {
  const { seed } = await import("../seed/seed.js");
  const { save: saveJson } = await import("./persist.js");
  const packs = [`${dirname(path)}/packs`];
  if (path.endsWith(".json")) {
    // Loaded before seeding, so a stale copy of a seeded realization cannot shadow the
    // current one: newer shadows older, and the seed must be newer.
    const units = loadJson(store, path);
    return { units, seeded: seed(store, { packs }), save: () => void saveJson(store, path) };
  }
  let seeded: import("../seed/seed.js").SeedReport | undefined;
  const journal = openGraph(store, path, (s) => (seeded = seed(s, { packs })).packs);
  // Every change is already in the journal: saving is nothing to do.
  return { units: store.size(), seeded: seeded!, journal, save: () => undefined };
}
