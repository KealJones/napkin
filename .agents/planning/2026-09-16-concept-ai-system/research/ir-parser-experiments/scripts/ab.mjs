import { parse, isCall, depth as depthOf, heads } from "./ir.mjs";
const MODEL = process.env.MODEL || "qwen3.5:4b";
const SAMPLES = Number(process.env.SAMPLES || 3);
const TEMP = Number(process.env.TEMP || 0.3);

const VOCAB = `VOCABULARY (use these; invent new CapitalizedNames freely when nothing fits)
Question(x)            a request for an answer
Fact(x)                the user stating something true
Do(x)                  the user telling you to perform an action
Aside("verbatim text") a side remark that is not part of the request
Correction(old, new)   the user retracted old and meant new
Misspelling("wrote", Meant())  a misspelled name
Fuzzy(x)               the user was vague or approximate about x
Emphasis(x)            the user stressed x
Ref("verbatim phrase") refers to earlier conversation; you cannot resolve it
Ordinal(n) / Not(x) / Qualify(thing, q1, q2)
Me() / You() / Today() / Years(n)
Multiply(a,b) Sum(x) Count(needle, haystack) GreaterThan(a,b)
Map(items, Lambda($x, body)) Property(obj, key) Field("name")`;

const RULES_FLAT = `Write ONE expression. Root is Utterance(...) holding one clause per phrase of the
message, in the order the user said them, separated by commas.
Bind a value with Let($name, value) as its own clause. Later clauses can use $name.
To correct or narrow an already-bound name, write a new clause: Correction($name, new) or
Qualify($name, q). Never nest one clause inside another.`;

const RULES_NESTED = `Write ONE expression. Root is Utterance(...). Bind a value with
Let(name=$name, value=<value>, body=<everything that follows>) so each later part of the
message is nested inside the body of the binding before it.
To correct or narrow a bound name, rebind it: Let(name=$name, value=Correction($name, new), body=...).`;

const RULES_POS = `All arguments are positional. Never write name= inside a call.`;
const RULES_NAMED = `All arguments are named. Always write name=value inside a call, e.g.
Question(answer=Multiply(left=5, right=Number(source="three"))).`;

const DEPTH = `Keep nesting at most 4 levels deep. If a value needs more, stop, put it in
its own Let($name, ...) clause, and continue on the next clause.`;

const LITERALS = `Write plain "text" and plain numbers directly. Use Number("three") for a
number written as a word. Keep the user's original wording and misspellings inside strings.`;

const OUT = `Output only the expression. No prose, no markdown, no code fence, no trailing period.`;

const EXAMPLES_FLAT = `EXAMPLES
"What is 5 times three?"
Utterance(Question(Multiply(5, Number("three"))))

"whats the date today"
Utterance(Question(Today()))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco()))), Fact(Ago(Years(2))), Aside("it was great."))

"get the size, sorry the length, of the second file i sent and tell me if its bigger than before"
Utterance(Let($measure, Correction(Field("size"), Field("length"))), Let($file, Qualify(Ref("the second file i sent"), Ordinal(2))), Let($value, Property($file, $measure)), Question(GreaterThan($value, Ref("before"))))`;

const EXAMPLES_NESTED = `EXAMPLES
"What is 5 times three?"
Utterance(Question(Multiply(5, Number("three"))))

"whats the date today"
Utterance(Question(Today()))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco()))), Fact(Ago(Years(2))), Aside("it was great."))

"get the size, sorry the length, of the second file i sent and tell me if its bigger than before"
Utterance(Let(name=$measure, value=Correction(Field("size"), Field("length")), body=Let(name=$file, value=Qualify(Ref("the second file i sent"), Ordinal(2)), body=Let(name=$value, value=Property($file, $measure), body=Question(GreaterThan($value, Ref("before")))))))`;

const EXAMPLES_NAMED = `EXAMPLES
"What is 5 times three?"
Utterance(Question(answer=Multiply(left=5, right=Number(source="three"))))

"whats the date today"
Utterance(Question(answer=Today()))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(claim=Visited(who=Me(), where=Misspelling(wrote="sanfransisco", meant=SanFrancisco()))), Fact(claim=Ago(when=Years(count=2))), Aside(text="it was great."))

"get the size, sorry the length, of the second file i sent and tell me if its bigger than before"
Utterance(Let(name=$measure, value=Correction(old=Field(name="size"), new=Field(name="length"))), Let(name=$file, value=Qualify(thing=Ref(text="the second file i sent"), q1=Ordinal(n=2))), Let(name=$value, value=Property(object=$file, key=$measure)), Question(answer=GreaterThan(left=$value, right=Ref(text="before"))))`;

const VARIANTS = {
  A_flat_pos_depth:    [RULES_FLAT, RULES_POS, DEPTH, LITERALS, VOCAB, EXAMPLES_FLAT, OUT],
  B_nested_pos_depth:  [RULES_NESTED, RULES_POS, DEPTH, LITERALS, VOCAB, EXAMPLES_NESTED, OUT],
  C_flat_named_depth:  [RULES_FLAT, RULES_NAMED, DEPTH, LITERALS, VOCAB, EXAMPLES_NAMED, OUT],
  D_flat_pos_nodepth:  [RULES_FLAT, RULES_POS, LITERALS, VOCAB, EXAMPLES_FLAT, OUT],
};

const INPUTS = {
  simple:  "What is 5 times three?",
  deictic: "What is todays date?",
  count:   "how many r's are in strawberry",
  multi:   "i went to virginya to visit my mom. She has lived there 5 years. I havent been there for 3 years. it was crazy.",
  hard:    "grab the weights, er the scores or whatever, from those probe things i sent you. Not the first batch the second one and like add em up and tell me if its more than this time",
};

function clean(t) {
  return t.replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
}

async function gen(system, prompt) {
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, system, prompt, stream: false, think: false,
      options: { temperature: TEMP, num_predict: -1 },
    }),
  });
  const j = await r.json();
  return { text: clean(j.response || ""), ms: Date.now() - t0 };
}

const rows = [];
for (const [vname, parts] of Object.entries(VARIANTS)) {
  const system = parts.join("\n\n");
  for (const [iname, input] of Object.entries(INPUTS)) {
    for (let s = 0; s < SAMPLES; s++) {
      let text = "", ms = 0, ok = false, err = "", d = 0, cl = 0, hs = [];
      try {
        const g = await gen(system, input);
        text = g.text; ms = g.ms;
        const e = parse(text);
        ok = true;
        d = depthOf(e);
        cl = isCall(e) ? e.args.length : 0;
        hs = [...heads(e)];
      } catch (ex) { err = String(ex.message || ex).slice(0, 80); }
      rows.push({ v: vname, i: iname, s, ok, d, cl, ms, len: text.length, err, text, hs });
      process.stderr.write(ok ? "." : "x");
    }
  }
  process.stderr.write("|");
}
process.stderr.write("\n");
console.log(JSON.stringify({ model: MODEL, temp: TEMP, samples: SAMPLES, rows }, null, 1));
