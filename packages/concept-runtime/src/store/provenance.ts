/**
 * Where what the graph holds came from, counted by source: Wikidata, Wiktionary, the
 * Teacher, a conversation, or a pack. Every learned fact is stamped from the record of where
 * it was read (`Wikidata Imported("Q...")`, `Wiktionary Imported(url)`, `Teacher Taught(...)`),
 * or from the turn that said it, so each source can be measured against the others: how much
 * it gave, and how much of that was later taken back (design/sources.md).
 *
 * A source is any Concept that is a `LearningSource`. A new one needs no change here.
 */
import { type Call, type Expr, isCall } from "../concept/expression.js";
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

export interface SourceLink {
  /** The source, by its Concept's name ("Wikidata"). */
  readonly label: string;
  readonly url: string;
}

/**
 * The outside sources an answer rests on, as links: what it says it came from (`from =
 * Wiktionary(url)`), and the facts joining what was asked to what was answered, traced back
 * through their stamps to the record they were read from (`Wikidata Imported("Q90")`). Only
 * sources a link can be made for: a conversation or a teacher is not one. A source says how
 * its records become pages with `Page(From(prefix), To(prefix))`; a record that is already a
 * web address is its own page.
 */
const called = (e: Expr | undefined): e is Call => e !== undefined && isCall(e);

export function sourcesOf(store: ConceptStore, result: Expr | undefined, asked?: Expr): SourceLink[] {
  const out = new Map<string, string>();
  const known = new Map<string, string | undefined>();
  const source = (identity: string) => {
    if (!known.has(identity)) known.set(identity, sourceOf(store, identity));
    return known.get(identity);
  };
  const link = (identity: string, record: Expr) => {
    const text = typeof record === "string" ? record : called(record) && typeof record.args[0]?.value === "string" ? record.args[0].value : undefined;
    if (text === undefined) return;
    let url = text;
    for (const r of store.get(identity)?.relations ?? []) {
      const claim = r.claim;
      if (!called(claim) || claim.head !== "Page") continue;
      const part = (head: string) => {
        const p = claim.args.find((a) => called(a.value) && a.value.head === head)?.value;
        return called(p) && typeof p.args[0]?.value === "string" ? p.args[0].value : undefined;
      };
      const from = part("From");
      const to = part("To");
      if (from !== undefined && to !== undefined && text.startsWith(from)) {
        url = to + text.slice(from.length);
        break;
      }
    }
    if (/^https?:\/\//.test(url) && !out.has(url)) out.set(url, identity);
  };
  const heads = (e: Expr | undefined, into: Set<string>, positional = true): Set<string> => {
    if (called(e)) {
      into.add(e.head);
      for (const a of e.args) if (!positional || a.name === undefined) heads(a.value, into, positional);
    }
    return into;
  };
  // What the answer says it came from.
  const walk = (e: Expr | undefined) => {
    if (!called(e)) return;
    for (const a of e.args) {
      if (a.name === "from" && called(a.value) && source(a.value.head) !== undefined) link(a.value.head, a.value);
      walk(a.value);
    }
  };
  walk(result);
  // A doing the answer uses, realized from what a source said (`Learned(Wiktionary(url), gloss)`).
  for (const head of heads(result, new Set(), false)) {
    for (const r of store.get(head)?.realizations ?? []) {
      if (r.retired) continue;
      for (const p of r.properties) if (called(p) && p.head === "Learned") for (const a of p.args) if (called(a.value) && source(a.value.head) !== undefined) link(a.value.head, a.value);
    }
  }
  // The facts joining what was asked to what was answered, back to where they were read.
  if (asked !== undefined) {
    const said = heads(asked, new Set(), false);
    for (const head of heads(result, new Set())) {
      if (said.has(head)) continue;
      for (const m of store.mentioning({ head, args: [] })) {
        if (!said.has(m.identity)) continue;
        // A fact that says where it came from (`from = Wikidata("Q142", "P36")`).
        walk(m.relation.claim);
        for (let at = m.relation.stamps?.[0]?.source, hops = 0; at !== undefined && hops < 16; hops += 1) {
          const entry = store.findStamp(at);
          if (!entry) break;
          if (source(entry.identity) !== undefined) {
            link(entry.identity, entry.relation.claim);
            break;
          }
          at = entry.stamp.source;
        }
      }
    }
  }
  return [...out].map(([url, label]) => ({ label, url }));
}
