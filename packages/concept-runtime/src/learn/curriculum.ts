/**
 * A curriculum: topics to study, grouped and ORDERED.
 *
 * Order is not decoration. A taught realization may only compose Concepts that already
 * exist, and a taught relation is only useful if its object means something — so a track
 * runs from the primitive to the composed, and `foundations` runs before everything.
 * Study `Debt` before `Money` and the Teacher has nothing to say it with.
 *
 * These are topics, not identities. `medium of exchange` becomes `MediumOfExchange` on the
 * way in, and the crawl adds whatever the teaching turns out to name, so the list is a
 * starting point rather than a target. It is deliberately broad and shallow: breadth gives
 * the relation crawl somewhere to go.
 */
export const CURRICULUM: Record<string, readonly string[]> = {
  /** Run first. Almost everything else leans on these. */
  foundations: [
    "thing", "property", "quantity", "unit", "amount", "part", "whole", "group", "kind",
    "order", "sequence", "pair", "difference", "sameness", "opposite", "change", "state",
    "event", "process", "cause", "effect", "condition", "possibility", "necessity",
    "place", "boundary", "distance", "direction", "position", "shape", "size",
  ],

  time: [
    "time", "duration", "moment", "past", "present", "future", "before", "after",
    "beginning", "end", "frequency", "rate", "speed", "delay", "schedule", "deadline",
    "age", "lifetime", "cycle", "season",
  ],

  quantity: [
    "number", "count", "measurement", "length", "mass", "weight", "volume", "area",
    "temperature", "ratio", "proportion", "percentage", "fraction", "average", "sum",
    "maximum", "minimum", "range", "threshold", "estimate", "precision", "scale",
  ],

  physical: [
    "matter", "energy", "force", "motion", "gravity", "pressure", "heat", "light",
    "sound", "electricity", "water", "air", "fire", "earth", "solid", "liquid", "gas",
    "material", "surface", "container", "tool", "machine", "structure",
  ],

  life: [
    "life", "death", "organism", "animal", "plant", "human", "body", "organ", "cell",
    "growth", "birth", "food", "hunger", "sleep", "breathing", "health", "illness",
    "injury", "medicine", "pain", "healing", "exercise", "diet", "bodyweight",
  ],

  mind: [
    "perception", "attention", "memory", "belief", "knowledge", "learning",
    "understanding", "reasoning", "judgment", "decision", "intention", "desire", "goal",
    "plan", "habit", "skill", "mistake", "doubt", "certainty", "truth", "meaning",
    "language", "word", "question", "answer", "explanation", "emotion", "fear", "joy",
  ],

  society: [
    "person", "family", "friend", "community", "society", "culture", "role",
    "cooperation", "conflict", "agreement", "promise", "trust", "obligation",
    "responsibility", "permission", "rule", "law", "government", "right", "fairness",
    "harm", "help", "gift", "reputation", "authority", "consent",
  ],

  economics: [
    "value", "usefulness", "scarcity", "need", "want", "resource", "good", "service",
    "exchange", "trade", "medium of exchange", "money", "currency", "dollar", "price",
    "cost", "payment", "purchase", "sale", "market", "supply", "demand", "ownership",
    "property", "wealth", "poverty", "income", "wage", "work", "job", "employment",
    "profit", "loss", "saving", "spending", "debt", "loan", "interest", "credit",
    "investment", "risk", "insurance", "bank", "tax", "budget", "inflation",
    "generosity", "waste",
  ],

  programming: [
    "computer", "program", "instruction", "data", "value", "variable", "name", "binding",
    "type", "function", "argument", "parameter", "return value", "expression",
    "statement", "condition", "branch", "loop", "iteration", "recursion", "list", "array",
    "map", "set", "record", "null", "string", "integer", "boolean", "operator",
    "assignment", "scope", "state", "mutation", "immutability", "reference", "pointer",
    "memory", "allocation", "garbage collection", "stack", "queue", "tree", "graph",
    "algorithm", "complexity", "sorting", "searching", "hash", "encryption",
  ],

  /**
   * What this system is made of.
   *
   * Run this one with research OFF. Almost every term here is a common word wearing a
   * local meaning: a web search for "realization" returns philosophy of mind, "facet"
   * returns library science, and "residual" returns statistics. Grounding the Teacher in
   * those would teach the wrong sense of every word that matters most.
   *
   * Ordered so the pieces come before the things built out of them.
   */
  cnocept: [
    "identity", "expression", "variable", "call", "argument", "pattern", "matching",
    "substitution", "binding", "scope", "concept", "relation", "realization", "body",
    "composition", "context", "facet", "specificity", "selection", "ambiguity",
    "inheritance", "synonym", "marker", "residual", "evaluation", "trace", "gap",
    "learning", "teacher", "grounding", "graph", "persistence", "shadowing",
    "interrogative", "reference", "deixis", "description", "suppression", "budget",
    "open world assumption", "three valued truth", "verifier", "emission",
    "target language", "transpilation", "ownership", "self reference",
  ],

  /** Leans on `programming`: these are distinctions a language makes, not a machine. */
  typescript: [
    "type", "type annotation", "type inference", "static type", "dynamic type",
    "structural typing", "nominal typing", "type alias", "interface", "union type",
    "intersection type", "literal type", "optional property", "readonly", "enum",
    "tuple", "generic", "type parameter", "constraint", "any", "unknown", "never",
    "void", "null", "undefined", "narrowing", "type guard", "discriminated union",
    "mapped type", "conditional type", "keyof", "indexed access", "type assertion",
    "declaration file", "strict mode", "transpilation", "source map", "class",
    "constructor", "inheritance", "method", "field", "access modifier",
    "abstract class", "closure", "higher order function", "callback", "arrow function",
    "destructuring", "spread", "rest parameter", "template literal", "promise",
    "async", "await", "generator", "iterator", "side effect", "pure function",
    "immutability", "nullability", "variance", "covariance", "contravariance",
  ],

  software: [
    "source code", "compiler", "interpreter", "runtime", "syntax", "semantics", "library",
    "module", "dependency", "interface", "abstraction", "implementation", "api",
    "protocol", "request", "response", "client", "server", "network", "database", "query",
    "index", "transaction", "cache", "file", "directory", "process", "thread",
    "concurrency", "race condition", "deadlock", "error", "exception", "failure", "bug",
    "test", "debugging", "logging", "monitoring", "version", "repository", "commit",
    "branch", "merge", "conflict resolution", "refactoring", "deployment", "rollback",
    "authentication", "authorization", "performance", "latency", "throughput",
  ],
};

export const TRACKS = Object.keys(CURRICULUM);

/**
 * Topics for one track, or every track in dependency order when given `all`.
 * `foundations` is forced first: the rest is built out of it.
 */
export function curriculum(track = "all"): string[] {
  if (track !== "all") {
    const found = CURRICULUM[track];
    if (!found) throw new Error(`Unknown track ${track}. Try one of: ${TRACKS.join(", ")}`);
    return [...found];
  }
  const ordered = ["foundations", ...TRACKS.filter((t) => t !== "foundations")];
  return ordered.flatMap((t) => [...CURRICULUM[t]]);
}
