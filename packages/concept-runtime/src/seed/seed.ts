/**
 * The Concepts the network starts with (design/seed-concepts.md), read from `.ncon` packs.
 *
 * A seed Concept is an ordinary Concept that happens to exist at time zero. It can be
 * shadowed, appended to, retired, and forgotten like any other. What it is lives in a pack
 * (`packs/*.ncon`, and any a user adds), not here: seeding reads the packs, each after what
 * it requires, and records the pack as the origin of what it adds (code/ncon.ts).
 *
 * Nothing in a pack is stubbed. A Concept that cannot yet be honestly realized is omitted,
 * so that it produces a residual the learning path can act on rather than a wrong answer.
 */
import { c, call, equal, format, isCall, parse } from "../concept/expression.js";
import { declares, realization, type ConceptUnit, type Realization } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";
import { BUILT_IN_PACKS, loadPacks, type Pack, seedPacks } from "../code/ncon.js";
import { readPhrase } from "../ears/parser/rules.js";
import { UNIVERSAL } from "../runtime/select.js";

/** A realization that only hands the call to another Concept, rather than doing anything. */
const FORWARDING = "Forwarding";

/**
 * Can this Concept actually do something, following forwards to wherever they lead?
 *
 * A forward is not behaviour, it is a pointer at behaviour. Hi forwarded to Hello and
 * Hello forwarded back to Hi -- each looked realized, neither could do anything, and
 * evaluating Hi() ran to the depth budget. SynonymOf is symmetric, so both arrows get
 * derived from one assertion and the cycle builds itself.
 */
function reachesRealBehaviour(store: ConceptStore, identity: string, seen = new Set<string>()): boolean {
  if (seen.has(identity)) return false;
  seen.add(identity);
  const unit = store.get(identity);
  if (!unit) return false;
  for (const r of unit.realizations) {
    if (!declares(r, FORWARDING)) return true;
    const named = r.properties.find((p) => isCall(p) && p.head === FORWARDING);
    const target = named && isCall(named) ? named.args[0]?.value : undefined;
    const to = target !== undefined && isCall(target) ? target.head : undefined;
    if (to && reachesRealBehaviour(store, to, seen)) return true;
  }
  // Behaviour reached by inheritance is behaviour: What has no realization of its own and
  // answers through Interrogative's, so WhatIs forwarding to it is not a pointer at nothing.
  for (const { claim: r } of unit.relations) {
    if (!isCall(r) || r.head !== "IsA") continue;
    const parent = r.args[0]?.value;
    if (isCall(parent) && reachesRealBehaviour(store, parent.head, seen)) return true;
  }
  return false;
}

/**
 * Point one name at another's behaviour. Refused when the target has none of its own to
 * lend, because a pointer at a pointer is not a destination.
 */
export function forwardSynonym(store: ConceptStore, identity: string, target: string): boolean {
  if (target === identity) return false;
  if (!reachesRealBehaviour(store, target, new Set([identity]))) return false;
  store.addRealization(
    identity,
    realization({
      pattern: `${identity}(Rest($args))`,
      evaluateArguments: false,
      // The target is named in the property, so the evaluator can see where a forward
      // goes without reading its source.
      properties: [`${FORWARDING}(${target}())`],
      // The call handed on as it came, unevaluated, since the target decides what it evaluates.
      body: parse(`${target}(Rest($args))`),
    }),
  );
  return true;
}

function deriveSynonymForwarding(store: ConceptStore): number {
  let derived = 0;
  // A forwarding is derived from a synonym, so it goes when the synonym does: emoji kept
  // answering "what is an emoji" with Emoticon after SynonymOf(Emoticon()) was retracted.
  for (const unit of store.all()) {
    const stale = unit.realizations.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (r.retired) return false;
      const to = r.properties.find((p) => isCall(p) && p.head === FORWARDING);
      const target = to && isCall(to) ? to.args[0]?.value : undefined;
      if (target === undefined || !isCall(target)) return false;
      return !unit.relations.some(
        (x) => isCall(x.claim) && x.claim.head === "SynonymOf" && format(x.claim.args[0]?.value) === format(target) && !store.retracted(unit.identity, x.claim),
      );
    });
    if (stale.length) {
      const gone = new Set(stale.map((x) => x.i));
      store.replaceRealizations(unit.identity, unit.realizations.map((r, i) => (gone.has(i) ? { ...r, retired: true } : r)));
    }
  }
  for (const unit of store.all()) {
    if (unit.realizations.some((r) => !r.retired)) continue;
    for (const { claim: r } of unit.relations) {
      if (!isCall(r) || r.head !== "SynonymOf" || store.retracted(unit.identity, r)) continue;
      const target = r.args[0]?.value;
      if (target === undefined || !isCall(target)) continue;
      if (!forwardSynonym(store, unit.identity, target.head)) continue;
      derived += 1;
      break;
    }
  }
  return derived;
}

