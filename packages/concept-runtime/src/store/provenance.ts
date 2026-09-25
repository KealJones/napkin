/**
 * Where what the graph holds came from, counted by source: Wikidata, Wiktionary, the
 * Teacher, a conversation, or a pack. Every learned fact is stamped from the record of where
 * it was read (`Wikidata Imported("Q...")`, `Wiktionary Imported(url)`, `Teacher Taught(...)`),
 * or from the turn that said it, so each source can be measured against the others: how much
 * it gave, and how much of that was later taken back (design/sources.md).
 *
 * A source is any Concept that is a `LearningSource`. A new one needs no change here.
 */
import { type Expr, isCall } from "../concept/expression.js";
import { lineage } from "../runtime/select.js";
import type { ConceptStore } from "./store.js";

/** The one Concept every source is, and the one identity this module names. */
const LEARNING_SOURCE = "LearningSource";

export interface SourceCount {
  readonly facts: number;
  readonly retracted: number;
}

/**
 * The source an identity is a record on: itself when it is a source (`Wikidata`), or the
 * source it is an instance of (`Conversation_7` is a `Conversation`).
 */
function sourceOf(store: ConceptStore, identity: string): string | undefined {
  const isSource = (claim: Expr) => isCall(claim) && claim.head === "IsA" && isCall(claim.args[0]?.value) && claim.args[0].value.head === LEARNING_SOURCE;
  return lineage(store, identity).find((unit) => unit.relations.some((r) => isSource(r.claim)))?.identity;
}

/** Facts by where they came from. */
export function factsBySource(store: ConceptStore): Map<string, SourceCount> {
  const out = new Map<string, { facts: number; retracted: number }>();
  const known = new Map<string, string | undefined>();
  const source = (identity: string) => {
    if (!known.has(identity)) known.set(identity, sourceOf(store, identity));
    return known.get(identity);
  };
  const origin = (from: number | undefined): string => {
    for (let at = from, hops = 0; at !== undefined && hops < 16; hops += 1) {
      const entry = store.findStamp(at);
      if (!entry) return "unsourced";
      const found = source(entry.identity);
      if (found) return found;
      at = entry.stamp.source;
    }
    return "unsourced";
  };
  for (const unit of store.all()) {
    // A source's own records (what was imported, what was said) are not facts about the world.
    if (source(unit.identity) !== undefined) continue;
    for (const relation of unit.relations) {
      const stamp = relation.stamps?.[0];
      const from = stamp === undefined ? "unsourced" : stamp.pack !== undefined ? "pack" : origin(stamp.source);
      const count = out.get(from) ?? { facts: 0, retracted: 0 };
      count.facts += 1;
      if (store.retracted(unit.identity, relation.claim)) count.retracted += 1;
      out.set(from, count);
    }
  }
  return out;
}
