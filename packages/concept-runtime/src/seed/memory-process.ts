/**
 * memory-spec build steps 5 and 6: focus, routing, and processes
 * (design/memory-spec.md Parts 5.5, 6.1, 7, 8, 18).
 *
 * Two halves. The machinery knows nothing about any game: it starts a process by minting it,
 * folds its committed moves into its state, retracts, resumes, derives what is open and what
 * a conversation is focused on, and routes a bare request by the Part 8.2 order. The kind
 * holds the rules (Part 7.1): tic-tac-toe here, as `TicTacToe(Begin())`, `Apply`,
 * `Outcome` and `Reply` realizations on its own unit, so a second game is one more unit and
 * nothing about it is repeated per game or per instance.
 *
 * Nothing is cached. The state is a fold over stamped relations every time it is read; a
 * cached board would be a second copy of what the moves already say (Part 7.2's cell is left
 * out on purpose).
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

/**
 * What every process realization reads: its relations, its kind, what is open, the fold,
 * how it is said, and the resolution order.
 */
const PROCESS = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
  const named = (e, n) => (isCall(e) ? e.args.find((a) => a.name === n)?.value : undefined);
  const holds = (id, head) => (api.store.get(id)?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === head);
  const kinds = (id) => holds(id, "IsA").map((r) => positional(r.claim)[0]).filter(isCall).map((k) => k.head);
  // A kind that defines an ending makes its individuals processes (Part 7.4).
  const ends = (kind) => holds(kind, "DefinesEnding").length > 0;
  const kindOf = (id) => kinds(id).find(ends);
  // Open is derived, never stored: an individual of such a kind with no Ended.
  const open = () => {
    const out = new Set();
    for (const m of api.store.mentioning(api.call("DefinesEnding"))) {
      if (!isCall(m.relation.claim) || m.relation.claim.head !== "DefinesEnding") continue;
      for (const t of api.store.asObject(m.identity)) {
        if (t.predicate === "IsA" && !holds(t.subject, "Ended").length) out.add(t.subject);
      }
    }
    return [...out];
  };
  const rule = (kind, name, ...values) => api.evaluate(api.call(kind, api.call(name, ...values)));
  // Committed moves as (relation, stamp) pairs in seq order, less what a Retracts names
  // (Parts 4.3, 7.2, 7.3). The same move made twice is one relation with two stamps.
  const history = (game) => {
    const retracted = new Set(holds(game, "Retracts").map((r) => positional(r.claim)[0]));
    const moves = [];
    for (const r of holds(game, "Moved")) {
      for (const stamp of r.stamps ?? []) if (!retracted.has(stamp.seq)) moves.push({ move: r.claim, stamp });
    }
    return moves.sort((a, b) => a.stamp.seq - b.stamp.seq);
  };
  const fold = async (game) => {
    const kind = kindOf(game);
    let state = await rule(kind, "Begin");
    for (const { move } of history(game)) state = named(await rule(kind, "Apply", state, move), "after") ?? state;
    return state;
  };
  const players = (game) => positional(holds(game, "Players")[0]?.claim).filter(isCall).map((p) => p.head);
  const user = (create) => {
    const held = api.store.asObject("User").find((t) => t.predicate === "IsA");
    if (held) return held.subject;
    if (!create) return undefined;
    const id = api.store.mint("User");
    api.store.addRelation(id, api.call("IsA", api.call("User")), undefined, api.trace.cause);
    return id;
  };
  // The echo (Part 8.2): which process this was, by its lasting facts, never its identity.
  const echo = (game) => {
    const spoken = (head) => head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    const called = (id) => (id === "Self" ? "me" : api.store.asSubject(id).find((t) => t.predicate === "Named")?.object ?? "someone");
    const others = players(game).filter((p) => p !== user(false));
    const text = spoken(kindOf(game)) + (others.length ? " against " + others.map(called).join(" and ") : "");
    return text[0].toUpperCase() + text.slice(1);
  };
  const inGame = (game, ...values) => ({
    head: "InGame",
    args: [{ value: api.call(game) }, { name: "echo", value: echo(game) }, ...values.map((value) => ({ value }))],
  });
  // What this conversation is focused on, most recent first, as the Focused facets say.
  const focused = () => {
    const ctx = api.context;
    const facets = isCall(ctx) && ctx.head === "Context" ? ctx.args.map((a) => a.value) : [ctx];
    return facets.filter((f) => isCall(f) && f.head === "Focused" && isCall(positional(f)[0])).map((f) => positional(f)[0].head);
  };
  // Whether a process is what a word in a description names: its kind, a kind above it, or
  // an individual it holds a relation about ("the game against Greg").
  const is = (game, head) =>
    kinds(game).includes(head) ||
    kinds(game).some((k) => kinds(k).includes(head)) ||
    (api.store.get(game)?.relations ?? []).some((r) => JSON.stringify(r.claim).includes('"head":"' + head + '"'));
  /**
   * Part 8.2, in order: an explicit description; the one candidate where the request is
   * legal; the most recently focused; otherwise ask. \`description\` is what the request said
   * about which one; attempt(game) is what the request would do there, undefined where it is
   * not a request that game takes at all.
   */
  const resolve = async (request, description, attempt) => {
    const ranked = focused();
    const all = open();
    let pool = [...ranked.filter((g) => all.includes(g)), ...all.filter((g) => !ranked.includes(g))];
    const wanted = new Set();
    const visit = (e) => {
      if (!isCall(e)) return;
      const to = named(e, "resolvedTo");
      if (isCall(to)) wanted.add(to.head);
      else if (pool.some((g) => is(g, e.head))) wanted.add(e.head);
      for (const v of positional(e)) visit(v);
    };
    for (const v of description) visit(v);
    if (wanted.size) pool = pool.filter((g) => [...wanted].every((w) => is(g, w)));
    const tried = [];
    for (const game of pool) {
      const result = await attempt(game);
      if (result !== undefined) tried.push({ game, result });
    }
    const legal = tried.filter((t) => !(isCall(t.result) && t.result.head === "Illegal"));
    if (legal.length === 1) return legal[0];
    if (!legal.length) return tried[0];
    if (ranked.includes(legal[0].game)) return legal[0];
    return { ask: api.call("Which", request, api.call("List", ...legal.map((t) => echo(t.game)))) };
  };
