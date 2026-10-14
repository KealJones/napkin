/**
 * The company a word keeps, learned from what it is read in: each word's neighbours (the words a
 * place or two either side, numbers as one) and the words of its sentence. Two words that keep the
 * same company are used the same way ("spent $5 on" and "paid $5 for"), so what is learned of one
 * counts, as far as they are alike, for the other. Nothing here says what any word is; it is
 * counted from text.
 */

type Profile = Map<string, number>;

const tokens = (text: string): string[] => (text.toLowerCase().match(/\$?\d[\d,.]*%?|[a-z]+(?:'[a-z]+)?/g) ?? []).map((t) => (/\d/.test(t) ? "#" : t));

export class Company {
  private readonly profiles = new Map<string, Profile>();
  private readonly norms = new Map<string, number>();
  private readonly seen = new Map<string, number>();

  /** Reads a text: each word's neighbours, by where they stand, and its sentence's words, less. */
  read(text: string): void {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const t = tokens(sentence);
      const bag = new Set(t);
      t.forEach((w, i) => {
        if (w === "#") return;
        const p = this.profiles.get(w) ?? new Map<string, number>();
        for (const d of [-2, -1, 1, 2]) {
          const n = t[i + d];
          if (n !== undefined) p.set(`${d}:${n}`, (p.get(`${d}:${n}`) ?? 0) + (Math.abs(d) === 1 ? 1 : 0.5));
        }
        for (const n of bag) if (n !== w) p.set(`s:${n}`, (p.get(`s:${n}`) ?? 0) + 0.2);
        this.profiles.set(w, p);
        this.seen.set(w, (this.seen.get(w) ?? 0) + 1);
      });
    }
    this.norms.clear();
  }

  /** How often a word was read. */
  count(word: string): number {
    return this.seen.get(word) ?? 0;
  }

  /** Each context weighed by how much it tells (a context every word has tells little). */
  private weight(): Map<string, number> {
    if (this.idf) return this.idf;
    const df = new Map<string, number>();
    for (const p of this.profiles.values()) for (const k of p.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    const n = this.profiles.size;
    this.idf = new Map([...df].map(([k, d]) => [k, Math.log(1 + n / d)]));
    return this.idf;
  }
  private idf?: Map<string, number>;

  private norm(w: string): number {
    const had = this.norms.get(w);
    if (had !== undefined) return had;
    const idf = this.weight();
    let s = 0;
    for (const [k, v] of this.profiles.get(w) ?? []) s += (v * (idf.get(k) ?? 0)) ** 2;
    const r = Math.sqrt(s);
    this.norms.set(w, r);
    return r;
  }

  /** How alike two words are used, 0 to 1. */
  alike(a: string, b: string): number {
    const pa = this.profiles.get(a);
    const pb = this.profiles.get(b);
    if (!pa || !pb) return 0;
    const idf = this.weight();
    let dot = 0;
    const [small, big] = pa.size < pb.size ? [pa, pb] : [pb, pa];
    for (const [k, v] of small) {
      const u = big.get(k);
      if (u !== undefined) dot += v * u * (idf.get(k) ?? 0) ** 2;
    }
    const d = this.norm(a) * this.norm(b);
    return d ? dot / d : 0;
  }

  /** The words most alike in use, of those given. */
  nearest(word: string, among: Iterable<string>, k = 10, least = 0.2): [string, number][] {
    const out: [string, number][] = [];
    for (const w of among) {
      if (w === word) continue;
      const s = this.alike(word, w);
      if (s >= least) out.push([w, s]);
    }
    return out.sort((x, y) => y[1] - x[1]).slice(0, k);
  }
}
