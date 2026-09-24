// @ts-check
/**
 * What a Concept is, for hovering it: read from the packs that define it (the comment above
 * its `Concept(...)`, its relations, its realizations' patterns and contexts) and from a
 * saved graph (what was learned about it since).
 */
const { scan } = require("./scan.js");

/**
 * @typedef {{ pattern: string, context?: string, properties?: string }} Signature
 * @typedef {{ file: string, line: number, comment: string, relations: string[], realizations: Signature[] }} Definition
 */

/** The top-level arguments of the call whose `(` is at `open`, as text slices. */
function argumentsOf(text, marks, openIndex) {
  const open = marks[openIndex];
  const parts = [];
  let from = open.end;
  for (let i = openIndex + 1; i < marks.length; i++) {
    const m = marks[i];
    if (m.kind === "comma" && m.depth === open.depth) {
      parts.push(text.slice(from, m.start).trim());
      from = m.end;
    } else if (m.kind === "close" && m.depth === open.depth) {
      parts.push(text.slice(from, m.start).trim());
      return { parts: parts.filter(Boolean), end: i };
    }
  }
  return { parts: parts.filter(Boolean), end: marks.length };
}

/** The comment lines right above a line, without section banners and file headers. */
function commentAbove(lines, line) {
  const out = [];
  for (let l = line - 1; l >= 0; l--) {
    const t = lines[l].trim();
    if (!t.startsWith("//")) break;
    if (/^\/\/\s*(={4,}|-{4,})/.test(t)) break;
    out.unshift(t.replace(/^\/\/ ?/, ""));
  }
  return out.join("\n").trim();
}

/** Named arguments of a call's text, and its first positional argument. */
function splitCall(text) {
  const { marks } = scan(text);
  const open = marks.findIndex((m) => m.kind === "open");
  if (open < 0) return { first: text, named: {} };
  const { parts } = argumentsOf(text, marks, open);
  /** @type {Record<string, string>} */
  const named = {};
  let first = "";
  for (const p of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*([\s\S]*)$/.exec(p);
    if (m) named[m[1]] = m[2];
    else if (!first) first = p;
  }
  return { first, named };
}

const oneLine = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

/**
 * Every Concept a pack defines.
 * @param {string} text
 * @param {string} file
 * @returns {Map<string, Definition[]>}
 */
function indexPack(text, file) {
  /** @type {Map<string, Definition[]>} */
  const out = new Map();
  const { marks } = scan(text);
  const lines = text.split("\n");
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === "\n") starts.push(k + 1);
  const lineOf = (/** @type {number} */ offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.kind !== "form" || text.slice(m.start, m.end) !== "Concept") continue;
    let open = i + 1;
    while (open < marks.length && marks[open].kind !== "open") open++;
    const { parts, end } = argumentsOf(text, marks, open);
    i = end;
    const name = /^([A-Za-z0-9_]+)\(\s*\)$/.exec(parts[0] ?? "")?.[1];
    if (!name) continue;
    /** @type {Definition} */
    const def = { file, line: lineOf(m.start), comment: commentAbove(lines, lineOf(m.start)), relations: [], realizations: [] };
    for (const p of parts.slice(1)) {
      if (p.startsWith("Realization(")) {
        const { first, named } = splitCall(p);
        def.realizations.push({ pattern: oneLine(first), context: named.context && oneLine(named.context), properties: named.properties && oneLine(named.properties) });
      } else def.relations.push(oneLine(p));
    }
    out.set(name, [...(out.get(name) ?? []), def]);
  }
  return out;
}

/**
 * What a saved graph holds about a Concept: its relations, as claims.
 * @param {{ units?: { identity: string, relations?: (string | { claim: string, context?: string })[] }[] }} graph
 */
function indexGraph(graph) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const u of graph.units ?? []) {
    const claims = (u.relations ?? []).map((r) => (typeof r === "string" ? r : r.context ? `${r.claim} in ${r.context}` : r.claim));
    if (claims.length) out.set(u.identity, claims);
  }
  return out;
}

/**
 * The pack format's own forms (code/ncon.ts). They are not Concepts, so no pack defines them,
 * but their shape is fixed: what each is for, and what its named arguments mean.
 * @type {Record<string, { signature: string, doc: string, named?: Record<string, string>, kind?: string }>}
 */
