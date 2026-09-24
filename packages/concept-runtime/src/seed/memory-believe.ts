/**
 * memory-spec build step 4: believing what was said (design/memory-spec.md Parts 5.3, 5.4,
 * 6.2; design/reading-spec.md Part 5.2).
 *
 * Under `Declarative()` the mood realization does not evaluate a claim-shaped line, it
 * hands it here. `Believe` finds what the line is about and decides whether the claim is
 * lasting. A lasting claim is asserted on its subject, stamped with the `Said` it came
 * from as its source. Anything else stays where it already is, inside the `Said`.
 *
 * Every policy in this file is a realization, so changing what is believed, where it
 * lands, or when something earns an identity is editing Concepts, not host code.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

/**
 * Shared by the realizations below: reading a line's parts, and finding the user.
 *
 * The user is an individual like any other (memory-spec Part 3.2), minted once and found
 * by `IsA(User())`, never by identity. `Me()` in what the user says is resolved against it
 * on read; the words themselves keep `Me()` (Part 5.2).
 */
const HELPERS = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
  const named = (e, n) => (isCall(e) ? e.args.find((a) => a.name === n)?.value : undefined);
  const OWNER = { My: "Me", Your: "You", Our: "We" };
  const user = (create) => {
    const held = api.store.asObject("User").find((t) => t.predicate === "IsA");
    if (held) return held.subject;
    if (!create) return undefined;
    const id = api.store.mint("User");
    api.store.addRelation(id, api.call("IsA", api.call("User")), undefined, api.trace.cause);
    return id;
  };
  const who = (deictic, create) => (deictic === "Me" ? user(create) : deictic === "You" ? "Self" : undefined);
  // One relation whoever says it: "i like" and "greg likes" are both Likes, and "i live
  // in" is LivesIn. The third person is the form a relation is stored under.
  const thirdPerson = (head) => head.replace(/^([A-Z][a-z]*?)(s?)(?=[A-Z]|$)/, (m, w, s) => (s || /s$/.test(w) ? m : w + "s"));
  // The holder of a role: "my dad" is whoever holds DadOf(<the user>).
  const holderOf = (role, owner) =>
    api.store.asObject(owner).find((t) => t.predicate === role + "Of")?.subject;
