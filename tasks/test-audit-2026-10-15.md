# Test audit: 57 failing tests (of 489 run; 419 pass, 11 todo, 2 skipped)

Verdicts: S = SENSIBLE, TE = TOO EXACT, Q = OLD-PARSER QUIRK, W = WRONG.
Totals: S 14, TE 39, Q 4, W 0.
Method: ran the built tests in a copy (/tmp/claude-0/audit, output in /tmp/claude-0/audit-tests.txt), read each failing test source, and probed every assertion (including ones after the first failure) through `turn()` to see what the one reader actually says.

The single biggest pattern: tests that read `turn(...).rendered` (the IR string, e.g. `Answer(12)`, `Answer(Hello())`, `Answer(Greg_1())`) and compare with `assert.equal`. With the one reader, `rendered` is "" whenever it cannot read, and it is a different shape for some things that it can (`Answer(87)` vs `87`). The behaviour wanted (the sum, the greeting, the answer) is right; the pin on IR is not. Fix once: add a `said(text)` helper that returns `turn().spoken` and assert with a regex on the spoken line (digits, words), never on IR heads or relation names.

"Now" below is what the one reader actually returns today.

## src/code/coding.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 1 code shown is explained in words | `.reduce((a,b)=>a+b,0)` says "combined one by one through a function of a and b giving a plus b, starting from 0" | TE | Behaviour right (explain a reduce). Wording is one phrasing. Now: "I couldn't read that yet." twice (and "what does this do? `...`" is not read). | `match(said, /reduce|combin|sum|add/i)` and `/0/`; keep exact string only for the plain `add` function if wanted |
| 2 a file named is read | `/it defines functions parserFor\(grammar\) and readTree\(text, grammar, prefix\)/` | TE | Right to want a file read by path. Pins sentence shape. Now: "nothing for tree" (path `src/code/tree.ts` not recognised as a file). Also couples the test to the contents of tree.ts. | `match(said, /parserFor/)` and `/readTree/`; keep the "couldn't read src/no/such/file.ts" check (that one is fine) |
| 3 what looks wrong is found | "`x = 5` in the condition sets x instead of comparing it; you probably meant `x === 5`" | TE | Right to flag assignment-in-condition. Now: small-talk reply "Oh no, whats wrong with?". | `match(said, /x = 5/)` and `/(assign|sets|instead of compar|===)/i`. Also loosen "Nothing in it looks wrong to me." to `/nothing|no problem|looks fine/i` and the "Fixed:" opener |
| 5 written in another language, saved | `saved.said === "Saved to dist/coding-test-saved.js."` ; file text `function add(a, b) { return (a + b) }` | TE | "save it to path" must work (now small talk: "That's great that save it!"). Exact sentence and exact parenthesised JS are incidental. | `match(said, /saved/i)` + path; read the file back and check it parses and `add(2,3)===5` (or compare after normalising whitespace/parens) |
| 6 function found from examples | exact "Here's f, which gives back every example you gave:" + exact fence `function f(x) { return (x * 2) }`; also `((x * 2) + 1)`, `((a + b) * 0.5)`, `(x ** 2)` | TE | Right: infer a function from examples. Surface form of the formula is incidental (`2*x`, `x+x` are as good). Now: "I couldn't read that yet." | Extract the fenced code, `new Function` it, check it returns the examples (f(1)=2, f(2)=4, f(3)=6; g(10)=21; avg(2,4)=3) and one unseen point; keep `/^I couldn't find one rule for f/` loosened to `/couldn't find|no rule/i` |
| 7 Python, reads back as Concepts | python text `def h(x):\n    return ((x * 2) + 1)`; whole-writer string for `f(x, ys)` | TE | Round-trip check (`format(...)` equality) is good. The literal Python text pins parenthesisation. Now: "nothing for h" (examples request with "python" not read). | Keep the round-trip equality; for the examples request check `/```python/`, `/def h\(/` and run it; for the writer, parse the text with Python grammar rather than compare strings |
| 8 file fixed in place and saved | `/```typescript\nfunction check.../` for a `.js` file; `Saved to <path>.` | Q | A fix to a `.js` file shown as a `typescript` fence is an artefact of the importer (the reader labels everything TypeScript). A good assistant tags it javascript. Now: path `dist/coding-test-fix.js` is not read as a file ("nothing for dist and test"). | `match(said, /```(javascript|js|typescript)\n/)`; assert `x === 5` present and layout (indentation, trailing newline) kept in the saved file, which the last `readFileSync` equality already does |
| 10 what code gives | `It gives \`[2, 3]\`.`, `It gives 256.`, `It gives "ababab".` | TE | Right (evaluate shown code). Quote style/backticks incidental. Now: "I couldn't read that yet." | `/\[2, ?3\]/`, `/\b256\b/`, `/ababab/` |
| 11 reversal written from examples | `It gives "nikpan".`; function name `reverse`, `sort`, param `x` | TE | Right: write, then "run it with ..." on the previous code. Now "run it" gets "I don't see any code in that" (reference to the previous answer not resolved). Names/param names are incidental. | `match(said, /nikpan/)`; `/function \w+\(\w+\)/`; run the written code instead of matching names |
| 12 Concept no rule writes | `function half(x) { return (x / 2) }`, `reduce(...,0) / x.length`, `It gives 5.` | TE | Right. Same "it" reference gap. Pins name `half`/`average`/`double` and exact body. | Run the extracted function: half(10)===5, average([2,4,9])===5; `/\b5\b/` for the run-it reply |

