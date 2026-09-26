/** As much of node-symspell (untyped) as `words.ts` uses. */
declare module "node-symspell" {
  interface Suggestion {
    term: string;
    distance: number;
    count: number;
  }
  class SymSpell {
    static Verbosity: { ALL: number };
    constructor(maxEditDistance: number, prefixLength: number);
    createDictionaryEntry(key: string, count: number): void;
    lookup(input: string, verbosity: number, maxEditDistance: number): Suggestion[];
    words: Map<string, number>;
    bigrams: Map<string, number>;
  }
  export default SymSpell;
}
