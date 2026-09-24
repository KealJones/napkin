/**
 * `.ncon`, Napkin Concept Object Notation: Concepts as a file.
 *
 * A pack is a sequence of expressions in the IR's own syntax, with `//` comments and
 * `"""raw"""` strings. What Napkin knows at birth is packs, not TypeScript: the built-in
 * ones in `packs/`, and any a user adds in `~/.napkin/packs/`. A language pack also says how
 * its language maps to and from Concepts, as rules that load as ordinary realizations.
 *
 *   Requires(Core())                              packs loaded before this one
 *   Language(JavaScript())                        the language the rules below are for
 *   Concept(Name(), relation..., Realization(pattern, context=..., body=...))
 *   Compiled(pattern, "template")                 what a primitive compiles to
 *   Prelude("""helpers""")                        what every compiled body starts with
 *   From(syntax pattern, Concepts)                how the language is read
 *   To(pattern, [Statement(),] "template")        how it is written (code/write.ts)
 *
 * Seeding a pack records it as the origin of what it adds, so reloading an edited pack
 * retires what it no longer has, and never touches what anyone else added.
 */
import { formatNcon } from "./format.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Argument, type Call, type Expr, call, format, isCall, parseMany } from "../concept/expression.js";
import type { ConceptUnit, Realization, Relation } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";

export interface Pack {
  readonly name: string;
  readonly requires: readonly string[];
  readonly units: readonly ConceptUnit[];
}

export class PackError extends Error {
  constructor(pack: string, message: string) {
    super(`${pack}.ncon: ${message}`);
    this.name = "PackError";
  }
}

/** `Requires(Basic())` and a file named `basic.ncon` name the same pack. */
const packName = (text: string): string => text.toLowerCase();

const named = (e: Call, name: string): Expr | undefined => e.args.find((a) => a.name === name)?.value;
const positional = (e: Call): Expr[] => e.args.filter((a) => a.name === undefined).map((a) => a.value);

/**
 * JavaScript with `$name` where the code for an argument goes, as `Text(...)` parts: the
 * body of a template realization, read as a template and never run.
 */
export function templateParts(template: string): Call {
  const parts: Expr[] = [];
  const re = /\$([a-z][A-Za-z0-9]*)/g;
  let at = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    if (m.index > at) parts.push(template.slice(at, m.index));
    parts.push({ variable: m[1] });
    at = m.index + m[0].length;
  }
  if (at < template.length) parts.push(template.slice(at));
  return call("Text", parts.map((value) => ({ value })));
}

const context = (language: Expr, ...facets: Expr[]): Expr =>
  call("Context", [language, ...facets].map((value) => ({ value })));

export function readRealization(pack: string, e: Call): Realization {
  const [pattern] = positional(e);
  const body = named(e, "body");
  if (pattern === undefined || body === undefined) throw new PackError(pack, `a Realization needs a pattern and body=: ${format(e)}`);
  const flag = (name: string, fallback: boolean): boolean => {
    const v = named(e, name);
    return typeof v === "boolean" ? v : fallback;
  };
  const properties = named(e, "properties");
  const ctx = named(e, "context");
  const resultContext = named(e, "resultContext");
  return {
    pattern,
    ...(ctx === undefined ? {} : { context: ctx }),
    body,
    properties: properties !== undefined && isCall(properties) ? positional(properties) : [],
    evaluateArguments: flag("evaluateArguments", true),
    evaluateResult: flag("evaluateResult", false),
    ...(resultContext === undefined ? {} : { resultContext }),
  };
}

function readRelation(e: Expr): Relation {
  if (isCall(e) && e.head === "Relation") {
    const [claim] = positional(e);
    const ctx = named(e, "context");
    return ctx === undefined ? { claim } : { claim, context: ctx };
  }
  return { claim: e };
}