## src/code/write.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 80 every source file reads, writes, reads back | `unwritable` is `[]` for every `src/**/*.ts` | S | A real gap in the code writer: new `src/frame/context.ts` has an `Object` (object literal with shorthand/template-literal values) the writer cannot write. Not a hearing issue. | none; fix the writer for that literal, or the test file list |

## src/frame/frames.test.ts (reader contract)

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 128 values taken by operations beside them | `format(read(...).result)` is `Answer(20)` for `what is (2+3)*4` (read returns undefined) | S | A grouped sum in symbols must be read. Asserting the reader's IR is OK for a reader unit test, but compare the value, not whole IR. | `valueOf(result) === 20` (strip `Answer(...)`) |
| 131 word a slip away read as the word that fits | `framed.text === "what is 6 times 7"` and `Answer(42)` | TE | The corrected-text field is internal. The behaviour (typo tolerance) is wanted. Now: `waht` not repaired (reads "Waht" as a name). | Drop `framed.text`; assert result value 42 only |
| 137 statement kept, read back | `my name is Sam / Bob` -> `Bob.`; `Rex.`; `Got it, I'll remember that.` | S | Newest wins is right (now "Sam and Bob."); dog's name must be read (now "I don't know Dog S declares name yet."). The ack string is too exact. | newest-wins: `/^Bob\b/` and not /Sam/; dog: `/Rex/`; ack: any of `/got it|remember|noted|okay/i` |
| 138 said again replaces, old stays history | `Me` has `Name(Sam())` retracted and `Name(Bob())` live | TE | The wanted behaviour is "newest wins, old not lost". The relation name `Name` and `retracted()` are storage details (reader now writes `DeclaresName`). Now: no `Name` relations. | Behavioural: after the two statements `what is my name` -> Bob; and a question for the earlier value (`what was my name`, or "what did I say my name was") -> Sam. Drop store inspection |
| 139 reported speech is its own frame | 3rd reply `Got it.`, `by === "frames"`; no `Name` kept on Me or Spielberg | S | Reported speech must not become a fact (that part holds); "he told me his name is Bob" must not answer "I have nothing for Bob". `by === "frames"` is TE (there is one reader now). | `spoken` not matching /stuck|nothing for/; replace `by` check with nothing; replace `Name` store check with "what is my name" -> /don't know/ |
| 144 one hole, list, of | last line `waht is 6 tims 7` -> `Answer(42)`; others `List(1, 2, 3)`, `/^Answer\(40\.8/` | S | Typos in a plain question: any assistant reads `waht is 6 tims 7`. Now: "Do you mean It's actually Waht, not 42...". The earlier lines are IR-pinned (TE). The comment about "want" realization is an old-parser detail. | Compare numbers: `valueOf(...)` 12, 6, [1,2,3], 17, 6, ~40.8, 42. Ambiguous typo should resolve, not ask a garbled "Do you mean" |
| 145 where reading got stuck | `Where I got stuck: I read 10 times 10, but couldn't fit "in", "roman" and "numerals" into it. I have nothing for "roman" yet.` | Q | The exact diagnostic sentence is the old reader's format. The behaviour that matters is that "10 times 10 in roman numerals" is not answered `100.` (silently dropping the clause is wrong; now it says "100."). Correct answers: "C", or "I can't do Roman numerals yet". | `notMatch(said[0], /^100\.?$/)` and `match(said[0], /roman|numeral/i)`; second: `match(said[1], /mayor|gotham/i)` and /don't know|can't|nothing/ |
| 146 round two | list of 12 exact strings: `June 3`, `May 12`, `Paris.`, `Yes, that's 100.`, `Got it, I'll remember that.` | TE | Behaviours wanted (birthday/anniversary/capital facts; "is 10 times 10 equal to 100" -> yes). Now: "nothing for birthday", "It's actually 100, not equal." (that last one is plainly wrong). Strings too exact. | per-turn regex: acks `/got it|noted|okay|remember/i`; dates `/june 3(rd)?/i`, `/(12(th)?.*may|may 12)/i`; `/paris/i`; `/^yes/i`; keep "actually 4, not 5" as `/4/` and `/not|actually|no/i` |
| 147 doing kept, newest wins | `where do i live` after phoenix then tucson -> `Tucson.` | S | Right (moving house): now "Phoenix and Tucson." `every by === "frames"` is TE. | `/tucson/i` and `not /phoenix/i` for the final turn; drop `.by` |
| 148 "bday means birthday" | `Tuesday, March 5, 1991`; `knownFrom(...)` matches `/Me Birthday\(Date\(year=1991/`; `hearingUsed === "frames"` | TE | A taught synonym must work, and "bday" not be looked up (looked-up check is good). Date format and provenance regex are incidental IR. Now: "I don't know your day yet." | `/march 5,? 1991/i`; for provenance check `knownFrom(...).length > 0` or says "you told me"; drop `hearingUsed` |
| 149 doing of someone not named yet | `5 apples.`, `Car.`, `3 pairs of shorts.` | S | Right (he vs she, a count kept as told). Now unread ("I couldn't read that"); "3 pairs." loses "of shorts". | `/5 apples/`, `/\bcar\b/i`, `/3 pairs of shorts/` |
| 151 postfix, bare number as age | `how old is tom` -> `30.` | S | Right. Now "nothing for tom" (lower-case name unseen). Assertion is fine; loosen `30.` to `/\b30\b/`. | `/\b30\b/` |
| 152 being born | `1990.`, `Paris.` | S | Right (`what year was i born` unread). | `/1990/`, `/paris/i` |
| 153 named someone is an individual | `Your friend.`, `Gunter.`, `Tom's brother.`; `Gunter_1` has `Named("Gunter")`; `Me` has `Name(Bob())` | S | Behaviour right (`who is gunter?` unread). The `Gunter_1` and `Name(Bob())` store checks are TE: internal ids/relation names. | `/friend/i`, `/gunter/i`, `/brother/i`; drop store checks; "my name is Bob" then "what is my name" -> Bob |
| 154 doings kept for later | `Milk and eggs.`, `Mom.` | S | Right (now "I worked something out but can't put it into words yet." which leaks). `what do i have to call` is odd English; use "who do I have to call". | `/milk/i` and `/eggs/i` (any order/join); `/mom/i` |
| 156 tims is still times | `waht is 6 tims 7` -> `42.` | S | Typo tolerance; now an ambiguous "Do you mean It's actually Waht, not 42..." which is garbled. | `/\b42\b/` |
| 157 list told and asked back | `Apples, pears and plums.`, `Eggs and milk.` | TE | Right to say all three. Now "Apples and pears and plums." (nested list leaks) and the second is unread. Exact comma style is incidental. | `/apples/.../pears/.../plums/` in order, and not /and .* and/; `/eggs/` and `/milk/` |

