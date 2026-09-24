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
import { call, format, isCall, type Expr } from "../concept/expression.js";
import { codeSource, declares, realization, type ConceptUnit } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";
import { BUILT_IN_PACKS, loadPacks, type Pack, seedPacks } from "../code/ncon.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

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
    const source = codeSource(r.body) ?? "";
    const to = /head: "([A-Za-z0-9_]+)"/.exec(source)?.[1];
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
      body: code(`async (args, bindings, api) =>
        await api.evaluate({ head: "${target}", args: args.map((a) => ({ value: a.value })) })`),
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

export interface SeedReport {
  created: number;
  updated: number;
  relations: number;
  realizations: number;
  /** Seeded before by a pack that no longer has them. */
  retired: number;
  removed: number;
  synonymsDerived: number;
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
  const report = seedPacks(store, packsIn([BUILT_IN_PACKS, ...(options.packs ?? [])]));
  return { ...report, synonymsDerived: deriveSynonymForwarding(store) };
}

/** Every unit the built-in packs seed. */
export const seedUnits = (): readonly ConceptUnit[] => packsIn([BUILT_IN_PACKS]).flatMap((p) => p.units);
