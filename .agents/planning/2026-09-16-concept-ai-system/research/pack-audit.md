# Pack audit (2026-10-12)

Are the 38 packs worth keeping? Measured with `node scripts/audit-packs.mjs` on 234 turns: the
frames cases, the 88 hearing gold cases, the novel-prompts set and three probe lists. Learning was
off, the DailyDialog corpus was absent, and there was no network. Results are in
`eval/packs/audit.json`.

- **Used** counts the turns where a realization from the pack was selected.
- **Changed/lost** is the result of removing the pack and every pack that requires it: how many
  answers changed, and how many expected answers were lost (65 in total).
- `--alone=a,b` removes one pack and keeps its dependents, then prints the answers that changed.

The noise floor is about 5 changed answers. These are clock answers ("what time is it") that
move between runs.

## Verdict

| Pack | Lines | Used (turns) | Removed: changed / lost | Verdict |
|---|---|---|---|---|
| basic, core, code | 13.3k | 233 / 137 / 124 | 234 / 64 | Keep. Everything stands on them. |
| mood | 1.6k | 136 | 135 / 2 | Keep. Every told or asked line goes through it ("mood" as in grammatical mood). A clearer name would help. |
| english | 2.7k | (own runtime) | 210 / 21 | Keep. All the wording. |
| hearing | 5.2k | (own runtime) | 182 / 28 | Keep. Rules hearing is still the fallback for 1 message in 4. |
| frames | 260 | (own runtime) | 81 / 6 | Keep. Statements, claims, "remember", choosing between readings. |
| everyday | 1.0k | 24 | 26 / 4 | Keep. Average, half, "calculate", days until Christmas, "that was wrong". |
| holes | 198 | 6 | 11 / 7 | Keep. Claim checks ("It's actually 4, not 5") and "9 minus what?". |
| self | 181 | 4 | 13 / 0 | Keep. "who are you", "how are you", "what can you do". |
| python, javascript, typescript, codewords | 2.8k | (code reading) | 28–30 / 2 | Keep. Explaining and fixing code. |
| units, focus, holding, members | 3.4k | 22 / 30 / 49 / 12 | 6–11 / 0 | Keep. Conversions, "it/that", lists made in conversation. |
| dialogue | 647 | 48 | 22 / 1 (alone) | Keep the Talk concepts and fix the reply. See below. |
| pursue | 3.4k | 81 | 23 / 0 (alone) | Fix. It answers when it shouldn't. See below. |
| judge | 673 | 2 | 1 real change | Fix or remove. Its only effect is a wrong answer. |
| predict, words, memory, belief | 1.9k | 0–37 | 1–4 real changes | Keep for now. They do little on this set. |
| weather, world, sparql, reference, pages, grounding, plan | 4.2k | 0–63 | noise | Not measurable here: each needs the network or learning. Covered by unit tests. |
| primitives, codebinds, codereadings | 625 | 0 | noise | Keep. They serve code writing and code hearing. |
| judgment | 94 | 0 | noise | Keep. `napkin --evidence` reads it. |
| code-hearing | **10.5k** | 0 | noise | **Decide.** It is an alternative code reader that is not on the live path (tree-sitter reads code). Only `hear.test.ts` and `scripts/scoreboard.mjs` use it. It is the biggest pack and does nothing in conversation. |

No pack is stupid outright. Only a few cost more than they give:

### pursue and judge: confident wrong answers

With the pack present, and without it:

- "What is todays date?" gets **"Yes."** With pursue removed: "I don't know that yet."
- "how you doing?" gets **"Arithmetic."** (pursue plus self's list of capabilities). Without either: "I don't know you doing yet."
- "which is bigger, a mouse or an elephant" gets **"Both are kinds of elephant."** (judge, with nothing grounded). Without: "I don't know yet."
- To pursue's credit: "what concepts do you know about time" gets "Time is a deictic, answered by date."

Pursue looks for an answer to whatever the hearing left over, and it takes the first thing it
finds. The fix is the same one the frames already use: an answer has to account for what was
asked (`AnsweredBy`, every word used), or it is not given. Judge shouldn't answer a choice when
neither side is grounded.

### dialogue: the "talk to your son" reply

"My car broke down :(" was answered "…Have you tried talking to your son about it?" That line is
DailyDialog's: the nearest utterance in the corpus and how a person once answered it. The match
is by surface words, so the reply fits the corpus, not the message. The corpus is also CC
BY-NC-SA, which means non-commercial only. Its other concepts are worth keeping: without them,
"what is my name" is heard as "talk my name".

Changed today (packs/follows.ncon, below): a told event is answered from what the graph knows
follows from it, and from how its words feel. The corpus line is now used only when it is close
to what was said.

## Smells

Word lists or regex alternations inside packs:

- coding: 2 lists
- pursue: 1 list (HTML tags, which is legitimate)
- basic, hearing, words, world: 1 regex each

All are small. None decides meaning on the main path.

## Unit tests

3 tests fail on main, before today's changes:

- `chat.test` "when you say hello?"
- `focus.test` "supplies list"
- `pursue.test` "cake recipe"

7 are marked TODO.

## Follows: what an event leads to, and how it feels (added with this audit)

- **ConceptNet** (src/research/conceptnet.ts). A told event is named the way ConceptNet names one.
  "I lost my job" becomes "losing your job", then "lose your job", then the bare doing. It is looked
  up once (at most 4 lookups per message, one a second). Only the relations that say what an event
  leads to are kept: Causes, CausesDesire, HasSubevent, HasPrerequisite, MotivatedByGoal, Entails.
  They come from one CC BY-SA import stamp per event.
- **VADER** (src/research/feeling.ts, MIT lexicon, via vader-sentiment). Each word's valence is
  learned the first time it is said and kept as `Word_broke Valence(-1.8)`. A word the tagger
  calls negative just before it turns the valence round.
- **The reply** (`Follows`, then `Note`). For example: "That doesn't sound good. Losing your job
  can cause depression or sadness. Do you want to find a new job?" When nothing is known of the
  event: "Sorry to hear that."

Honest limits:

- ConceptNet's event coverage is thin and noisy. In the 2014 English data (ConceptNet 4, checked
  here) there is nothing for what breaking down causes. "car" only has CapableOf (crash, go fast).
  The car example gets the feeling and nothing more.
- ATOMIC 2020 (CC BY) is the dataset built for exactly this: "PersonX's car breaks down" leads to
  frustrated, wants to call a tow truck. It would be the better source. It could be fetched at
  build time, as DailyDialog is. It wasn't reachable from here.
- api.conceptnet.io wasn't reachable from here, so whether it is up, and whether it allows CORS for
  the browser, is untested. The tests run against a fake. When it fails, the reply falls back to
  the feeling.
