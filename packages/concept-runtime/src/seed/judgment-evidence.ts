/**
 * Evidence, read as a Concept (emergent-judgment-plan.md Part 3.1, Phase 0 item 3).
 *
 * Writing the trace is an ambient effect of evaluation; reading it is an ordinary Concept
 * (concept-spec Part 15.1), so a realization can query its own history through `api`
 * instead of that logic living in host code. `api.events` is the general host facility
 * (Part 2.1) every realization reaches the same way; nothing here is special-cased by the
 * evaluator.
 */
import { call } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string) => call("Code", [{ name: "source", value: source }]);

const units: ConceptUnit[] = [];
const add = (u: ConceptUnit) => void units.push(u);

add(
  concept("Evidence", {
    relations: ["IsA(Category())"],
    realizations: [
      realization({
        pattern: "Evidence($concept)",
        body: code(`(args, bindings, api) => {
          const target = args[0].value;
          const head = target && typeof target === "object" && "head" in target ? target.head : String(target);
          const matches = api.events.filter((e) => e.concept === head);
          if (!matches.length) return api.call("NoEvidence", api.call(head));
          const groups = [];
          for (const e of matches) {
            const found = groups.find((g) => g.context === e.useContext && g.outcome === e.outcome);
            if (found) found.count += 1;
            else groups.push({ context: e.useContext, outcome: e.outcome, count: 1 });
          }
          return api.call(
            "List",
            ...groups.map((g) => api.call("Tally", api.parse(g.context), api.call(g.outcome), g.count)),
          );
        }`),
      }),
    ],
  }),
);

export const judgmentEvidenceUnits = (): readonly ConceptUnit[] => units;
