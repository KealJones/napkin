/**
 * "do you know any games", "what games do you know", "which birds do you know": the
 * members of a kind, found as every unit holding `IsA(kind)` on the relation index
 * (concept-spec Part 5.1.1), following sub-kinds, in the general sense only. One lookup for
 * every kind, so knowing a new game, bird or city needs nothing added here.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

export const MEMBERS = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  // "games" names the kind Game: the plural a kind is asked about in.
  const singular = (head) => {
    const known = (h) => api.store.has(h) || api.store.asObject(h).some((t) => t.predicate === "IsA");
    if (known(head) && !/s$/.test(head)) return head;
    for (const h of [head.replace(/ies$/, "y"), head.replace(/es$/, ""), head.replace(/s$/, "")]) if (h !== head && known(h)) return h;
    return head;
  };
  const members = (kind) => {
    const seen = new Set([kind]);
    const kinds = [];
    const individuals = [];
    let frontier = [kind];
    while (frontier.length && seen.size < 200) {
      const next = [];
      for (const k of frontier) {
        for (const t of api.store.asObject(k)) {
          // A namesake sense ("a game called Volcano") is not a member of the kind.
          // Subclasses and instances are both members; only subclasses are followed further.
          if ((t.predicate !== "IsA" && t.predicate !== "InstanceOf") || t.context !== undefined || seen.has(t.subject)) continue;
          if (api.store.retracted(t.subject, t.expr)) continue;
          seen.add(t.subject);
          (/_\\d+$/.test(t.subject) ? individuals : kinds).push(api.call(t.subject));
          if (t.predicate === "IsA") next.push(t.subject);
        }
      }
      frontier = next;
    }
    // Kinds answer "what games do you know"; individuals only when there is nothing else,
    // as for "any friends", whose members are people.
    return kinds.length ? kinds : individuals;
  };
`;

export function membersUnits(): ConceptUnit[] {
  return [
    concept("Members", {
      realizations: [
        realization({
          pattern: "Members($kind)",
          context: "Execution()",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            ${MEMBERS}
            const kind = args[0].value;
            if (!isCall(kind)) return api.call("List");
            return api.call("List", ...members(singular(kind.head)));
          }`),
        }),
      ],
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
