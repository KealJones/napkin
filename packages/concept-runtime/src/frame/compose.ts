/**
 * Reading a row of words by their holes, with no sentence shapes.
 *
 * Each word is what it can be (a thing, a doing, how something is, a word that puts something
 * with something, a word that says what something is, whose, which, how much, not, a mark of how
 * it is said), from its senses in the graph and what the tagger takes it for. What each kind of
 * word takes is the graph's own: `ReadDoing HasHole("Doer", ReadThing())` (packs/reading.ncon).
 * Two neighbouring pieces join when one has an open hole the other fits, from either side; every
 * way the whole row joins into one is built and weighed, by the holes filled and by which side
 * each was filled from (`ReadingByHoles Weighs("ReadDoing.Doer:before", 1)`: a weight, learned,
 * not a rule). What the best reading says is then kept or asked (frame/frames.ts).
 */
import { type Expr, c, call, isCall } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";
import type { Sense } from "./senses.js";

export interface Piece {
  readonly role: string;
  /** What it names: the Concept, or for a value the value. */
  readonly head: string;
  readonly value?: Expr;
  /** A question word: what it stands for is what is asked. */
  readonly ask?: boolean;
  readonly word: number;
  readonly text: string;
  /** A doing whose hole is a whole statement ("remember", "said", "think"). */
  readonly takes?: boolean;
  /** A relation the word names ("name", "age", "capital"): said of an owner, it is a fact of that owner. */
  readonly relation?: boolean;
  /** Taken from what the tagger guesses, though the graph has senses of the word: weighed less than a sense. */
  readonly guessed?: boolean;
  /** A computation the word stands for (senses.ts "op"): what runs, how many it takes, how tightly it binds. */
  readonly op?: { readonly target: string; readonly arity: number; readonly binds: number; readonly right: boolean; readonly takes?: readonly string[] };
  readonly fills: readonly { hole: string; side: "before" | "after"; piece: Piece }[];
}

export interface Composed {
  readonly piece: Piece;
  readonly score: number;
  readonly features: readonly string[];
}

interface Holes {
  readonly takes: Map<string, string[]>;
  readonly repeats: Set<string>;
}

const holesOf = (store: ConceptStore, role: string): Holes => {
  const takes = new Map<string, string[]>();
  const repeats = new Set<string>();
  for (const t of store.asSubject(role)) {
    if (!isCall(t.expr)) continue;
    const [a, b] = t.expr.args.map((x) => x.value);
    if (t.predicate === "HasHole" && typeof a === "string" && b !== undefined && isCall(b)) takes.set(a, [...(takes.get(a) ?? []), b.head]);
    if (t.predicate === "Repeats" && typeof a === "string") repeats.add(a);
  }
  return { takes, repeats };
};

const weightsOf = (store: ConceptStore): Map<string, number> => {
  const out = new Map<string, number>();
  for (const t of store.asSubject("ReadingByHoles")) {
    if (t.predicate !== "Weighs" || !isCall(t.expr)) continue;
    const [k, v] = t.expr.args.map((x) => x.value);
    if (typeof k === "string" && typeof v === "number") out.set(k, v);
  }
  return out;
};

