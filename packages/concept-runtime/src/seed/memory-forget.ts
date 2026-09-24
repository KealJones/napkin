/**
 * Explicit forgetting (memory-spec Part 10.5): "forget what i said about money".
 *
 * Not dormancy. It is a request, it overrides every threshold, and there is usually a
 * privacy reason behind it. Provenance makes it exact: the `Said` stamps that mention the
 * thing go, and so does every stamp whose source chain leads to them, the beliefs and
 * replies they caused. A belief that also has another source keeps it and loses only the
 * forgotten one. The trace of those turns goes too, since it holds their parse.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

export function memoryForgetUnits(): ConceptUnit[] {
  return [
    concept("Forgotten", { relations: ["IsA(Result())"] }),
    concept("Forget", {
      realizations: [
        realization({
          pattern: "Forget($what)",
          context: "Execution()",
          properties: ["Effectful()"],
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
            const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
            // "what i said about money", "about greg": what it is about. "my favorite color":
            // the description itself.
            const find = (e) => {
              if (!isCall(e)) return undefined;
              if (e.head === "About") return positional(e)[0];
              for (const v of positional(e)) {
                const inner = find(v);
                if (inner) return inner;
              }
              return undefined;
            };
            const said = args[0].value;
            const topic = find(said) ?? said;
            if (!isCall(topic) || topic.head === "Ref") return api.call("Answer", api.call("Unknown"));
            // What mentions it: its head, and the individual a name resolved to.
            const resolved = topic.args.find((a) => a.name === "resolvedTo")?.value;
            const keys = [topic.head, ...(isCall(resolved) ? [resolved.head] : [])];
            const forgotten = new Set();
            const turns = [];
            for (const key of keys) {
              for (const m of api.store.mentioning(api.call(key))) {
                const claim = m.relation.claim;
                if (!isCall(claim) || claim.head !== "Said") continue;
                const speaker = positional(claim)[0];
                if (!isCall(speaker) || speaker.head !== "Me") continue;
                for (const s of m.relation.stamps ?? []) {
                  forgotten.add(s.seq);
                  turns.push(s.seq);
                }
              }
            }
            if (!forgotten.size) return api.call("Answer", api.call("Forgotten", topic, 0));
            // Everything sourced from what goes, transitively.
            const everything = api.store.between("0000", "9999");
            for (let grew = true; grew; ) {
              grew = false;
              for (const e of everything) {
                if (e.stamp.source !== undefined && forgotten.has(e.stamp.source) && !forgotten.has(e.stamp.seq)) {
                  forgotten.add(e.stamp.seq);
                  grew = true;
                }
              }
            }
            api.store.collect(forgotten);
            api.forgetTurns(turns);
            return api.call("Answer", api.call("Forgotten", topic, turns.length));
          }`),
        }),
      ],
    }),
  ];
}
