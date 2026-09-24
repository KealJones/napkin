/**
 * A grounding layer: one source's relations about the core words, and how it enters a graph.
 *
 * Each source is its own layer, in its own file, because the licenses differ and must stay
 * separable (seed-dataset-sources correction 7): NGSL and ConceptNet are CC BY-SA, Open
 * English WordNet is CC BY. In the graph the separation is kept by stamps rather than by
 * files. Grounding a layer records one import stamp, on a relation of the source's own
 * Concept that says which version under which license, and every relation the layer adds is
 * stamped from it (memory-spec Part 4.2). Removing a share-alike layer later is a walk over
 * stamps whose `source` is that one `seq`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { call, format, isCall } from "../../concept/expression.js";
import { concept, relation, type Relation } from "../../concept/unit.js";
import { type ConceptStore, sameRelation } from "../../store/store.js";

/** Where dumps are fetched to and layers written: beside the package, gitignored. */
export const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/grounding");

/** The persisted relation shape: a bare claim, or a claim scoped to a context. */
export type LayerRelation = string | { claim: string; context: string };

export interface Layer {
  /** The Concept the import stamp is recorded on, e.g. `OpenEnglishWordNet`. */
  readonly source: string;
  readonly version: string;
  readonly license: string;
  readonly url: string;
  /** Relations by the identity that holds them. */
  readonly units: Record<string, LayerRelation[]>;
}

export interface GroundReport {
  readonly source: string;
  /** The `seq` every relation this layer added is sourced from. */
  readonly importSeq: number;
  readonly added: number;
  /**
   * `IsA` claims not added because they land on a Concept that already has realizations.
   * A new parent is a new ancestor, and selection reads ancestors nearest first
   * (`runtime/select.ts`), so the claim could change which realization a known Concept
   * runs. That is a decision for a person, not an import.
   */
  readonly withheld: { identity: string; claim: string; realizations: number }[];
}

const asRelation = (r: LayerRelation): Relation =>
  typeof r === "string" ? relation(r) : relation(r.claim, r.context);

const provenance = (layer: Layer): Relation =>
  relation(
    call("Imported", [
      { name: "version", value: layer.version },
      { name: "license", value: layer.license },
      { name: "url", value: layer.url },
    ]),
  );

/**
 * Add a layer to the graph. Additive and idempotent, like seeding: grounding the same layer
 * again finds its import stamp and every relation already held, and adds no stamp at all.
 * Asserting again would stamp again (memory-spec Part 4.3), which would count a re-import
 * as a second source saying the same thing.
 */
export function ground(store: ConceptStore, layer: Layer): GroundReport {
  const imported = provenance(layer);
  const held = store.get(layer.source)?.relations.find((r) => sameRelation(r, imported));
  const importSeq = held?.stamps?.[0]?.seq ?? store.addRelation(layer.source, imported).seq;

  let added = 0;
  const withheld: GroundReport["withheld"] = [];
  for (const [identity, relations] of Object.entries(layer.units)) {
    const existing = store.get(identity);
    const fresh: Relation[] = [];
    for (const r of relations.map(asRelation)) {
      if (existing?.relations.some((x) => sameRelation(x, r))) continue;
      if (existing?.realizations.length && isCall(r.claim) && r.claim.head === "IsA") {
        withheld.push({ identity, claim: format(r.claim), realizations: existing.realizations.length });
        continue;
      }
      fresh.push({ ...r, stamps: [store.reserve(importSeq)] });
    }
    // One write per Concept: the store re-indexes the whole unit on every write.
    if (fresh.length) store.seed(concept(identity, { relations: fresh }));
    added += fresh.length;
  }
  return { source: layer.source, importSeq, added, withheld };
}

/** Every layer file in a directory, in name order, so grounding is reproducible. */
export function groundAll(store: ConceptStore, dir: string): GroundReport[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ground(store, JSON.parse(readFileSync(join(dir, f), "utf8")) as Layer));
}

export function writeLayer(dir: string, name: string, layer: Layer): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(layer), "utf8");
  return path;
}