const PACK_FORMS = {
  Code: {
    kind: "realization body",
    signature: 'Code(ir = Lambda(...), source = """...""", language = "JavaScript")',
    doc: "A body that runs rather than composes (concept-spec Part 17.1): a program the runtime executes, not Concepts it evaluates one by one. The IR is the source of truth; its JavaScript is written from it by the language pack's To rules, once per body, and cached (code/write.ts).",
    named: {
      ir: "The program in the code IR, usually `Lambda(List($args, $bindings, $api), ...)`. Written to the host's language when first run; portable to any host with a language pack for it.",
      source: "The program as source text in `language`, in a raw string, run as it is. When present it is used instead of `ir`, and a host runs it only if it speaks that language.",
      language: 'What `source` is written in. Absent means `"JavaScript"`. The same pattern can carry a body per language, and a host skips the ones it cannot run.',
    },
  },
  Concept: {
    signature: "Concept(Name(), relation..., Realization(...)...)",
    doc: "A Concept in a pack: its name, then what holds of it and how it is realized. Any argument that is not a `Realization(...)` is a relation.",
  },
  Realization: {
    signature: "Realization($pattern, context = ..., body = ..., properties = List(...), evaluateArguments = false, evaluateResult = true, resultContext = ...)",
    doc: "One way the Concept is realized: the shape of call it handles (`pattern`), where it applies, and what it does.",
    named: {
      context: "The usage context it applies in, e.g. `Execution()`. Absent means any context.",
      body: "What it does: composed Concepts, or `Code(ir = ...)` / `Code(source = \"\"\"...\"\"\")`.",
      properties: "Declared properties, e.g. `List(Compile())`, `Effectful()`.",
      evaluateArguments: "`false`: the arguments reach the body as written, unevaluated. Default `true`.",
      evaluateResult: "`true`: what the body gives back is evaluated again. Default `false`.",
      resultContext: "The context the body is evaluated in, instead of the one the call was reached in.",
    },
  },
  Relation: {
    signature: "Relation($claim, context = ...)",
    doc: "A relation that holds only in some context. One that holds everywhere is written bare.",
    named: { context: "Where the claim holds." },
  },
  Requires: { signature: "Requires(Pack()...)", doc: "The packs loaded before this one." },
  Language: { signature: "Language(Name())", doc: "The language the `Compiled`, `Prelude`, `From` and `To` rules after it are for." },
  Compiled: {
    signature: 'Compiled($pattern, "template")',
    doc: "What a primitive compiles to: the language's source with `$name` where the code for an argument goes. Read as a template, never run.",
  },
  Prelude: { signature: 'Prelude("""helpers""")', doc: "The helpers every compiled body starts with, which the templates call." },
  From: {
    signature: "From($pattern, $concepts)",
    doc: "How the language reads: a syntax node matching the pattern reads as the Concepts given. The most specific rule applies first.",
  },
  To: { signature: 'To($pattern, "template")', doc: "How a Concept is written in the language." },
};

/** A pack form's hover. @param {string} name */
function describeForm(name) {
  const form = PACK_FORMS[name];
  if (!form) return undefined;
  const md = [`**${name}**  ·  _${form.kind ?? "pack form"}_`, form.doc, "`" + form.signature + "`"];
  if (form.named) md.push(Object.entries(form.named).map(([k, v]) => `- \`${k}\`: ${v}`).join("\n"));
  return md.join("\n\n---\n\n");
}

/**
 * A hover's markdown for a Concept. One no pack defines says so: a call to it has nothing to run.
 * @param {string} name
 * @param {Definition[]} defs
 * @param {string[]} learned relations the graph holds beyond what the packs say
 * @param {string | undefined} operator
 */
function describe(name, defs, learned, operator, asConcept = false) {
  if (asConcept) return describePlain(name, defs, learned, operator);
  const form = describeForm(name);
  if (form) return defs.length ? `${form}\n\n---\n\n${describe(`${name} (as a Concept)`, defs, learned, operator, true)}` : form;
  if (!defs.length && !learned.length && !operator) return `**${name}** · not defined in any pack, and the graph knows nothing about it`;
  return describePlain(name, defs, learned, operator);
}

/** @param {string} name @param {Definition[]} defs @param {string[]} learned @param {string | undefined} operator */
function describePlain(name, defs, learned, operator) {
  const md = [];
  const where = [...new Set(defs.map((d) => d.file))].join(", ");
  md.push(`**${name}**${where ? `  ·  _${where}_` : ""}${operator ? `  ·  \`${operator}\`` : ""}`);
  const comments = defs.map((d) => d.comment).filter(Boolean);
  if (comments.length) md.push(comments.join("\n\n"));
  const relations = [...new Set(defs.flatMap((d) => d.relations))];
  if (relations.length) md.push(relations.map((r) => `\`${r}\``).join("  "));
  const sigs = defs.flatMap((d) => d.realizations);
  if (sigs.length) {
    const shown = sigs.slice(0, 8).map((s) => `- \`${s.pattern}\`${s.context ? ` in \`${s.context}\`` : ""}${s.properties ? ` · ${s.properties}` : ""}`);
    if (sigs.length > 8) shown.push(`- and ${sigs.length - 8} more`);
    md.push(shown.join("\n"));
  }
  const extra = learned.filter((c) => !relations.includes(c));
  if (extra.length) md.push(`_Learned:_ ${extra.slice(0, 10).map((c) => `\`${c}\``).join("  ")}${extra.length > 10 ? ` and ${extra.length - 10} more` : ""}`);
  return md.join("\n\n---\n\n");
}

module.exports = { indexPack, indexGraph, describe, PACK_FORMS };
