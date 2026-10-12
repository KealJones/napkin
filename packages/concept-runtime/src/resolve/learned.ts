/**
 * What a typed form has been read as before, kept in the graph.
 *
 * A reading that worked, or one the user gave ("no, I meant plus"), is asserted on the Concept
 * it was read as: Plus holds WrittenAs("pluss", "plus"). Asserting it again adds a stamp, so how
 * often it held is how many stamps it has, and each says when. It is found again by the typed
 * form through the mention index, weighs for that reading the next time the form is typed, and
 * can be traced and deleted like anything else learned.
 *
 * A form the user means as typed ("florp" is a word of theirs) is kept the same way, read as
 * itself, so it is not taken for a misspelling again.
 */
import { c, isCall } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import type { ConceptStore } from "../store/store.js";

/** The one relation this module writes and reads. */
export const WRITTEN_AS = "WrittenAs";
/** A reading the user took back: it no longer weighs, and its stamps stay as the record. */
export const NOT_WRITTEN_AS = "NotWrittenAs";

export interface LearnedReading {
  readonly meant: string;
  /** What it adds to a reading's score: more each time it held, to a limit. */
  readonly weight: number;
  readonly times: number;
}

const BASE = 1.5;
const EACH = 0.5;
const MOST = 4;

export function learnedReadings(store: ConceptStore, typed: string): LearnedReading[] {
  const by = new Map<string, number>();
  const refused = new Set<string>();
  for (const { relation } of store.mentioning(typed)) {
    const claim = relation.claim;
    if (!isCall(claim) || claim.args[0]?.value !== typed || typeof claim.args[1]?.value !== "string") continue;
    const meant = claim.args[1].value;
    if (claim.head === NOT_WRITTEN_AS) refused.add(meant);
    if (claim.head === WRITTEN_AS) by.set(meant, (by.get(meant) ?? 0) + (relation.stamps?.length ?? 1));
  }
  return [...by]
    .filter(([meant]) => !refused.has(meant))
    .map(([meant, times]) => ({ meant, times, weight: Math.min(MOST, BASE + EACH * (times - 1)) }));
}

/** The Concept a reading is kept on: the first word it was read as. */
const holder = (meant: string): string => nameOf(meant.split(/\s+/)[0]) || "Word";

/** Keep that `typed` was read as `meant`. `times` more than one for what the user said outright. */
export function keepReading(store: ConceptStore, typed: string, meant: string, times = 1): void {
  for (let i = 0; i < times; i++) store.addRelation(holder(meant), c(WRITTEN_AS, typed, meant));
}

/** Keep that `typed` was not `meant`, so that reading stops weighing. */
export function refuseReading(store: ConceptStore, typed: string, meant: string): void {
  if (learnedReadings(store, typed).some((l) => l.meant === meant)) store.addRelation(holder(meant), c(NOT_WRITTEN_AS, typed, meant));
}
