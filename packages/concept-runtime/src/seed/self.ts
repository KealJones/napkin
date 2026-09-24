/**
 * The system as something that can be asked about, and the small talk around a chat.
 *
 * "who are you", "what is your name" and "what can you do" are questions about `Self`, the
 * speaker of every reply (memory-spec Part 5.2). The answers are relations on `Self`,
 * ordinary graph data, so what the system says it can do is edited the same way anything
 * else it knows is. Small talk ("how are you", "cool", "good night") is answered, not
 * computed, like greetings already are.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

const answers = (category: string, answer: string, members: readonly string[]): ConceptUnit[] => [
  concept(category, {
    relations: ["IsA(Category())"],
    realizations: [
      realization({
        pattern: "$said",
        context: "Execution()",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => api.call("Answer", api.call("${answer}"))`),
      }),
    ],
  }),
  ...members.map((m) => concept(m, { relations: [`IsA(${category}())`] })),
];

/** What the system can actually do today. Each is something a test exercises. */
const CAN_DO = [
  "Arithmetic",
  "FollowUpArithmetic",
  "DatesAndTimes",
  "RememberWhatYouTellMe",
  "RecallWhatYouSaid",
  "DescribeWhatIKnow",
  "LearnNewWords",
];

export function selfUnits(): ConceptUnit[] {
  return [
    concept("Self", {
      relations: ["Named(\"Napkin\")", "IsA(Assistant())", ...CAN_DO.map((d) => `CanDo(${d}())`)],
    }),
    concept("Assistant", { relations: ["IsA(Category())"] }),
    // Incidental: what it can do is answered when asked, not recited in every description.
    concept("CanDo", { relations: ["Enduring()", "Incidental()"] }),
    ...CAN_DO.map((d) => concept(d, { relations: ["IsA(Capability())"] })),
    concept("Capability", { relations: ["IsA(Category())"] }),

    /** "what can you do": what `Self` holds `CanDo`. */
    concept("WhatCan", {
      realizations: [
        realization({
          pattern: "WhatCan(You(), Do())",
          context: "Context(Execution(), Interrogative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const can = api.store.asSubject("Self").filter((t) => t.predicate === "CanDo").map((t) => t.object);
            return api.call("Answer", api.call("List", ...can));
          }`),
        }),
      ],
    }),

    /** "how are you", "how are you doing": asked to be polite, answered the same way. */
    concept("HowAre", {
      realizations: ["HowAre(You())", "HowAre(You(), $doing)"].map((pattern) =>
        realization({
          pattern,
          context: "Context(Execution(), Interrogative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => api.call("Answer", api.call("DoingWell"))`),
        }),
      ),
    }),
    concept("DoingWell", { relations: ["IsA(Data())"] }),

    // "cool", "ok", "lol": a reaction, answered briefly rather than looked up.
    ...answers("Approval", "GladYouLikeIt", ["Cool", "Nice", "Great", "Awesome", "Neat", "Wow", "Sick", "Perfect"]),
    ...answers("Agreement", "GotIt", ["Ok", "Okay", "Gotcha", "Alright", "Agreed", "Sure", "Understood"]),
    ...answers("Laughter", "Laughing", ["Lol", "Haha", "Lmao"]),
    ...["GladYouLikeIt", "GotIt", "Laughing"].map((d) => concept(d, { relations: ["IsA(Data())"] })),
    concept("WhatsUp", { relations: ["IsA(Greeting())"] }),
    concept("NiceToMeetYou", { relations: ["IsA(Greeting())"] }),
    concept("GoodNight", { relations: ["IsA(Farewell())"] }),
    concept("SeeYouLater", { relations: ["IsA(Farewell())"] }),
  ];
}