/** A pack's text as the units it seeds. */
export function parsePack(text: string, name: string): Pack {
  const requires: string[] = [];
  const units = new Map<string, { relations: Relation[]; realizations: Realization[] }>();
  const unit = (identity: string) => {
    let u = units.get(identity);
    if (!u) units.set(identity, (u = { relations: [], realizations: [] }));
    return u;
  };
  let language: Expr | undefined;
  const needLanguage = (form: string): Expr => {
    if (language === undefined) throw new PackError(name, `${form} needs a Language(...) before it`);
    return language;
  };
  const headOf = (form: string, pattern: Expr): string => {
    if (!isCall(pattern)) throw new PackError(name, `${form} needs a call pattern, got ${format(pattern)}`);
    return pattern.head;
  };

  for (const form of parseMany(text)) {
    if (!isCall(form)) throw new PackError(name, `expected a form, got ${format(form)}`);
    const args = positional(form);
    switch (form.head) {
      case "Requires":
        for (const r of args) requires.push(packName(isCall(r) ? r.head : String(r)));
        break;
      case "Language":
        language = args[0];
        break;
      case "Concept": {
        const [id, ...rest] = form.args;
        if (!id || !isCall(id.value) || id.value.args.length) throw new PackError(name, `Concept needs a name like Game(), got ${format(form).slice(0, 80)}`);
        const u = unit(id.value.head);
        for (const a of rest) {
          if (isCall(a.value) && a.value.head === "Realization") u.realizations.push(readRealization(name, a.value));
          else u.relations.push(readRelation(a.value));
        }
        break;
      }
      case "Compiled": {
        const [pattern, template] = args;
        if (typeof template !== "string") throw new PackError(name, `Compiled needs a template string: ${format(form).slice(0, 80)}`);
        unit(headOf("Compiled", pattern)).realizations.push({
          pattern,
          context: context(needLanguage("Compiled"), call("Compiled")),
          body: templateParts(template),
          properties: [],
          evaluateArguments: true,
          evaluateResult: false,
        });
        break;
      }
      case "Prelude": {
        const [helpers] = args;
        if (typeof helpers !== "string") throw new PackError(name, "Prelude needs its source as a string");
        unit("Prelude").realizations.push({
          pattern: call("Prelude"),
          context: context(needLanguage("Prelude"), call("Compiled")),
          body: helpers,
          properties: [],
          evaluateArguments: true,
          evaluateResult: false,
        });
        break;
      }
      case "From": {
        const [pattern, output] = args;
        if (output === undefined) throw new PackError(name, `From needs a pattern and what it reads as: ${format(form).slice(0, 80)}`);
        unit(headOf("From", pattern)).realizations.push({
          pattern,
          context: context(needLanguage("From"), call("Reading")),
          body: output,
          properties: [],
          evaluateArguments: false,
          evaluateResult: false,
        });
        break;
      }
      case "To": {
        const [pattern, ...rest] = args;
        const statement = rest.length === 2 && isCall(rest[0]) && rest[0].head === "Statement";
        const output = rest[rest.length - 1];
        if (output === undefined || (rest.length === 2 && !statement)) throw new PackError(name, `To needs a pattern, optionally Statement(), and a template: ${format(form).slice(0, 80)}`);
        const facets = statement ? [call("Writing"), call("Statement")] : [call("Writing")];
        unit(headOf("To", pattern)).realizations.push({
          pattern,
          context: context(needLanguage("To"), ...facets),
          body: output,
          properties: [],
          evaluateArguments: false,
          evaluateResult: false,
        });
        break;
      }
      default:
        throw new PackError(name, `unknown form ${form.head}(...); a pack holds Requires, Language, Concept, Compiled, Prelude, From and To`);
    }
  }
  return {
    name,
    requires,
    units: [...units].map(([identity, u]) => ({ identity, relations: u.relations, realizations: u.realizations })),
  };
}

/* ------------------------------------------------------------------ *
 * Writing a pack: the IR, laid out for a person to read and edit.
 * ------------------------------------------------------------------ */

// Raw only where it reads better and round-trips: multiline, and no quote at the end to run
// into the closing triple.
const text = (s: string): string =>
  s.includes("\n") && !s.includes('"""') && !s.endsWith('"') ? `"""${s}"""` : JSON.stringify(s);

const flat = (e: Expr): string => {
  if (typeof e === "string") return text(e);
  if (!isCall(e)) return format(e);
  return `${e.head}(${e.args.map((a) => (a.name === undefined ? flat(a.value) : `${a.name}=${flat(a.value)}`)).join(", ")})`;
};

/** An expression as a pack writes it, laid out by the .ncon rules (code/format.ts). */
export const pretty = (e: Expr): string => formatNcon(flat(e)).trimEnd();

