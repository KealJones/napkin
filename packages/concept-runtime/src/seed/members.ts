/**
 * "do you know any games", "what games do you know", "which birds do you know": the
 * members of a kind, found as every unit holding `IsA(kind)` on the relation index
 * (concept-spec Part 5.1.1), following sub-kinds, in the general sense only. One lookup for
 * every kind, so knowing a new game, bird or city needs nothing added here.
 */
import { call, parse, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

/** "games" names the kind Game: the plural a kind is asked about in. Word morphology, so JavaScript. */
const SINGULAR = `async (args, bindings, api) => {
  const kind = args[0].value;
  if (kind === null || typeof kind !== "object" || !("head" in kind)) return api.call("Nothing");
  const head = kind.head;
  const known = (h) => api.store.has(h) || api.store.asObject(h).some((t) => t.predicate === "IsA");
  if (known(head) && !/s$/.test(head)) return api.call(head);
  for (const h of [head.replace(/ies$/, "y"), head.replace(/es$/, ""), head.replace(/s$/, "")]) if (h !== head && known(h)) return api.call(h);
  return api.call(head);
}`;

/**
 * Everything reached from a frontier by IsA (instances) or SubclassOf (kinds of it), in the
 * general sense only and never retracted, one level at a time. Written in the code IR.
 */
const REACH = `Let($next,
  Unique(Filter(
    FlatMap($frontier, Lambda(List($k), Concat(Subjects("IsA", $k), Subjects("SubclassOf", $k)))),
    Lambda(List($x), Not(Includes($seen, $x))))),
  If(Or(Equals(Length($next), 0), GreaterThan(Length($seen), 200)),
    $next,
    Concat($next, Reach($next, Concat($seen, $next)))))`;

/** Kinds answer "what games do you know"; individuals only when there is nothing else, as for "any friends". */
const MEMBERS = `Let($all, Let($root, Singular($kind), Reach(List($root), List($root))),
  Let($kinds, Filter($all, Lambda(List($x), Not(Matches(Head($x), "_[0-9]+$")))),
    If(GreaterThan(Length($kinds), 0), $kinds, $all)))`;

export function membersUnits(): ConceptUnit[] {
  return [
    concept("Members", {
      realizations: [
        realization({ pattern: "Members($kind)", context: "Execution()", evaluateArguments: false, properties: ["Compile()"], body: parse(MEMBERS) }),
      ],
    }),
    concept("Reach", {
      realizations: [realization({ pattern: "Reach($frontier, $seen)", context: "Execution()", properties: ["Compile()"], body: parse(REACH) })],
    }),
    concept("Singular", {
      realizations: [realization({ pattern: "Singular($kind)", context: "Execution()", evaluateArguments: false, body: code(SINGULAR) })],
    }),
    // "any games", "some birds", asked about: the members of the kind.
    ...["Any", "Some"].map((word) =>
      concept(word, {
        realizations: [
          realization({
            pattern: `${word}($kind)`,
            context: "Context(Execution(), Interrogative())",
            evaluateArguments: false,
            body: code(`async (args, bindings, api) => await api.evaluate(api.call("Members", args[0].value))`),
          }),
        ],
      }),
    ),
  ];
}
