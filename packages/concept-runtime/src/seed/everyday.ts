/**
 * Everyday requests a chat gets that the core seed had no words for: halves and doubles,
 * averages and totals, holidays and how far off they are, "define", and being told it was
 * wrong. Each is an ordinary realization; nothing here is host code.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

const NUMBER = `const asNumber = (v) => (typeof v === "number" ? v : v && v.head === "Number" ? asNumber(v.args[0].value) : v && v.head === "Of" ? asNumber(v.args[0].value) : NaN);`;

/** "half of 90", "double it": one number in, one out, said with or without "of". */
const scale = (head: string, op: string) =>
  concept(head, {
    realizations: [`${head}($x)`, `${head}(Of($x))`].map((pattern) =>
      realization({
        pattern,
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          ${NUMBER}
          const x = asNumber(args[0].value);
          return Number.isNaN(x) ? api.call("${head}", args[0].value) : ${op};
        }`),
      }),
    ),
  });

/** "the average of 2, 4 and 9", "add up 3, 4 and 5": over a list, said with or without "of". */
const over = (head: string, op: string) =>
  concept(head, {
    realizations: [`${head}($xs)`, `${head}(Of($xs))`].map((pattern) =>
      realization({
        pattern,
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          ${NUMBER}
          const list = args[0].value && args[0].value.head === "Of" ? args[0].value.args[0].value : args[0].value;
          const xs = list && list.head === "List" ? list.args.map((a) => asNumber(a.value)) : [];
          if (!xs.length || xs.some(Number.isNaN)) return api.call("${head}", args[0].value);
          return ${op};
        }`),
      }),
    ),
  });

/** A holiday on a fixed date is the next time that date comes round. */
const HOLIDAYS: Record<string, [number, number]> = {
  Christmas: [12, 25],
  ChristmasEve: [12, 24],
  NewYearsDay: [1, 1],
  NewYearsEve: [12, 31],
  Halloween: [10, 31],
  ValentinesDay: [2, 14],
};

const holiday = (head: string, [month, day]: [number, number]) =>
  concept(head, {
    relations: ["IsA(Holiday())"],
    realizations: [
      realization({
        pattern: `${head}()`,
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let when = new Date(now.getFullYear(), ${month - 1}, ${day});
          if (when < today) when = new Date(now.getFullYear() + 1, ${month - 1}, ${day});
          const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          return { head: "Date", args: [
            { name: "year", value: when.getFullYear() },
            { name: "month", value: when.getMonth() + 1 },
            { name: "day", value: when.getDate() },
            { name: "weekday", value: days[when.getDay()] },
          ]};
        }`),
      }),
    ],
  });

export function everydayUnits(): ConceptUnit[] {
  return [
    scale("Half", "x / 2"),
    scale("Double", "x * 2"),
    scale("Twice", "x * 2"),
    scale("Triple", "x * 3"),
    over("Average", "xs.reduce((a, b) => a + b, 0) / xs.length"),
    over("Mean", "xs.reduce((a, b) => a + b, 0) / xs.length"),
    over("ArithmeticMean", "xs.reduce((a, b) => a + b, 0) / xs.length"),
    over("Sum", "xs.reduce((a, b) => a + b, 0)"),
    over("Total", "xs.reduce((a, b) => a + b, 0)"),
    over("AddUp", "xs.reduce((a, b) => a + b, 0)"),

    /** "take 10, double it": the number a chain of steps starts from. */
    concept("Take", {
      realizations: [
        realization({
          pattern: "Take($x)",
          context: "Execution()",
          body: code(`(args, bindings, api) => (typeof args[0].value === "number" ? args[0].value : api.call("Take", args[0].value))`),
        }),
      ],
    }),

    // "half of 90", "until christmas": the preposition is held in the pattern that reads it.
    // Left over on its own it is structure, not a word to learn.
    ...["Of", "Until"].map((p) => concept(p, { relations: ["IsA(Marker())"] })),
    concept("Holiday", { relations: ["IsA(Category())"] }),
    ...Object.entries(HOLIDAYS).map(([head, date]) => holiday(head, date)),

    /** "how many days until christmas": from today to the date, in whole days. */
    concept("HowMany", {
      realizations: [
        realization({
          pattern: "HowMany(Days(), Until($when))",
          context: "Execution()",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const until = args[1].value.args[0].value;
            const date = await api.evaluate(until);
            const field = (n) => date && date.head === "Date" ? date.args.find((a) => a.name === n)?.value : undefined;
            if (typeof field("year") !== "number") return api.call("HowMany", ...args.map((a) => a.value));
            const now = new Date();
            const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
            const then = Date.UTC(field("year"), field("month") - 1, field("day"));
            return api.call("Answer", api.call("Days", Math.round((then - today) / 86400000)));
          }`),
        }),
      ],
    }),

    /**
     * "wanna play tic tac toe?", "can we play chess": wanting to do something together, said
     * to the one who would do it, is asking for it (Searle's indirect requests), the way
     * "can you X" already is. Only a thing to do: "want pizza" stays a want.
     */
    concept("Want", {
      realizations: [
        realization({
          pattern: "Want($x)",
          context: "Execution()",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const x = args[0].value;
            const doable = x && x.head && (api.store.get(x.head)?.realizations.length ?? 0) > 0 && x.args.length > 0;
            if (!doable) return api.call("Want", x);
            const ctx = api.context;
            const facets = ctx && ctx.head === "Context" ? ctx.args.map((a) => a.value) : [ctx];
            return await api.evaluate(x, api.call("Context", ...facets.filter((f) => f && !["Checking", "Interrogative", "Declarative"].includes(f.head)), api.call("Imperative")));
          }`),
        }),
      ],
    }),
    concept("Can", {
      realizations: [
        realization({
          pattern: "Can(We(), $x)",
          context: "Context(Execution(), Interrogative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => await api.evaluate(args[1].value, api.call("Context", api.call("Execution"), api.call("Imperative")))`),
        }),
      ],
    }),

    // "define recursion", "explain recursion": asking what it is, in another form.
    concept("Define", { relations: ["SynonymOf(What())"] }),
    concept("Explain", { relations: ["SynonymOf(What())"] }),

    /**
     * "that was wrong", "that's wrong": told it made a mistake. Apologising is the reply;
     * the correction itself is evidence the next turn carries (emergent-judgment-plan
     * Part 3.1), not something to believe.
     */
    ...["Was", "Is"].map((copula) =>
      concept(copula, {
        realizations: [
          realization({
            pattern: `${copula}($said, Wrong())`,
            context: "Execution()",
            evaluateArguments: false,
            body: code(`async (args, bindings, api) => api.call("Answer", api.call("Sorry"))`),
          }),
        ],
      }),
    ),
    concept("Sorry", { relations: ["IsA(Data())"] }),
    concept("Okay", { relations: ["IsA(Data())"] }),
    // "yes", "no" on their own: a reply to a reply.
    ...["Yes", "Yeah", "Yep"].map((w) => concept(w, { relations: ["IsA(Agreement())"] })),
    concept("Refusal", {
      relations: ["IsA(Category())"],
      realizations: [
        realization({
          pattern: "$said",
          context: "Execution()",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => api.call("Answer", api.call("Okay"))`),
        }),
      ],
    }),
    ...["No", "Nope", "Nah"].map((w) => concept(w, { relations: ["IsA(Refusal())"] })),
  ];
}
