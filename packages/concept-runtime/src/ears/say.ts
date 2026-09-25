/**
 * The host's plain wordings: what is said when the graph's own English (packs/english.ncon)
 * has no wording for a result. Small talk, not knowing, a date or a time, a follow-up number.
 *
 * There is no model here any more. It was asked to put results into sentences and said
 * things the graph never worked out, so a result nothing can word is shown as it is.
 */
import { type Call, type Expr, format, isCall, walk } from "../concept/expression.js";
import { ANON } from "../concept/match.js";
import type { ModelOptions } from "./ollama.js";

/**
 * A residual is not an answer. Narrating one as though it were is how a system starts
 * saying things it has not worked out — the studio once reported "the result is a command
 * to convert the current timestamp", which is a description of an expression that never
 * ran. So an unrealized result is never handed to the model at all.
 */
function unresolved(message: string, result: Expr, gaps: readonly Unrealized[]): string {
  // Not knowing a Concept and not knowing how to DO one are different admissions, and
  // saying "I do not know Choose" about a Concept it had just learned was the wrong one.
  const absent = gaps.filter((g) => g.kind === "unknown" || g.kind === "empty").map((g) => words(g.identity));
  const inert = gaps.filter((g) => g.kind === "inert" || g.kind === "reference").map((g) => words(g.identity));
  const parts: string[] = [];
  if (absent.length) parts.push(`I don't know what ${list(absent)} ${absent.length > 1 ? "are" : "is"} yet.`);
  if (inert.length) parts.push(`I don't know how to ${list(inert)} yet.`);
  return parts.length ? parts.join(" ") : "I could not work that out.";
}

/** A Concept's name as the words it came from: `GrannySmith` is "granny smith". */
const words = (identity: string): string => identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

const list = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/**
 * When the answer is. Read off the Concepts that were asked for, not off the English: a
 * shift forward is future whatever words carried it, and "what time will it be in 5 hours"
 * answered "It is 4:02 PM" because the copula was hardcoded.
 */
const AHEAD = new Set(["Tomorrow", "DayAfter", "HourAfter", "Later", "After"]);
const BEHIND = new Set(["Yesterday", "DayBefore", "HourBefore", "Earlier", "Before", "Ago"]);
const SHIFTS = new Set(["ShiftHours", "ShiftDays"]);

export function tense(asked: Expr | undefined): "is" | "will be" | "was" {
  if (asked === undefined) return "is";
  let answer: "is" | "will be" | "was" = "is";
  for (const node of walk(asked)) {
    if (!isCall(node)) continue;
    if (SHIFTS.has(node.head)) {
      // The sign of the shift is the tense. Nothing else needs to know about time.
      const by = node.args[1]?.value;
      if (typeof by === "number" && by !== 0) answer = by > 0 ? "will be" : "was";
      continue;
    }
    if (AHEAD.has(node.head)) answer = "will be";
    else if (BEHIND.has(node.head)) answer = "was";
  }
  return answer;
}

/**
 * A date or a clock time is worth rendering directly: the model adds nothing and can get
 * it wrong. A `spoken` field is a rendering the graph already chose, so it wins outright —
 * that is the whole reason Format carries one instead of collapsing to a string.
 */
function direct(result: Expr, when: "is" | "will be" | "was"): string | undefined {
  const answer = isCall(result) && result.head === "Answer" ? result.args[0]?.value : result;
  if (!answer || !isCall(answer)) return undefined;
  if (answer.head !== "Date" && answer.head !== "Time") return undefined;
  const field = (name: string): string | number | undefined => {
    const found = answer.args.find((a) => a.name === name)?.value;
    return typeof found === "string" || typeof found === "number" ? found : undefined;
  };

  const spoken = field("spoken");
  if (answer.head === "Time") {
    if (spoken !== undefined) return `It ${when} ${spoken}.`;
    const hour = field("hour");
    const minute = field("minute");
    if (hour === undefined || minute === undefined) return undefined;
    return `It ${when} ${hour}:${String(minute).padStart(2, "0")}.`;
  }

  if (spoken !== undefined) return `${spoken}.`;
  const year = field("year");
  const said = answer.args.find((a) => a.name === "month")?.value;
  const month = field("month") ?? (said !== undefined && isCall(said) ? said.head : undefined);
  const day = field("day");
  const weekday = field("weekday");
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const name = typeof month === "string" ? month : months[Number(month) - 1] ?? String(month);
  return `${weekday ? `${weekday}, ` : ""}${name} ${day}, ${year}.`;
}

