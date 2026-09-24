/**
 * memory-spec build step 8: consolidation (design/memory-spec.md Part 11;
 * emergent-judgment-plan.md Part 3.4, Part 3.5).
 *
 * Repeated happenings inside `Said` become a lasting fact on their subject, sourced from
 * one consolidation stamp that carries the evidence count and span rather than a relation
 * pointing at every occurrence. That is what lets the occurrences themselves be collected
 * later (`store/collect.ts`) without dangling the fact they produced (safety property 3,
 * Part 10.4).
 *
 * What relation the consolidated fact gets is a naming problem this build step does not
 * solve mechanically. `Ate(GrannySmith())` repeated has an obvious target, `Likes(...)`,
 * because a single-argument occurrent claim's own argument IS the thing repeatedly done to
 * or with, so `Likes` is a safe generic name for it. `Sent(Me(), Meme())` does not: naming
 * it `SharesMemesWith` requires knowing which argument is the recipient and turning a verb
 * into a noun, which is exactly the generalisation problem `emergent-judgment-plan.md`
 * Part 3.4 solves by anti-unifying several *different* claims, not one repeated one. Rather
 * than guess, anything with more than one argument consolidates to the generic
 * `Often(claim)` — true, deterministic, and honest about not having named it.
 *
 * The thresholds are relations on `Consolidate` itself, not scattered constants, so
 * changing how much evidence is enough is editing an ordinary Concept (concept-spec
 * Part 2.1's privilege test), the same way `Believe`'s occurrent default is.
 */
import { type Expr, call } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

export function memoryConsolidateUnits(): ConceptUnit[] {
  return [
    concept("Consolidated", { relations: ["IsA(Result())"] }),
    // A lasting "usually true" fact, for whatever a specific relation cannot be named
    // mechanically (see the module doc). Enduring like any other lasting fact.
    concept("Often", { relations: ["Enduring()"] }),
    concept("Likes", { relations: ["Enduring()"] }),

    /**
     * `Consolidate()`: scan every conversation's `Said` for a happening repeated enough to
     * distill, and assert it (Part 11). Idempotent — a wording already consolidated is
     * skipped — so running it twice, or from `Exist`'s agenda alongside a CLI `--commit`,
     * adds nothing the second time.
     *
     * `dryRun` is read the same way `Believe` reads `message`: an ambient fact for this
     * turn, not an argument, since nothing about consolidating a specific Concept differs
     * between a report and a commit.
     */
    concept("Consolidate", {
      relations: ["MinOccurrences(3)", "MinConversations(2)", "MinDays(2)"],
      realizations: [
        realization({
          pattern: "Consolidate()",
          context: "Execution()",
          properties: ["Effectful()"],
          body: code(`async (args, bindings, api) => {
            const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
            const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
            // Said stores the whole parse, mood included (memory/conversations.ts), the
            // same unwrapping seed.ts's own Mood realization does.
            const unmood = (e) => (isCall(e) && e.head === "Mood" && e.args.length === 2 ? e.args[1].value : e);
            const dryRun = api.ambient("dryRun") === "true";
            const cause = api.trace.cause;

            const thresholds = api.store.get("Consolidate").relations;
            const threshold = (name, fallback) => {
              const held = thresholds.find((r) => isCall(r.claim) && r.claim.head === name);
              const v = held && positional(held.claim)[0];
              return typeof v === "number" ? v : fallback;
            };
            const minOccurrences = threshold("MinOccurrences", 3);
            const minConversations = threshold("MinConversations", 2);
            const minDays = threshold("MinDays", 2);

            // One entry per stamp: the same words said twice are two occurrences even
            // though the store holds one relation with two stamps (memory-spec Part 4.3).
            const said = [];
            for (const unit of api.store.all()) {
              if (!/^(Conversation_|IsolatedConversation_)/.test(unit.identity)) continue;
              for (const r of unit.relations) {
                if (!isCall(r.claim) || r.claim.head !== "Said") continue;
                const [speaker, rawContent] = positional(r.claim);
                const content = unmood(rawContent);
                if (!isCall(speaker) || speaker.head !== "Me" || !isCall(content)) continue;
                for (const stamp of r.stamps ?? []) {
                  said.push({ content, conversation: unit.identity, day: stamp.recordedAt.slice(0, 10), seq: stamp.seq });
                }
              }
            }

            // Grouped by the exact wording. A generalisation across *different* wordings
            // is the sibling mechanism, emergent-judgment-plan.md Part 3.4, not this one.
            const groups = new Map();
            for (const entry of said) {
              const key = api.format(entry.content);
              const list = groups.get(key);
              if (list) list.push(entry);
              else groups.set(key, [entry]);
            }

            const done = [];
            for (const entries of groups.values()) {
              const conversations = new Set(entries.map((e) => e.conversation));
              const days = new Set(entries.map((e) => e.day));
              if (entries.length < minOccurrences || conversations.size < minConversations || days.size < minDays) continue;

              // "Subject(claim)": the same wrapping Believe descends (memory-believe.ts).
              const content = entries[0].content;
              const inner = positional(content);
              if (inner.length !== 1 || !isCall(inner[0])) continue;
              const claim = inner[0];

              // Where it lands. "Me" resolves to the user, minted if this is the first
              // lasting claim about them (memory-spec Part 6.2); anyone else already has
              // their own identity from having been said at all. A dry run reports what
              // would happen without minting anything, so an unminted user is reported
              // against the kind rather than an identity that would not yet exist.
              let target;
              if (content.head === "Me") {
                const held = api.store.asObject("User").find((t) => t.predicate === "IsA");
                if (held) target = held.subject;
                else if (!dryRun) {
                  target = api.store.mint("User");
                  api.store.addRelation(target, api.call("IsA", api.call("User")), undefined, cause);
                } else target = "User";
              } else if (api.store.has(content.head)) {
                target = content.head;
              }
              if (!target) continue;

              const claimArgs = positional(claim);
              const fact = claimArgs.length === 1 ? api.call("Likes", claimArgs[0]) : api.call("Often", claim);

              // Already consolidated: nothing to add a second time.
              const already = (api.store.get(target).relations ?? []).some(
                (r) => isCall(r.claim) && r.claim.head === "Consolidation" && api.format(r.claim.args[0].value) === api.format(content),
              );
              if (already) continue;

              const from = entries.reduce((a, b) => (a.day < b.day ? a : b)).day;
              const to = entries.reduce((a, b) => (a.day > b.day ? a : b)).day;
              if (!dryRun) {
                const mark = api.store.addRelation(target, api.call("Consolidation", content, entries.length, from, to));
                api.store.addRelation(target, fact, undefined, mark.seq);
              }
              done.push(api.call(target, fact));
            }
            return api.call("Consolidated", api.call("List", ...done));
          }`),
        }),
      ],
    }),
  ];
}