`;

const game = (pattern: string, body: string, context?: string) =>
  realization({
    pattern,
    ...(context === undefined ? {} : { context }),
    properties: ["Effectful()"],
    evaluateArguments: false,
    body: code(`async (args, bindings, api) => {
      ${PROCESS}
      ${body}
    }`),
  });

/** "take back", "undo": the last move goes, and a reply goes with the move it answered. */
const takeBack = (head: string) =>
  game(
    `${head}(Rest($_))`,
    `const game = bindings.get("game").head;
  const live = history(game);
  const last = live[live.length - 1];
  if (!last) return inGame(game, api.call("NothingToTakeBack"));
  const back = [last];
  const before = live[live.length - 2];
  if (before && last.stamp.source === before.stamp.seq) back.unshift(before);
  for (const b of back) api.store.addRelation(game, api.call("Retracts", b.stamp.seq), undefined, api.trace.cause);
  return inGame(game, api.call("TookBack", ...back.map((b) => b.move)), await fold(game));`,
    "Context(Execution(), Focused($game))",
  );

function machinery(): ConceptUnit[] {
  return [
    ...["InGame", "Which", "Illegal", "TookBack", "NothingToTakeBack", "NothingOpen", "Started", "Won", "Drawn", "Ongoing"].map((r) =>
      concept(r, { relations: ["IsA(Result())"] }),
    ),
    concept("Process", { relations: ["IsA(Category())"] }),
    concept("Game", { relations: ["IsA(Process())"] }),
    concept("DefinesEnding", { relations: ["IsA(RelationProperty())"] }),
    // Who is in it lasts; a move, a takeback, a resumption and an ending happen (Part 5.3).
    concept("Players", { relations: ["Enduring()"] }),
    ...["Moved", "Retracts", "Resumed", "Ended"].map((r) => concept(r, { relations: ["Occurrent()"] })),

    /**
     * `Focus(conversation)` (Part 8.1): the open processes this conversation addressed, most
     * recent first. Addressed means a stamp on the process whose source chain reaches a
     * `Said` on the conversation, so starting, moving and resuming all count and nothing
     * stores focus. Nothing but this realization decides what a conversation is focused on.
     */
    concept("Focus", {
      realizations: [
        realization({
          pattern: "Focus($conversation)",
          evaluateArguments: false,
          body: code(`(args, bindings, api) => {
            ${PROCESS}
            const conversation = args[0].value;
            if (!isCall(conversation) || !kinds(conversation.head).includes("Conversation")) return api.call("Focus", conversation);
            const from = (stamp) => {
              for (let s = stamp, i = 0; s && s.source !== undefined && i < 32; i++) {
                const cause = api.store.findStamp(s.source);
                if (!cause) return false;
                if (cause.identity === conversation.head) return true;
                s = cause.stamp;
              }
              return false;
            };
            const addressed = open()
              .map((g) => ({ game: g, last: Math.max(0, ...(api.store.get(g)?.relations ?? []).flatMap((r) => r.stamps ?? []).filter(from).map((s) => s.seq)) }))
              .filter((x) => x.last > 0);
            // Step 3 of Part 8.2 ranks by recency. Activation (Part 10.1) replaces this one line.
            const rank = (xs) => xs.sort((a, b) => b.last - a.last);
            return api.call("List", ...rank(addressed).map((x) => api.call("Focused", api.call(x.game))));
          }`),
        }),
      ],
    }),
    /**
     * The facet `Focus` produces. A facet with an argument is never lifted out of a message
     * (only a nullary one is), so it enters context only through `Focus`.
     */
    concept("Focused", { relations: ["IsA(ContextFacet())"] }),

    /**
     * "let's play tic tac toe": starting is declared, so it mints (Part 6.1). The opponent is
     * whoever "against" or "with" names, and the system when that is nobody else. A request
     * that names no process kind is a move ("play b2").
     */
    concept("Play", {
      realizations: [
        game(
          "Play(Rest($args))",
          `const [first, ...rest] = args.map((a) => a.value);
          if (!isCall(first) || !ends(first.head)) {
            const moved = await api.evaluate(api.call("Move", ...args.map((a) => a.value)));
            return isCall(moved) && moved.head === "Move" ? api.call("Play", ...args.map((a) => a.value)) : moved;
          }
          const me = user(true);
          const rival = rest.map((e) => (isCall(e) && ["Against", "With", "Versus"].includes(e.head) ? positional(e)[0] : undefined)).find(isCall);
          let opponent = "Self";
          if (rival && rival.head !== "Me" && rival.head !== "You") {
            const to = named(rival, "resolvedTo");
            const text = rival.head;
            opponent = isCall(to) ? to.head : api.store.asObject(api.format(text)).find((t) => t.predicate === "Named")?.subject;
            if (!opponent) {
              opponent = api.store.mint(text);
              api.store.addRelation(opponent, api.call("Named", text), undefined, api.trace.cause);
            }
          }
          const game = api.store.mint("Game");
          api.store.addRelation(game, api.call("IsA", api.call(first.head)), undefined, api.trace.cause);
          api.store.addRelation(game, api.call("Players", api.call(me), api.call(opponent)), undefined, api.trace.cause);
          return inGame(game, api.call("Started"), await fold(game));`,
          "Context(Execution(), Imperative())",
        ),
      ],
    }),
    /** "let's X" proposes doing X together, which from the system's side is doing X. */
    concept("Let", {
      realizations: [
        realization({
          pattern: "Let(We(), $x)",
          context: "Context(Execution(), Imperative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => await api.evaluate(args[1].value)`),
        }),
      ],
    }),

    /**
     * A move (Part 5.5): routed by Part 8.2, then committed on the process it resolved to,
     * sourced from the request, which records the resolution once (Part 8.3). An illegal
     * move commits nothing and answers with the kind's failure. When the system plays, its
     * reply is committed in the same turn, sourced from the move it answers, and said in the
     * reply's `Said(Self(), ...)`. A win or draw is `Ended`, which closes the process.
     */
    concept("Move", {
      realizations: [
        game(
          "Move(Rest($args))",
          `const request = api.call("Move", ...args.map((a) => a.value));
          // The first argument is the move; anything after it says which game ("b2 in the game against greg").
          const found = await resolve(request, positional(request).slice(1), async (g) => {
            const kind = kindOf(g);
            const r = await rule(kind, "Apply", await fold(g), request);
            return isCall(r) && r.head === kind ? undefined : r;
          });
          if (!found) return request;
          if (found.ask) return found.ask;
          const { game, result } = found;
          if (result.head === "Illegal") return inGame(game, result);
          const kind = kindOf(game);
          const moved = api.call("Moved", ...positional(result));
          let stamp = api.store.addRelation(game, moved, undefined, api.trace.cause);
          const committed = [moved];
          let state = named(result, "after");
          let outcome = await rule(kind, "Outcome", state);
          if (outcome.head === "Ongoing" && players(game).includes("Self")) {
            const reply = await rule(kind, "Apply", state, api.call("Move", await rule(kind, "Reply", state)));
            const answer = api.call("Moved", ...positional(reply));
            stamp = api.store.addRelation(game, answer, undefined, stamp.seq);
            committed.push(answer);
            state = named(reply, "after");
            outcome = await rule(kind, "Outcome", state);
          }
          if (outcome.head !== "Ongoing") api.store.addRelation(game, api.call("Ended", outcome), undefined, stamp.seq);
          return inGame(game, ...committed, state, ...(outcome.head === "Ongoing" ? [] : [outcome]));`,
        ),
      ],
    }),

    /**
     * "continue the game" (Part 7.7): the description resolves against what is open, and
     * the one it names is resumed here, a relation sourced from this conversation, which is
     * what puts it in this conversation's focus.
     */
    concept("Continue", {
      realizations: [
        game(
          "Continue(Rest($args))",
          `const said = args.map((a) => a.value);
          const found = await resolve(api.call("Continue", ...said), said, async () => api.call("Resumed"));
          if (!found) return api.call("NothingOpen");
          if (found.ask) return found.ask;
          api.store.addRelation(found.game, api.call("Resumed"), undefined, api.trace.cause);
          return inGame(found.game, api.call("Resumed"), await fold(found.game));`,
        ),
      ],
    }),

    /**
     * "take b2": taking a square is moving there. Anything else is taken as `Take` always
     * took it (`everyday.ts`), a number as the start of a chain, the rest left as said.
     */
    concept("Take", {
      realizations: [
        realization({
          pattern: "Take($x)",
          context: "Context(Execution(), Imperative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const x = args[0].value;
            if (typeof x === "number") return x;
            const taken = await api.evaluate(x);
            return taken && taken.head === "InGame" ? taken : api.call("Take", taken);
          }`),
        }),
      ],
    }),

    // Bound from context by subset matching (Part 8.2): the first Focused facet is the most
    // recently focused process, so "take back" and "show the board" need no dispatcher.
    concept("TakeBack", { realizations: [takeBack("TakeBack")] }),
    concept("Undo", { realizations: [takeBack("Undo")] }),
    concept("Board", {
      realizations: [
        game("Board($game)", `return kindOf(args[0].value?.head) ? await fold(args[0].value.head) : api.call("Board", args[0].value);`),
        game("Board()", `const game = bindings.get("game").head; return inGame(game, await fold(game));`, "Context(Execution(), Focused($game))"),
      ],
    }),
  ];
}

/**
 * Tic-tac-toe's rules, on the kind. A board is `Board("X..", ".O.", "...")`, rows 1 to 3,
 * columns a to c; X moves first. `Apply` answers the move as it would be committed, with the
 * board after it, or `Illegal(square, reason=...)`; anything that is not a square is left
 * residual, so routing knows the request is not a move in this game.
 */
const TTT = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const cells = (board) => board.args.map((a) => a.value).join("").split("");
  const toBoard = (cs) => api.call("Board", cs.slice(0, 3).join(""), cs.slice(3, 6).join(""), cs.slice(6).join(""));
  const index = (sq) => (isCall(sq) && /^[A-C][1-3]$/.test(sq.head) ? (Number(sq.head[1]) - 1) * 3 + "ABC".indexOf(sq.head[0]) : -1);
  const square = (i) => "ABC"[i % 3] + (Math.floor(i / 3) + 1);
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const winner = (cs) => LINES.map((l) => l.map((i) => cs[i]).join("")).find((s) => s === "XXX" || s === "OOO")?.[0];
  const toMove = (cs) => (cs.filter((ch) => ch !== ".").length % 2 ? "O" : "X");
`;

const ticTacToeRule = (pattern: string, body: string) =>
  realization({
    pattern: `TicTacToe(${pattern})`,
    evaluateArguments: false,
    body: code(`(args, bindings, api) => {
      ${TTT}
      ${body}
    }`),
  });

function ticTacToe(): ConceptUnit[] {
  const squares = ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"];
  return [
    concept("TicTacToe", {
      relations: ["IsA(Game())", "DefinesEnding()"],
      realizations: [
        ticTacToeRule("Begin()", `return toBoard(".........".split(""));`),
        ticTacToeRule(
          "Apply($board, $move)",
          `const move = bindings.get("move");
          const sq = move.args.map((a) => a.value).find((e) => index(e) >= 0);
          if (!sq) return api.call("TicTacToe", api.call("Apply", bindings.get("board"), move));
          const cs = cells(bindings.get("board"));
          const illegal = (reason) => ({ head: "Illegal", args: [{ value: api.call(sq.head) }, { name: "reason", value: reason }] });
          if (winner(cs) || !cs.includes(".")) return illegal("the game is over");
          if (cs[index(sq)] !== ".") return illegal("taken");
          const mark = toMove(cs);
          cs[index(sq)] = mark;
          return { head: "Moved", args: [{ value: api.call(mark) }, { value: api.call(sq.head) }, { name: "after", value: toBoard(cs) }] };`,
        ),
        ticTacToeRule(
          "Outcome($board)",
          `const cs = cells(bindings.get("board"));
          const won = winner(cs);
          return won ? api.call("Won", api.call(won)) : cs.includes(".") ? api.call("Ongoing") : api.call("Drawn");`,
        ),
        // Win, else block, else the best free square: centre, corners, edges.
        ticTacToeRule(
          "Reply($board)",
          `const cs = cells(bindings.get("board"));
          const me = toMove(cs);
          const free = cs.map((ch, i) => (ch === "." ? i : -1)).filter((i) => i >= 0);
          const finishing = (m) => free.find((i) => { const t = [...cs]; t[i] = m; return winner(t) === m; });
          const pick = finishing(me) ?? finishing(me === "X" ? "O" : "X") ?? [4, 0, 2, 6, 8, 1, 3, 5, 7].find((i) => free.includes(i));
          return api.call(square(pick));`,
        ),
      ],
    }),
    ...["X", "O"].map((m) => concept(m, { relations: ["IsA(Mark())"] })),
    concept("Mark", { relations: ["IsA(Category())"] }),
    /** A square said on its own under an order ("b2") is a move there. */
    concept("Square", {
      relations: ["IsA(Category())"],
      realizations: [
        realization({
          pattern: "$square",
          context: "Context(Execution(), Imperative())",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            const said = bindings.get("square");
            const moved = await api.evaluate(api.call("Move", api.call(said.head), ...said.args.map((a) => a.value)));
            return moved && moved.head === "Move" ? said : moved;
          }`),
        }),
      ],
    }),
    ...squares.map((s) => concept(s, { relations: ["IsA(Square())"] })),
  ];
}

export function memoryProcessUnits(): ConceptUnit[] {
  return [...machinery(), ...ticTacToe()];
}