/** A realization as the expression a pack writes it as, settings before its body. */
export function realizationExpr(r: Realization): Expr {
  return call("Realization", [
    { value: r.pattern },
    ...(r.context === undefined ? [] : [{ name: "context", value: r.context }]),
    ...(r.evaluateArguments ? [] : [{ name: "evaluateArguments", value: false }]),
    ...(r.evaluateResult ? [{ name: "evaluateResult", value: true }] : []),
    ...(r.resultContext === undefined ? [] : [{ name: "resultContext", value: r.resultContext }]),
    ...(r.properties.length ? [{ name: "properties", value: call("List", r.properties.map((value) => ({ value }))) }] : []),
    { name: "body", value: r.body },
  ]);
}

/** A realization with its settings before its body. */
function realizationText(r: Realization): string {
  const parts: string[] = [flat(r.pattern)];
  if (r.context !== undefined) parts.push(`context=${flat(r.context)}`);
  if (!r.evaluateArguments) parts.push("evaluateArguments=false");
  if (r.evaluateResult) parts.push("evaluateResult=true");
  if (r.resultContext !== undefined) parts.push(`resultContext=${flat(r.resultContext)}`);
  if (r.properties.length) parts.push(`properties=List(${r.properties.map(flat).join(", ")})`);
  return `Realization(${parts.join(", ")}, body=${flat(r.body)})`;
}

const relationExpr = (r: Relation): Expr =>
  r.context === undefined ? r.claim : call("Relation", [{ value: r.claim }, { name: "context", value: r.context }]);

/** A unit as a pack writes it: its name, then its relations and realizations. */
export function unitText(u: ConceptUnit): string {
  const parts = [
    ...u.relations.map((r) => flat(relationExpr(r))),
    ...u.realizations.filter((r) => !r.retired).map(realizationText),
  ];
  return formatNcon(`Concept(${[`${u.identity}()`, ...parts].join(", ")})`).trimEnd();
}

/** A pack's text: `Requires`, then each unit, with any comment it carries above it. */
export function formatPack(
  units: readonly ConceptUnit[],
  options: { header?: string; requires?: readonly string[]; comments?: ReadonlyMap<string, string> } = {},
): string {
  const out: string[] = [];
  if (options.header) out.push(options.header.trimEnd(), "");
  if (options.requires?.length) {
    const name = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
    out.push(`Requires(${options.requires.map((p) => `${name(p)}()`).join(", ")})`, "");
  }
  for (const u of units) {
    const comment = options.comments?.get(u.identity);
    if (comment) out.push(comment.trimEnd());
    out.push(unitText(u), "");
  }
  return formatNcon(out.join("\n"));
}

/* ------------------------------------------------------------------ *
 * Loading and seeding.
 * ------------------------------------------------------------------ */

/** The packs that ship with the runtime. */
export const BUILT_IN_PACKS = fileURLToPath(new URL("../../packs/", import.meta.url));

/** Every `.ncon` in these directories, each after the packs it requires. */
export function loadPacks(dirs: readonly string[]): Pack[] {
  const found = new Map<string, Pack>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ncon")).sort()) {
      const name = packName(basename(file, ".ncon"));
      if (found.has(name)) throw new PackError(name, `defined twice, the second in ${dir}`);
      found.set(name, parsePack(readFileSync(join(dir, file), "utf8"), name));
    }
  }
  const ordered: Pack[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, from?: string) => {
    const pack = found.get(name);
    if (!pack) throw new PackError(from ?? name, `requires ${name}, which is not in ${dirs.join(" or ")}`);
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") throw new PackError(name, "requires itself through its requirements");
    state.set(name, "visiting");
    for (const r of pack.requires) visit(r, name);
    state.set(name, "done");
    ordered.push(pack);
  };
  for (const name of [...found.keys()].sort()) visit(name);
  return ordered;
}

export interface PackReport {
  created: number;
  updated: number;
  relations: number;
  realizations: number;
  retired: number;
  removed: number;
}

/** Seed each pack in order, as the origin of what it adds, and take back what it dropped. */
export function seedPacks(store: ConceptStore, packs: readonly Pack[]): PackReport {
  const report: PackReport = { created: 0, updated: 0, relations: 0, realizations: 0, retired: 0, removed: 0 };
  for (const pack of packs) {
    for (const unit of pack.units) {
      const r = store.seed(unit, { authoritative: true, pack: pack.name });
      if (r.created) report.created += 1;
      else if (r.addedRelations || r.addedRealizations) report.updated += 1;
      report.relations += r.addedRelations;
      report.realizations += r.addedRealizations;
    }
    const pruned = store.prunePack(pack.name, pack.units);
    report.retired += pruned.retired;
    report.removed += pruned.removed;
  }
  return report;
}