/**
 * An anonymous unknown that survived evaluation is the system missing an INPUT, not an
 * answer and not a failure. The honest response is the question it implies. Handing the
 * residual to the model instead got "The result is an unbound variable named _".
 */
function question(result: Expr): string | undefined {
  let asked: string | undefined;
  const find = (e: Expr): void => {
    if (!isCall(e)) return;
    const direct = e.args.some(
      (a) => typeof a.value === "object" && a.value !== null && "variable" in a.value && a.value.variable === ANON,
    );
    // Innermost wins: the deepest call holding the unknown is the one missing its values.
    if (direct) asked = e.head;
    for (const a of e.args) find(a.value);
  };
  find(result);
  if (!asked) return undefined;
  const verb = asked.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return `What should I ${verb}?`;
}

export interface Unrealized {
  readonly identity: string;
  readonly kind: "unknown" | "inert" | "reference" | "empty";
}

export interface SayOptions extends ModelOptions {
  /** What the graph could not realize. Its presence means this is not an answer. */
  unrealized?: readonly Unrealized[];
  /**
   * The result still contains an expression that never ran.
   *
   * Separate from `unrealized`, because a result can be entirely uncomputed with nothing
   * learnable about it -- an unresolved Ref explains every residual above it, and a Ref is
   * a Marker. That combination handed the model an unevaluated comparison and it answered
   * from its own knowledge, correctly, which is worse than answering wrongly.
   */
  uncomputed?: boolean;
  /** What was asked, so the answer can be placed in time the way the question was. */
  asked?: Expr;
}

/**
 * Small talk has one right reply each, so it is said directly: a model adds nothing but
 * latency, and "I acknowledge that" was what it added to "cool".
 */
const SOCIAL: Record<string, string> = {
  Hello: "Hello!",
  Goodbye: "Goodbye!",
  YoureWelcome: "You're welcome!",
  DoingWell: "I'm doing well, thanks for asking!",
  GotIt: "Got it.",
  GladYouLikeIt: "Glad you like it!",
  Laughing: "Ha!",
  Sorry: "Sorry about that.",
  Okay: "Okay.",
};

/**
 * The answers with one right wording, said without a model: small talk, not knowing, a
 * follow-up number, a date or a time, a missing input. Undefined when a model is needed.
 */
/**
 * A move in a game has one right wording, and a model asked to narrate a board placed the
 * pieces wherever it liked. So a game reply is said directly: what was played, how it
 * stands, and the board as a grid.
 */