/** A realization that says a phrase is one Concept, derived from that Concept's name. */
const FOLD = "Fold";

const foldTarget = (r: Realization): string | undefined => {
  const p = r.properties.find((x) => isCall(x) && x.head === FOLD);
  const target = p !== undefined && isCall(p) ? p.args[0]?.value : undefined;
  return target !== undefined && isCall(target) ? target.head : undefined;
};

/**
 * Every multi-word name folds its own phrase. `WorkInProgress` is spelled from "work in
 * progress", and the Ears reads those words as `Work(In(Progress()))`, so the universal
 * parent gets a realization with that pattern whose body is `WorkInProgress()`, in the
 * `Reading()` context: the phrase stays as said, and reading it (`Read`) finds the Concept.
 *
 * The fold lives on `Concept`, which every head inherits from, so no Concept is created for
 * `Work` just to hold it: a word nobody taught stays unknown. A fold only runs while reading
 * and only matches the phrase exactly as the Ears reads it, so a name nobody says
 * (`MakeCall`) folds a phrase nobody says. Nobody writes a fold: a Concept learned tomorrow folds the next time the graph is seeded,
 * and a fold goes when its Concept does.
 */
function deriveFolds(store: ConceptStore): number {
  const folds = (store.get(UNIVERSAL)?.realizations ?? []).filter((r) => !r.retired && foldTarget(r) !== undefined);
  const lapsed = (to: string) => !store.has(to);
  if (folds.some((r) => lapsed(foldTarget(r)!))) {
    const universal = store.get(UNIVERSAL)!;
    store.replaceRealizations(UNIVERSAL, universal.realizations.map((r) => {
      const to = foldTarget(r);
      return !r.retired && to !== undefined && lapsed(to) ? { ...r, retired: true } : r;
    }));
  }
  const folded = new Set(folds.map((r) => foldTarget(r)!).filter((to) => !lapsed(to)));
  let derived = 0;
  for (const unit of store.all()) {
    // Words only: a minted individual (Greg_1) or an acronym is not a phrase.
    if (folded.has(unit.identity) || !/^(?:[A-Z][a-z]+){2,}$/.test(unit.identity)) continue;
    const said = readPhrase(unit.identity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    if (said === undefined || !isCall(said) || said.head === unit.identity || equal(said, c(unit.identity))) continue;
    // A compound's describers come first and what is said of it follows: "the square root
    // of 144" is Root(Square(), Of(144)), which is SquareRoot(Of(144)).
    const open = said.args.length > 0 && said.args.every((a) => a.name === undefined && isCall(a.value) && !a.value.args.length);
    const rest = parse("Rest($rest)");
    store.addRealization(
      UNIVERSAL,
      realization({
        pattern: open ? call(said.head, [...said.args, { value: rest }]) : said,
        context: "Reading()",
        evaluateArguments: false,
        properties: [`${FOLD}(${unit.identity}())`],
        body: open ? call(unit.identity, [{ value: rest }]) : c(unit.identity),
      }),
    );
    derived += 1;
  }
  return derived;
}

export interface SeedReport {
  created: number;
  updated: number;
  relations: number;
  realizations: number;
  /** Seeded before by a pack that no longer has them. */
  retired: number;
  removed: number;
  synonymsDerived: number;
  foldsDerived: number;
  /** The packs seeded, by name. */
  packs: string[];
}

/** Packs are read once per set of directories; seeding many stores does not reread them. */
const PACKS = new Map<string, Pack[]>();
const packsIn = (dirs: readonly string[]): Pack[] => {
  const key = dirs.join("\0");
  let packs = PACKS.get(key);
  if (!packs) PACKS.set(key, (packs = loadPacks(dirs)));
  return packs;
};

/** Seed the built-in packs, and those in `packs` (a user's `~/.napkin/packs/`, say). */
export function seed(store: ConceptStore, options: { packs?: readonly string[] } = {}): SeedReport {
  const packs = packsIn([BUILT_IN_PACKS, ...(options.packs ?? [])]);
  const report = seedPacks(store, packs);
  return { ...report, synonymsDerived: deriveSynonymForwarding(store), foldsDerived: deriveFolds(store), packs: packs.map((p) => p.name) };
}

/** Every unit the built-in packs seed. */
export const seedUnits = (): readonly ConceptUnit[] => packsIn([BUILT_IN_PACKS]).flatMap((p) => p.units);