## src/memory/memory.test.ts, src/research/follows.test.ts, src/research/wikidata.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 217 follow-up with no left operand | `ask("and plus 3?") === "87"` (rendered, speak:false) | TE | Behaviour is right and now works: reader returns `Answer(87)`. | `/\b87\b/` |
| 227 a friend remembers | `yeah` -> `I'm listening. What's been going on?`; later `Hello! By the way, how is your mom doing?`, `That's okay. I'm here if you change your mind.` | TE | Right: yes/no must answer the offer made last turn (now "That's great that yeah! Tell me more!"). Exact sentences incidental. | `yeah`: `/listening|tell me|what happened|going on/i` and not /great that yeah/; `hi`: `/hello/i` and `/mom/i`; run once only; `nah`: `/okay|fine|here/i` |
| 233 grounded kind answers as one | `ask("is k2 a mountain?") === "Answer(True())"` (rendered) | TE | Right (instance via kind's superclass; now unread). The "emoji a symbol" case passes. Pins IR. Also "is an emoji an emoticon?" -> `Answer(False())`. | spoken: `/^yes/i` and `/^no\b/i` |

## src/runtime/chat.test.ts (all IR-pinned)

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 310 when said after what is asked | `Answer("Friday")`, `weekday="Friday"` | TE | Right (day of week tomorrow / in 5 days / today). Now unread ("what day will it be tomorrow"). Pins IR and a `weekday=` field. | `match(spoken, new RegExp(inDays(1), "i"))` etc. |
| 311 roots and percents | `Answer(12)` for `15% of 80` (roots pass) | TE | `15%` not read ("I couldn't read that yet"). Value is right. | `/\b12\b/` |
| 312 small talk | `Answer(Hello())`, `DoingWell()`, `GladYouLikeIt()`, `GotIt()`, `Laughing()`, `Goodbye()` | Q | Concept names of the old small-talk table. Wanted: greet back, answer how-are-you, acknowledge, laugh, say goodbye. Now: "That's great that good morning! Tell me more!", "ok" -> "How do you feel about it?", "how are you?" unread. | spoken: good morning `/morning|hello|hi\b/i`; how are you `/good|well|fine|doing/i`; cool `/glad|nice|great|cool/i`; ok `/okay|got it|sure/i` and not a question about feelings; lol `/ha|laugh|glad|funny/i`; good night `/night|bye|sleep/i`. Not "Tell me more" |
| 314 everyday arithmetic | `take 10, double it, then subtract 5` -> `15`; `is 100 more than 99` -> `Answer(True())`; `is 3 bigger than 5` -> `Answer(False())` | TE | Right: chain with "then" (now stuck on "then"), and comparisons with "than". Bare `15` vs `15.` incidental. | `/\b15\b/`; `/^yes/i`; `/^no/i` |
| 318 known names read whole | `how many days until new years day` matches `/^Answer\(Days\(\d+\)\)$/` | TE | Right (now unread). Pins IR head `Days`. | `/\d+ days?/i` (or compare with computed days) |
| 323 number word does sums in symbols | `what is one + 2?` -> `Answer(3)`; `and then add 5?` -> `9` | TE | Right ("one + 2" unread; "then" blocks "and then add 5?"). Bare "9". | `/\b3\b/`, `/\b4\b/`, `/\b9\b/` |
| 328 sum in symbols, then arithmetic word | `five + 2` -> `Answer(7)`; `add 5` -> `12` | TE | Right; same unread "five + 2". | `/\b7\b/`, `/\b12\b/` |
| 331 arithmetic in symbols | `(2+3)*4`, `2^10`, `3/4`, `12 * 12 - 4` as `Answer(20)`, `Answer(1024)`, `Answer(0.75)`, `Answer(140)` | TE | Right and important: none of these symbolic sums is read now. Pin is on IR only. | `/\b20\b/`, `/\b1024\b/`, `/0?\.75/`, `/\b140\b/` |
| 332 thing named that works out to a value | `reverse "hello"` -> `olleh`; `sort ...` -> `1, 3, 5 and 9.`; `how many days until christmas` `/^\d+ days\.$/` | TE | Right. `Olleh.` is a capitalised/punctuated rendering of a string result, so the exact `olleh` fails although it is correct. Christmas unread. List join style incidental. | `/olleh/i`; sort: digits `1 3 5 9` in order; `/\d+ days?/` |
| 334 sentences each heard | `/^Ha!/` and `/It is \d+:\d\d [AP]M\.$/` for `lol. You're kinda bad at talking. What time is it?` | TE | Right to answer every sentence and give the time (it does, but also says "I don't know yet." for the middle sentence, which is poor). "Ha!" is the old reply. | time regex fine; first: `/ha|laugh|glad|funny/i` or any acknowledgement; assert no `/stuck|don't know yet/`; `Hey so guess what` must not describe a brand (keep) |

## src/runtime/focus.test.ts, predict.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 367 asked for a doing it cannot do | `I can't post to Reddit yet.`; `can you add 2 and 3?` -> `5` | TE | Right (honest "can't"; and do it when it can). Now an odd "Do you mean post to Reddit, post to edit or post to credit?" and "can you add 2 and 3?" -> "worked something out but can't put it into words". Exact sentences. | `/can't|cannot|not able|unable/i` + `/reddit/i`; `/\b5\b/` |
| 368 supposed, then asked | `if x is 3 what is x times 2` -> `Answer(6)` | TE | Right (now `If(2)` / "worked something out"). Pins IR. | spoken `/\b6\b/` |
| 387 what comes next | `Answer(Predicted(32, Multiply(Previous(), 2)))` | TE | Right (predict 32, then 10). Pins the explanation structure `Multiply(Previous(), 2)`. Now "nothing for comes". (The direct `run("Predict(...)")` tests are evaluator-level and fine.) | spoken `/\b32\b/` and `/\b10\b/`; optionally `/double|times 2|multipl/i` |

## src/runtime/pursue.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 389 found by shape when asked after | `Answer(Paris())`, `Answer(Keal())`, `Answer(Bolt())` | TE | Right. Keal and Bolt pass; "the capital of france is paris / what is the capital of france" is the failure (unread). IR pin. | spoken `/paris/i` |
| 390 newest statement wins | `what is my favorite color?` -> `Answer(Red())`; unknown cat name is not `Answer`; `gaps.length` | TE | Newest-wins is right (now "Green and red."). IR pin; the cat check passes but now says "I don't know Cat S declares name yet." (garbled possessive). Question "is my favorite color blue?" must assert nothing (fine). | `/red/i` and not `/green/i`; cat: `/don't know|haven't/i` and not /declares|Cat S/ |
| 393 said in another shape | `who is my coworker?` -> `Answer(Greg_1())`; `who is greg?` -> `Answer(My(Coworker()))` | TE | Right. `Greg_1` is an internal individual id and `My(Coworker())` an IR term. Now `Answer(Greg())`; "who is greg?" unread. | `/greg/i`; `who is greg` `/your coworker|coworker/i`; phoenix/apple/denver already pass |
| 395 what my or your names | `what is your name?` -> `Answer("Napkin")` | TE | Right. Now "I don't know my declares name yet." (garbled, a bug). Same in chat.test (currently todo). | `/napkin/i` |
| 396 left undone is looked for further | `Answer(Page(...Section("Ingredients"` for a cake recipe; `numbered=true` for baking a cake | TE | Right to look the recipe up. IR pin, and the test goes to the real network (no `fetch`) so it is flaky. Now `Recipe(Cake())` / "nothing for cake". | inject a fake `fetch` returning a fixed page; spoken `/ingredients/i`, and steps `/1\.|first|step/i` |
| 398 learn on: who is gunter | `Your friend.` | S | Right and spoken (not IR). Now "Gunter is a name." which ignores what was just told. | keep; may loosen to `/friend/i` |

## src/runtime/words.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 408 interjection answered as talk | `Noted(Zorp(), ..., means="a greeting among friends")` | Q | A "Noted" echo with a `means=` field is old-parser output. A general assistant answers an interjection it has a meaning for: it should reply (greet back / acknowledge, optionally say what it means). Now "nothing for zorp". | spoken `/greet|hello|hi|zorp/i` and not `/stuck|couldn't read/` |
| 409 a word alone is said | `yo` -> `Answer(Hello())` | TE | Right (greet back). Now unread. | `/hello|hi|hey|yo/i` |
| 410 tell me about yourself | `/^Describes\(Self\(\), List\(Named\("Napkin"\)/` | TE | Right (say who it is). Now `Me(About(Self()))` and "worked something out but can't put it into words". | `/napkin/i` |
| 411 word told a value | `pi is 3.14159` then `what is pi times 2` -> `Answer(6.28318)`; `a dozen is 12` then `3 times a dozen` -> `Answer(36)` | TE | Right. "pi is 3.14159" and "a dozen is 12" unread. Float print format incidental. | `/6\.2831/`, `/\b36\b/` |

## src/situation/situation.test.ts

| # / test | Assertion | V | Reason | Replacement |
|---|---|---|---|---|
| 450 situation answered with its working | `68 apples - 30 = 38; half of 38 = 19. So 19 apples.`; no lookups | TE | Right: 19, no web lookup of names (the `asked == []` check is good). The exact working text is incidental. Now "worked something out but can't put it into words yet." | `/\b19\b/` (+ optional `/38/`); keep `asked` empty; `what is 3 times 4?` -> `/\b12\b/` |
| 452 told the answer, a word never met | first reply matches `/25 marbles/`; then `20 - 5 = 15 marbles. That tells me something about "zorp"`; `I've learned that "zorp" takes away.`; `42 cards.$` | Q | The first line pins a guess: an unknown verb "zorped" read as adding (25). A good assistant should not guess silently; either say it does not know "zorp" or ask. The learn-from-correction flow ("no, 15" teaches subtraction) is sensible; sentences are TE. Now the story is not solved at all. | turn 1: `/zorp/` and /(not sure|don't know|what does)/i OR any number; turn 2 after "no, 15": `/\b15\b/`; turn 4 after "18": `/learned|takes away|subtract/i`; turn 5: `/\b42\b/` |
| 453 word problem, thing asked not told | `Tom says 80. Ann says 20. What is their total guess?` -> `/100/` | S | Right. Now "I don't know their guess yet." | keep; the second assertion (situationOf returns something) is fine |

## eval/frames/cases.json (compare-hearing scoring is `spoken.toLowerCase().includes(expected)`)

Verdict: the cases are mostly sensible; the weak points are substring checks that are too loose or too exact.

| case | expect | V | Issue / fix |
|---|---|---|---|
| 4 `12 divided by 0` | `Undefined` | TE | Any correct refusal passes: `undefined`, `can't divide by zero`, `not defined`. Use a regex alternative (script needs an `expectAny` list). |
| 5 `subtract 3 from 10` | `7` | loose | Any text with a 7 passes. Use `^7` or `\b7\b` with no other digit. |
| 6 `add 3 and 4` | `7` | loose | Same. |
| 7 `2+2` | `4` | loose | Any message containing a 4 (e.g. "I couldn't ... 4") passes. Use `^4\b`. |
| 0 `5 times three` | `15` | loose | Matches `150`. Use `\b15\b`. |
| 3, 15 `12 divided by 4` | `3.` | TE | Depends on the trailing period of the current renderer; "3" is fine. Use `\b3\b`. |
| 16, 18 claim wrong | `actually 4` | TE | Pins "It's actually 4". Accept `4` plus `(not|no|actually|incorrect|wrong)`. |
| 17, 38, 39 | `Yes` / `Yes, that's 4` / `Yes, that's 42` | TE for 38/39 | `Yes` is fine; `Yes, that's N` pins phrasing. Use `^yes` plus the number. Case 38 is odd: "she said 2 plus 2 is 4" is a report, not a question; `Yes` there is acceptable but a plain acknowledgement is equally good. |
| 19 hole | `9 minus what?`, `5` | TE | Pins clarification sentence. Use `/what/` for the first and `\b5\b` for the second. |
| 25 movies | `Jaws and ET` | TE | Pins order and "and" join. Use both names, any order/join. |
| 27 | `Steven Spielberg. 1946` | TE | Pins ". " between the parts. Check both strings separately. |
| 31 `sort 3, 1, 2` | `1, 2 and 3` | TE | Pins list style. Check order of `1`, `2`, `3`. |
| 32, 54 newest wins | `Bob` / `Tucson` | loose | "Sam and Bob." / "Phoenix and Tucson." (the current output) still passes, so the case cannot detect the newest-wins bug. Add `not` expectations (e.g. `-Sam`, `-Phoenix`). |
| 36 | first turn expects `remember` | TE | Pins "Got it, I'll remember that." Any acknowledgement is fine. |
| 40 | `know` | TE | Relies on "I don't know your name yet". Use `/don't know|haven't been told|no idea/`. Intent (a reported name is not mine) is sensible. |
| 41 | `4. 9` | TE | Pins the join; check both numbers. |
| 43 | `Do you mean` | TE | Pins the clarification phrasing; `Acme` follow-up is good. |
| 51 | `June 3` | ok | "June 3rd" passes by substring. Fine. |
| 29 `what time is it` | `It is` | TE | Check a time pattern `\d+:\d\d`. |
| 53 `is 10 times 10 equal to 100` | `Yes` | S | Correct and currently fails ("It's actually 100, not equal."). |
| 10-15 typos | `4`, `42`, `5`, `3.` | ok/loose | Sensible set. Same loose-digit issue for `4`/`5`. |

## Other things noticed (passing now, but odd)

- frames.test "a statement is kept": `is ann taller than tom` (after "tom is taller than ann") expects "I don't know yet." A good assistant can answer No, since "taller than" is asymmetric. Not wrong, but the expectation protects an old-parser limitation.
- chat.test and pursue.test `todo` items for "what is your name", "who are you", "what can you do" are valid targets for the one reader; they are IR-pinned (`Answer("Napkin")`, `/^Answer\(List\(Arithmetic\(\), /`) and should be rewritten to spoken regex before being un-todo'd.
- "hello there" / "hi" / "how are you" / "thank you" / "thanks" currently get "Tell me more!"-style replies or "couldn't read"; the small-talk expectations in chat.test "hearing:" (todo) are sensible.