/** What a word can be, as pieces: from its senses, then from what the tagger takes it for. */
export function piecesOf(word: { text: string; senses: readonly Sense[] }, at: number, tags: readonly string[], pointed?: string): Piece[] {
  const out: Piece[] = [];
  const add = (role: string, head: string, extra: Partial<Piece> = {}) => {
    if (!out.some((p) => p.role === role && p.head === head && p.op?.arity === extra.op?.arity)) out.push({ role, head, word: at, text: word.text, fills: [], ...extra });
  };
  const has = (t: string) => tags.includes(t);
  for (const s of word.senses) {
    if (s.type === "entity" || s.type === "kind") add("ReadThing", s.head);
    else if (s.type === "relation" && !s.inverse) {
      const held = out.findIndex((p) => p.role === "ReadThing" && p.head === s.head);
      if (held >= 0) out[held] = { ...out[held]!, relation: true };
      else add("ReadThing", s.head, { relation: true });
    }
    else if (s.type === "value") {
      const head = typeof s.value === "number" ? String(s.value) : isCall(s.value) ? s.value.head : String(s.value);
      add("ReadThing", head, { value: s.value });
      if (typeof s.value === "number") add("ReadCount", head, { value: s.value });
    }
    else if (s.type === "op") add("ReadOp", s.target, { op: { target: s.target, arity: s.holes.length, binds: s.binds, right: s.right, takes: s.holes } });
    else if (s.type === "pointer") add("ReadThing", pointed ?? nameOf(word.text));
    else if (s.type === "question") {
      add("ReadThing", s.head, { ask: true });
      // A question word that asks an amount ("how many", "how much") asks how many of a thing: its count.
      if (s.kinds.includes("Amount")) add("ReadCount", s.head, { ask: true });
    }
    else if (s.type === "owner") add("ReadOwning", s.head);
    else if (s.type === "takes") add("ReadDoing", s.head, { takes: true });
    else if (s.type === "glue") {
      if (s.copula) add("ReadSame", s.head);
      else if (s.head === "And" || s.head === "Comma") add("ReadJoining", s.head);
      else if (/^(A|An|The)$/.test(s.head)) add("ReadDetermining", s.head);
      else if (s.helper) add("ReadAspect", s.head);
      else add("ReadLink", s.head);
    }
  }
  // What the graph knows of the word comes first; what the tagger guesses beside it is weighed less.
  // A word that is a number ("two") is that number, not the computation that reads it.
  if (out.some((p) => p.value !== undefined)) for (let i = out.length - 1; i >= 0; i--) if (out[i]!.op && out[i]!.op!.arity === 1 && out[i]!.op!.target === "Number") out.splice(i, 1);
  const known = out.length;
  const base = nameOf(lemma(word.text.toLowerCase()) || word.text);
  const said = nameOf(word.text);
  if (has("Particle")) add("ReadParticle", said);
  if (has("Date")) add("ReadTime", said);
  if (has("Copula")) add("ReadSame", said);
  else if (has("Auxiliary") || has("Modal")) add("ReadAspect", said);
  else if (has("Verb") && !has("Particle")) add("ReadDoing", base);
  if (has("Adjective")) add("ReadQuality", said);
  if (has("Adverb")) add("ReadDegree", said);
  if (has("Negative")) add("ReadNegation", said);
  if (has("Determiner") && !has("Possessive")) add("ReadDetermining", said);
  if (has("Possessive") && !out.some((p) => p.role === "ReadOwning")) add("ReadOwning", nameOf(word.text.replace(/['’]s?$/i, "")));
  if (has("Preposition") && !out.some((p) => p.role === "ReadLink")) add("ReadLink", said);
  if (has("Conjunction")) add("ReadJoining", said);
  if (has("Expression") || has("Interjection")) add("ReadMarker", said);
  if ((has("Noun") || has("Pronoun") || has("Value") || has("ProperNoun")) && !has("Possessive") && !out.some((p) => p.role === "ReadThing")) add("ReadThing", has("Plural") ? said : base);
  // Nothing known of it, and the tagger says nothing: something, not looked up yet.
  if (!out.length) add("ReadThing", said);
  // A guess of the same Concept a sense names ("live", a relation the graph holds, guessed a doing) is no guess.
  const heads = new Set(out.slice(0, known).filter((p) => !p.op).map((p) => p.head));
  return known ? out.map((p, i) => (i < known || (p.role === "ReadDoing" && heads.has(p.head)) ? p : { ...p, guessed: true })) : out;
}

/** Every way a row of words joins into one, best first. */
export function compose(store: ConceptStore, row: readonly Piece[][], keep = 6): Composed[] {
  const n = row.length;
  if (!n) return [];
  const holes = new Map<string, Holes>();
  const holesFor = (role: string) => {
    let h = holes.get(role);
    if (!h) holes.set(role, (h = holesOf(store, role)));
    return h;
  };
  const weights = weightsOf(store);
  const at = new Map<string, Composed[]>();
  const put = (i: number, j: number, x: Composed) => {
    const key = `${i},${j}`;
    const list = at.get(key) ?? [];
    // The same reading built in another order is one reading.
    const same = list.findIndex((y) => shape(y.piece) === shape(x.piece));
    if (same >= 0) {
      if (list[same]!.score >= x.score) return;
      list.splice(same, 1);
    }
    list.push(x);
    list.sort((a, b) => b.score - a.score);
    at.set(key, list.slice(0, keep));
  };
  row.forEach((pieces, i) => {
    // A sense named as the word is ("name" Name, not DeclaresName) a little ahead of the others.
    for (const p of pieces) put(i, i + 1, { piece: p, score: (p.guessed ? -1.5 : 0) + (p.head === nameOf(lemma(p.text.toLowerCase()) || p.text) ? 0.1 : 0), features: [`as:${p.text.toLowerCase()}=${p.role}`] });
  });
  // One piece takes another into an open hole: the taker keeps its place as what the two are.
  const take = (taker: Composed, taken: Composed, side: "before" | "after"): Composed[] => {
    const h = holesFor(taker.piece.role);
    const out: Composed[] = [];
    for (const [hole, kinds] of h.takes) {
      if (!kinds.includes(taken.piece.role)) continue;
      if (!h.repeats.has(hole) && taker.piece.fills.some((f) => f.hole === hole)) continue;
      // A computation is joined to what came before only from in front ("and plus 3"), not to a list.
      if (taker.piece.op && hole === "Also" && (side === "after" || filled(taken.piece, "With").length)) continue;
      // Things joined bind closer than what a word puts with them: in "the sum of 1, 2 and 3" the list is what "of" puts in.
      if (hole === "Also" && side === "after" && taker.piece.fills.some((f) => f.hole === "Where" && f.side === "after")) continue;
      // Doings are joined to doings, things to things ("make a list and add milk").
      if (hole === "Also" && taken.piece.role === "ReadJoining" && filled(taken.piece, "With").some((w) => (w.role === "ReadDoing") !== (taker.piece.role === "ReadDoing"))) continue;
      // A joining word put with a thing joins something to it ("3, 1 and 2"), not nothing.
      if (taken.piece.role === "ReadJoining" && taker.piece.role === "ReadThing" && !filled(taken.piece, "With").length) continue;
      // A computation whose holes are all typed (a Number, a Duration) takes no plain thing ("in the box" is not a conversion).
      if (taker.piece.op?.takes?.every((k) => k !== "Concept") && taken.piece.role === "ReadThing" && taken.piece.value === undefined && !taken.piece.ask && (hole === "Operand" || hole === "Where")) {
        const what = hole === "Where" ? filled(taken.piece, "What")[0] : taken.piece;
        if (!what || (what.value === undefined && !what.op)) continue;
      }
      // A computation is taken whole: one still short of what it takes is not another's operand.
      if ((taker.piece.op || taker.piece.role === "ReadLink") && taken.piece.op && operandsOf(taken.piece).length < taken.piece.op.arity) continue;
      // A computation takes as many as it has holes for, by its operands and the words that mark one ("of", "from").
      const op = taker.piece.op;
      if (op && (hole === "Operand" || hole === "Where") && operandsOf(taker.piece).length >= op.arity) continue;
      if (op && hole === "Where" && !filled(taken.piece, "What").length) continue;
      // Which computation takes its neighbour first is the graph's (Binds): a looser one inside a tighter one costs.
      let precedence = 0;
      const inner = taken.piece.op ?? (hole === "Where" ? filled(taken.piece, "What")[0]?.op : undefined);
      if (op && inner && inner.arity === 2 && (taken.piece.op ? taken.piece : filled(taken.piece, "What")[0]!).fills.length > 0) {
        if (inner.binds < op.binds || (inner.binds === op.binds && (side === "after" ? !op.right : op.right))) precedence -= 1;
      }
      // What is taken from one side is taken outward of what is already taken from that side.
      const feature = `${taker.piece.role}.${hole}:${side}`;
      // What a question asks for is said first, wherever it would stand told: weighed apart.
      const asked = asks(taken.piece) ? [`${feature}:ask`] : [];
      // Said first in the message ("is tom taller…", "did you…"), a word may take differently: weighed apart too.
      if (taker.piece.word === 0) asked.push(`${feature}:lead`);
      // A doing that takes a whole statement takes one more readily than another doing does.
      if (taker.piece.takes) asked.push(`${feature}:takes`);
      // Taken outward of another taken from the same side ("is tom taller": "taller" after "tom").
      if (taker.piece.fills.some((f) => f.side === side)) asked.push(`${feature}:outer`);
      // What kind of piece filled it, weighed apart ("of" takes a thing more readily than a whole saying).
      asked.push(`${feature}=${taken.piece.role}`);
      // A marking word taken with nothing it marks ("who was jaws directed by") is taken less readily.
      if (taken.piece.role === "ReadLink" && !filled(taken.piece, "What").length) asked.push(`${feature}:empty`);
      const w = [feature, ...asked].reduce((sum, f) => sum + (weights.get(f) ?? 0), 0);
      out.push({
        piece: { ...taker.piece, fills: [...taker.piece.fills, { hole, side, piece: taken.piece }] },
        score: taker.score + taken.score + 1 + w + precedence,
        features: [...taker.features, ...taken.features, feature, ...asked],
      });
    }
    return out;
  };
  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      for (let k = i + 1; k < j; k++) {
        for (const a of at.get(`${i},${k}`) ?? []) {
          for (const b of at.get(`${k},${j}`) ?? []) {
            for (const x of take(a, b, "after")) put(i, j, x);
            for (const x of take(b, a, "before")) put(i, j, x);
          }
        }
      }
    }
  }
  // A computation left short of what it takes ("sort" read as taking two, given one) is weighed
  // below one that took all it needs; a joined list of as many as it takes counts as them.
  const short = (p: Piece): number => {
    const given = p.op ? operandsOf(p) : [];
    const many = given.length === 1 && p.op ? listed(given[0]!.piece) : 0;
    // A list of more than it takes is spread over it a little less readily than one that fits.
    const own = !p.op ? 0 : p.op.arity > 1 && many >= p.op.arity ? (many === p.op.arity ? 0 : 0.5) : Math.max(0, p.op.arity - given.length);
    return own + p.fills.reduce((sum, f) => sum + short(f.piece), 0);
  };
  return (at.get(`0,${n}`) ?? []).map((x) => ({ ...x, score: x.score - 0.6 * short(x.piece) })).sort((a, b) => b.score - a.score);
}

/** How many things a piece joins ("3, 1 and 2" is three), one if it joins none. */
export const listed = (p: Piece): number => 1 + p.fills.filter((f) => f.hole === "Also").reduce((sum, f) => sum + filled(f.piece, "With").reduce((n, w) => n + listed(w), 0), 0);

/** A reading written out, its fills in a fixed order: two built in different orders are the same. */
export const shape = (p: Piece): string => `${p.role}:${p.word}:${p.head}${p.op ? "/" + p.op.arity : ""}${p.fills.length ? "(" + p.fills.map((f) => `${f.hole}${f.side === "before" ? "<" : ">"}${shape(f.piece)}`).sort().join(",") + ")" : ""}`;

/** What a computation takes, in the order it is said: its operands, and what a marking word ("of", "from") puts in. */
export const operandsOf = (p: Piece): { piece: Piece; link?: Piece; at: number }[] =>
  p.fills
    .flatMap((f) => (f.hole === "Operand" ? [{ piece: f.piece, at: f.piece.word }] : f.hole === "Where" ? filled(f.piece, "What").map((w) => ({ piece: w, link: f.piece, at: f.piece.word })) : []))
    .sort((a, b) => a.at - b.at);

/** The pieces filling a hole of a piece. */
export const filled = (p: Piece, hole: string): Piece[] => p.fills.filter((f) => f.hole === hole).map((f) => f.piece);

/** A thing as a Concept: its describers and its own word as one name ("nice tree" NiceTree), a count as a Quantity. */
export function thingOf(p: Piece): Expr {
  // A month with a day beside it ("june 3rd", "3rd of june"): the date.
  if (p.value !== undefined && isCall(p.value) && p.value.head === "Date" && !p.value.args.some((a) => a.name === "day")) {
    const day = [...filled(p, "Count"), ...filled(p, "Name"), ...filled(p, "Operand")].find((x) => typeof x.value === "number");
    if (day) return call("Date", [...p.value.args, { name: "day", value: day.value! }]);
  }
  // A day with its month beside it ("3rd" named by "june", "12th of may"): the date.
  if (typeof p.value === "number") {
    const month = [...filled(p, "Name"), ...filled(p, "Where").flatMap((l) => filled(l, "What"))].find((x) => x.value !== undefined && isCall(x.value) && x.value.head === "Date");
    if (month && isCall(month.value!)) return call("Date", [...(month.value as { args: readonly { name?: string; value: Expr }[] }).args, { name: "day", value: p.value }]);
  }
  if (p.value !== undefined) return p.value;
  const describers = filled(p, "Describer").map((d) => d.text);
  const count = filled(p, "Count").find((x) => x.value !== undefined && typeof x.value === "number");
  const name = nameOf([...describers, p.fills.length ? p.text : p.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2")].join(" "));
  const head = describers.length ? name : p.head;
  return count ? call("Quantity", [{ value: count.value! }, { name: "unit", value: c(nameOf([...describers, p.text].join(" "))) }]) : c(head);
}

/** Whether a question word stands anywhere in the reading. */
export const asks = (p: Piece): boolean => !!p.ask || p.fills.some((f) => asks(f.piece));