function game(result: Call): string {
  const parts = result.args.filter((a) => a.name === undefined).map((a) => a.value).filter(isCall);
  const echo = result.args.find((a) => a.name === "echo")?.value;
  const against = typeof echo === "string" ? echo : "the game";
  const mine = against.endsWith("against me");
  const square = (e: Expr | undefined): string => (e !== undefined && isCall(e) ? e.head : "?");
  const lines: string[] = [];
  const moved = parts.filter((p) => p.head === "Moved");
  if (parts.some((p) => p.head === "Started")) lines.push(`${against}. You're X, you go first.`);
  if (parts.some((p) => p.head === "Resumed")) lines.push(`Back to ${against}.`);
  if (moved.length) {
    lines.push(
      moved
        .map((m, i) => (mine ? `${i === 0 ? "You" : "I"} played ${square(m.args[1]?.value)}.` : `${square(m.args[0]?.value)} played ${square(m.args[1]?.value)}.`))
        .join(" "),
    );
  }
  const illegal = parts.find((p) => p.head === "Illegal");
  if (illegal) {
    const reason = illegal.args.find((a) => a.name === "reason")?.value;
    lines.push(`You can't play ${square(illegal.args[0]?.value)}${typeof reason === "string" ? `: it's ${reason}` : ""}.`);
  }
  if (parts.some((p) => p.head === "TookBack")) lines.push("Took that back.");
  if (parts.some((p) => p.head === "NothingToTakeBack")) lines.push("There's nothing to take back.");
  const won = parts.find((p) => p.head === "Won");
  if (won) {
    const who = square(won.args[0]?.value);
    lines.push(mine ? (who === "X" ? "You win!" : "I win!") : `${who} wins!`);
  }
  if (parts.some((p) => p.head === "Drawn")) lines.push("It's a draw.");
  const board = parts.find((p) => p.head === "Board");
  // Labelled the way squares are named: a letter for the column, a number for the row.
  if (board) lines.push(["  a b c", ...board.args.map((a, i) => `${i + 1} ${String(a.value).split("").join(" ")}`)].join("\n"));
  return lines.join("\n");
}

function plainly(result: Expr, options: SayOptions): string | undefined {
  if (isCall(result) && result.head === "InGame") return game(result);
  if (isCall(result) && result.head === "NothingOpen") return "There's no game going. Say \"let's play tic tac toe\" to start one.";
  // "Which Greg do you mean: your coworker, or your cousin?"
  if (isCall(result) && result.head === "Which") {
    const name = result.args[0]?.value;
    // People are told apart by `described`; games by the names listed in place.
    const described = result.args.find((a) => a.name === "described")?.value ?? result.args[1]?.value;
    const options = described !== undefined && isCall(described) ? described.args.map((a) => String(a.value)) : [];
    const person = result.args.some((a) => a.name === "described");
    // A word's senses are said as the kinds they are: "the frozen dessert, or the single".
    const sense = result.args.some((a) => a.name === "sense");
    const who = sense && name !== undefined && isCall(name) ? words(name.head) : person && name !== undefined && isCall(name) ? name.head : "game";
    const said = sense ? options.map((o) => `the ${o}`) : options;
    return `Which ${who} do you mean: ${said.slice(0, -1).join(", ")}${said.length > 1 ? ", or " : ""}${said[said.length - 1] ?? ""}?`;
  }
  const answered = isCall(result) && result.head === "Answer" ? result.args[0]?.value : result;
  if (answered !== undefined && isCall(answered) && answered.args.length === 0 && SOCIAL[answered.head]) return SOCIAL[answered.head];
  // Not knowing is said plainly: "I don't know your favorite food yet".
  if (answered !== undefined && isCall(answered) && answered.head === "Unknown") {
    const what = answered.args[0]?.value;
    const phrase = (e: Expr | undefined): string => {
      if (e === undefined || !isCall(e)) return "";
      const OWN: Record<string, string> = { My: "your", Your: "my", Our: "our" };
      const rest = e.args.length === 1 ? phrase(e.args[0].value) : "";
      return [OWN[e.head] ?? words(e.head), rest].filter(Boolean).join(" ");
    };
    const said = phrase(what);
    return said ? `I don't know ${said} yet.` : "I don't know that yet.";
  }
  if (answered !== undefined && isCall(answered) && answered.head === "Forgotten") {
    const what = answered.args[0]?.value;
    const count = answered.args[1]?.value;
    const said = answered.args.find((a) => a.name === "said")?.value;
    const topic = typeof said === "string" ? said : what !== undefined && isCall(what) ? words(what.head) : "that";
    return count === 0 ? `You haven't told me anything about ${topic}.` : `Done. I've forgotten what you told me about ${topic}.`;
  }
  // "and plus 3?" works on an answer the message never states, and a model shown only the
  // message and 87 added the 3 again. A number from a follow-up is said as it is.
  const followUp = options.asked !== undefined && [...walk(options.asked)].some((n) => isCall(n) && n.head === "Ref");
  if (typeof answered === "number" && followUp) return `That makes ${Number.isInteger(answered) ? answered : +answered.toFixed(6)}.`;
  return direct(result, tense(options.asked)) ?? question(result);
}

export async function say(
  message: string,
  result: Expr,
  options: SayOptions = {},
): Promise<string> {
  // Several answers to one message: said one after another when each has one wording,
  // otherwise together, so the model sees which part of the message each one answers.
  const parts = isCall(result) && result.head === "Sequence" && result.args.length > 1 ? result.args.map((a) => a.value) : [result];
  const plain = parts.map((p) => plainly(p, options));
  if (plain.every((p) => p !== undefined)) return plain.join(" ");

  // Say plainly that it did not work out, rather than describing the expression that
  // failed to, or worse, answering it from memory.
  if (options.unrealized?.length || options.uncomputed) {
    return unresolved(message, result, options.unrealized ?? []);
  }

  // Nothing has a wording for it yet. Said as that, with the answer shown as it was worked
  // out, never handed to a model to put in words the graph did not choose (packs/english.ncon
  // is where a wording goes).
  if (typeof result === "number" || typeof result === "string") return String(result);
  return `I worked that out, but I don't know how to say it yet: ${format(result)}`;
}