`;

export function memoryBelieveUnits(): ConceptUnit[] {
  return [
    concept("User", { relations: ["IsA(Category())"] }),
    concept("Believed", { relations: ["IsA(Result())"] }),
    concept("Noted", { relations: ["IsA(Result())"] }),
    // Declared the way Symmetric() is (memory-spec Part 5.3): a property of a relation.
    concept("Enduring", { relations: ["IsA(RelationProperty())"] }),
    concept("Occurrent", { relations: ["IsA(RelationProperty())"] }),
    // Lasting by nature. Anything not declared is occurrent: a lasting fact filed as a
    // happening stays findable in its Said, and a happening filed as lasting bloats its
    // subject with nothing ever noticing (Part 5.3).
    ...["IsA", "Named", "Likes", "Loves", "Hates", "Prefers", "Owns", "LivesIn", "WorksAt", "SharesMemesWith"].map(
      (r) => concept(r, { relations: ["Enduring()"] }),
    ),

    /**
     * `Believe(line)`: what a claim is about, and whether it lasts (Part 5.4).
     *
     * - The subject is found by descending through possessives to the first head whose
     *   argument is the claim: `My(Dad(IsA(Doctor())))` is `IsA(Doctor())` about "my dad"
     *   (reading-spec Part 5.2). A verb-first claim, `Is(7, Prime())`, is the same claim
     *   with the subject inside (reading-spec P3).
     * - "my X is Y": a role. "greg is my coworker" is `CoworkerOf(<user>)` on Greg, and
     *   "my name is keal" is `Named("Keal")` on the user.
     * - A category keeps its describing words as properties: "a small dog" is `IsA(Dog())`
     *   and `Small()`, so inheritance runs through Dog, not through Small.
     * - Where it lands: `Me()` is the user; a name already `Named` is that individual; a
     *   name nothing holds earns an individual only by a lasting claim (Part 6.2); a kind
     *   said with an article ("a blorp") or in the plural is the kind itself.
     * - `IsA` on a kind that already realizes something is held as said, not asserted,
     *   because `IsA` orders its selection (reading-spec Part 5.2).
     *
     * A line that is not claim-shaped is evaluated as it always was, so a declarative
     * request or a follow-up phrase still works. `Effectful()`, so under `Hypothetical()`
     * nothing is believed (Part 5.4).
     */
    concept("Believe", {
      realizations: [
        realization({
          pattern: "Believe($line)",
          properties: ["Effectful()"],
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            ${HELPERS}
            const line = args[0].value;
            const cause = api.trace.cause;
            const message = String(api.ambient("message") ?? "").toLowerCase();
            const spoken = (head) => head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
            const realizes = (head) => (api.store.get(head)?.realizations.length ?? 0) > 0;
            const enduring = (head) =>
              (api.store.get(head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "Enduring");
            const evaluateAsSaid = () => api.evaluate(line);

            // Find the subject and the claim.
            let subject;
            let claim;
            let owner;
            let appositive;
            if (isCall(line) && positional(line).length >= 2 && !realizes(line.head)) {
              const [first, ...rest] = positional(line);
              subject = first;
              claim = api.call(line.head, ...rest);
            } else {
              let node = line;
              while (isCall(node) && OWNER[node.head] && positional(node).length === 1 && isCall(positional(node)[0])) {
                owner = OWNER[node.head];
                node = positional(node)[0];
              }
              // "my favorite color is blue" is My(Favorite(Color(Is(Blue())))): a describing
              // word before a copula is part of what is named, so the attribute is
              // FavoriteColor. Only before a copula: in Blorp(IsA(Small(Dog()))) the Small
              // describes the category, not the subject.
              const COPULA = ["Is", "IsA", "Are", "Was", "Were"];
              const describers = [];
              while (isCall(node) && positional(node).length === 1 && isCall(positional(node)[0]) &&
                positional(positional(node)[0]).length === 1 && isCall(positional(positional(node)[0])[0]) &&
                COPULA.includes(positional(positional(node)[0])[0].head)) {
                describers.push(node.head);
                node = positional(node)[0];
              }
              const inner = positional(node);
              // "my sister emmy is a nurse" is My(Emmy(Sister(), IsA(Nurse()))): a name, the
              // role it holds for the owner, and the claim about them.
              if (owner && isCall(node) && inner.length === 2 && isCall(inner[0]) && inner[0].args.length === 0 && isCall(inner[1])) {
                appositive = inner[0].head;
                subject = node;
                claim = inner[1];
              } else {
                if (!isCall(node) || inner.length !== 1 || !isCall(inner[0]) || (realizes(node.head) && !OWNER[node.head])) {
                  return await evaluateAsSaid();
                }
                subject = owner || describers.length ? api.call(describers.join("") + node.head) : node;
                claim = inner[0];
              }
            }
            if (!isCall(claim) || !isCall(subject)) return await evaluateAsSaid();

            // "works at google" is one relation, WorksAt(Google()): a verb and the one
            // preposition it takes are a phrasal relation, the form Enduring declares.
            const PREPOSITIONS = ["At", "In", "For", "With", "On", "From", "To"];
            const only = positional(claim);
            if (only.length === 1 && isCall(only[0]) && PREPOSITIONS.includes(only[0].head) && positional(only[0]).length === 1) {
              claim = api.call(claim.head + only[0].head, positional(only[0])[0]);
            }

            // Turn the claim into what is kept.
            const kept = [];
            const role = claim.head === "Is" && positional(claim).length === 1 ? positional(claim)[0] : undefined;
            if (owner && !appositive && subject.head === "Name" && claim.head === "Is" && role !== undefined) {
              // "my name is keal": a name given as a value (reading-spec R18).
              const text = typeof role === "string" ? role : isCall(role) ? spoken(role.head) : String(role);
              const target = who(owner, true);
              if (!target) return api.call("Noted", line);
              const name = text.replace(/\\b\\w/g, (ch) => ch.toUpperCase());
              api.store.addRelation(target, api.call("Named", name), undefined, cause);
              return api.call("Believed", api.call("Me"), api.call("List", api.call("Named", name)));
            }
            if (owner && !appositive && claim.head === "Is" && positional(claim).length >= 1 && !(isCall(role) && OWNER[role.head])) {
              // "my favorite color is blue", "my birthday is june 5": an attribute of the
              // owner, FavoriteColor(Blue()), unless someone already holds the role, in
              // which case it is said about them and stays as said.
              const ownerId = who(owner, true);
              if (!ownerId || holderOf(subject.head, ownerId)) return api.call("Noted", line);
              const attribute = api.call(subject.head, ...positional(claim));
              api.store.addRelation(ownerId, attribute, undefined, cause);
              const possessive = Object.keys(OWNER).find((k) => OWNER[k] === owner);
              return api.call("Believed", api.call(possessive, api.call(subject.head)), api.call("List", attribute));
            }
            if (isCall(role) && OWNER[role.head] && positional(role).length === 1 && isCall(positional(role)[0])) {
              // "greg is my coworker": the subject holds the role for the owner.
              const holder = who(OWNER[role.head], true);
              if (holder) kept.push(api.call(positional(role)[0].head + "Of", api.call(holder)));
            } else if (claim.head === "IsA" && isCall(positional(claim)[0])) {
              // "a small dog": the kind, with its describing words as properties.
              let kind = positional(claim)[0];
              while (isCall(kind) && positional(kind).length === 1 && isCall(positional(kind)[0])) {
                kept.push(api.call(kind.head));
                kind = positional(kind)[0];
              }
              kept.unshift(api.call("IsA", api.call(kind.head)));
            } else if (enduring(claim.head)) {
              kept.push(claim);
            } else if (enduring(thirdPerson(claim.head))) {
              kept.push(api.call(thirdPerson(claim.head), ...positional(claim)));
            }
            // The role an appositive names is itself lasting: Emmy is the user's sister.
            const ownerOfRole = appositive ? who(owner, true) : undefined;
            if (appositive && ownerOfRole) kept.unshift(api.call(appositive + "Of", api.call(ownerOfRole)));
            if (!kept.length) return api.call("Noted", line);

            // Where it lands.
            let target;
            let display = api.call(subject.head);
            const resolved = named(subject, "resolvedTo");
            // A person's name: an individual already Named it, or one minted for it now.
            const person = (name) => {
              const held = api.store.asObject(api.format(name)).find((t) => t.predicate === "Named");
              if (held) return held.subject;
              const id = api.store.mint(name);
              api.store.addRelation(id, api.call("Named", name), undefined, cause);
              return id;
            };
            // A given name the graph learned as a kind ("Emmy" from research) is still a
            // person when talked about like one.
            const NAMEISH = ["GivenName", "FirstName", "MaleName", "FemaleName", "Surname", "FamilyName", "HumanName", "Name"];
            const isName = (head) => (api.store.get(head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(positional(r.claim)[0]) && NAMEISH.includes(positional(r.claim)[0].head));
            if (appositive) {
              target = isCall(resolved) ? resolved.head : person(subject.head);
            } else if (owner) {
              const ownerId = who(owner, true);
              target = ownerId && holderOf(subject.head, ownerId);
              if (!target && ownerId) {
                target = api.store.mint(subject.head);
                api.store.addRelation(target, api.call("IsA", api.call(subject.head)), undefined, cause);
                api.store.addRelation(target, api.call(subject.head + "Of", api.call(ownerId)), undefined, cause);
              }
              display = api.call(Object.keys(OWNER).find((k) => OWNER[k] === owner), api.call(subject.head));
            } else if (who(subject.head, false) !== undefined || subject.head === "Me") {
              target = who(subject.head, true);
            } else if (isCall(resolved)) {
              target = resolved.head;
            } else {
              const word = spoken(subject.head);
              const asKind =
                new RegExp("\\\\b(a|an|the|every|all)\\\\s+" + word + "\\\\b").test(message) ||
                /[^s]s$/.test(subject.head) ||
                (api.store.has(subject.head) && !isName(subject.head) && !api.store.get(subject.head).relations.some((r) => isCall(r.claim) && r.claim.head === "Named"));
              if (asKind) {
                if (kept.some((k) => k.head === "IsA") && realizes(subject.head)) return api.call("Noted", line);
                target = subject.head;
              } else {
                // A name nothing holds yet: a lasting claim is what earns it an identity.
                target = person(subject.head);
              }
            }
            if (!target) return api.call("Noted", line);
            for (const k of kept) api.store.addRelation(target, k, undefined, cause);
            return api.call("Believed", display, api.call("List", ...kept));
          }`),
        }),
      ],
    }),

    /**
     * "does greg like cats", "do i like cats": a yes/no question with do-support, looked up
     * as the relation it asks about, in the form it is stored under. A lookup, never a
     * lesson: not holding it is unknown, not false (concept-spec Part 5.2).
     */
    ...["Do", "Does", "Did"].map((helper) =>
      concept(helper, {
        realizations: [
          realization({
            pattern: `${helper}($subject, $claim)`,
            context: "Context(Execution(), Interrogative())",
            evaluateArguments: false,
            body: code(`async (args, bindings, api) => {
              ${HELPERS}
              const answer = (v) => api.call("Answer", api.call(v));
              const [subject, claim] = [args[0].value, args[1].value];
              if (!isCall(subject) || !isCall(claim)) return answer("UnknownTruth");
              const resolved = named(subject, "resolvedTo");
              const about = isCall(resolved) ? resolved.head : who(subject.head, false) ?? subject.head;
              const predicate = thirdPerson(claim.head);
              const wanted = positional(claim).map((v) => api.format(v)).join(",");
              const holds = api.relations
                .of(about)
                .some((t) => t.predicate === predicate && positional(t.expr).map((v) => api.format(v)).join(",") === wanted);
              return answer(holds ? "True" : "UnknownTruth");
            }`),
          }),
        ],
      }),
    ),

    /**
     * "what is my name", "who is my coworker": a possessive description is read against
     * what has been believed, so asking finds the holder rather than describing the word
     * `My`. Nothing is created by asking (memory-spec Part 6.2): with no holder the
     * description stays as said.
     */
    ...Object.keys({ My: 0, Your: 0, Our: 0 }).map((possessive) =>
      concept(possessive, {
        relations: ["IsA(Marker())"],
        realizations: [
          realization({
            pattern: `${possessive}($thing)`,
            context: "Execution()",
            evaluateArguments: false,
            body: code(`async (args, bindings, api) => {
              ${HELPERS}
              const thing = args[0].value;
              const ownerId = who(OWNER["${possessive}"], false);
              if (!isCall(thing)) return api.call("${possessive}", thing);
              if (!ownerId) return api.call("Unknown", api.call("${possessive}", thing));
              if (thing.head === "Name") {
                const name = api.store.asSubject(ownerId).find((t) => t.predicate === "Named");
                if (name && typeof name.object === "string") return name.object;
              }
              // "my favorite color" is My(Favorite(Color())), the attribute FavoriteColor.
              let key = "";
              let part = thing;
              while (isCall(part)) {
                key += part.head;
                const rest = positional(part);
                part = rest.length === 1 ? rest[0] : undefined;
              }
              const attribute = api.store.asSubject(ownerId).find((t) => t.predicate === key);
              if (attribute) {
                const values = positional(attribute.expr);
                return values.length === 1 ? values[0] : attribute.expr;
              }
              const holder = holderOf(key, ownerId);
              if (holder) return api.call(holder);
              // Asked for and never told: not knowing is the answer, not the word "my".
              return api.call("Unknown", api.call("${possessive}", thing));
            }`),
          }),
        ],
      }),
    ),
  ];
}
