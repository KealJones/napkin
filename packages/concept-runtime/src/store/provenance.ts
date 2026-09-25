/**
 * Where what the graph holds came from, counted by source: Wikidata, Wiktionary, the
 * Teacher, the user, or a pack. Every learned fact is stamped from the record of where it
 * was read (`Wikidata Imported("Q...")`, `Wiktionary Imported(url)`, `Teacher Taught(...)`),
 * which is itself stamped from the turn that asked, so each source can be measured against
 * the others: how much it gave, and how much of that was later taken back.
 */
import type { ConceptStore } from "./store.js";

/** The records sources are kept under. A fact stamped from one of these came from it. */
const SOURCES = new Set(["Wikidata", "Wiktionary", "Teacher", "Web"]);

export interface SourceCount {
  readonly facts: number;
  readonly retracted: number;
}

/** Facts by where they came from. A fact stamped straight from a turn is what the user said. */
export function factsBySource(store: ConceptStore): Map<string, SourceCount> {
  const out = new Map<string, { facts: number; retracted: number }>();
  const origin = (source: number | undefined): string => {
    for (let at = source, hops = 0; at !== undefined && hops < 16; hops += 1) {
      const entry = store.findStamp(at);
      if (!entry) return "unsourced";
      if (SOURCES.has(entry.identity)) return entry.identity;
      if (entry.identity.startsWith("Conversation_")) return "said";
      at = entry.stamp.source;
    }
    return "unsourced";
  };
  for (const unit of store.all()) {
    if (SOURCES.has(unit.identity) || unit.identity.startsWith("Conversation_")) continue;
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
