import { parse, isCall, depth as depthOf, heads } from "./ir.mjs";
const MODEL = "qwen3.5:4b", SAMPLES = 6, TEMP = 0.3;

const BASE_VOCAB = `VOCABULARY (invent new CapitalizedNames freely when nothing fits)
Question(x)  Fact(x)  Do(x)  Aside("verbatim text")
Correction(old, new)      the user retracted old and meant new
Misspelling("wrote", Meant())
Fuzzy(x)                  the user was vague about x
Ref("verbatim phrase")    refers to earlier conversation; you cannot resolve it
Ordinal(n)  Not(x)  Qualify(thing, q, ...)
Me()  You()  Today()  Years(n)  Field("name")
Multiply(a,b)  Count(needle, haystack)  GreaterThan(a,b)  Sum(x)`;

const V_LAMBDA = BASE_VOCAB + `\nMap(items, Lambda($x, body))  Property(obj, key)`;
const V_BROADCAST = BASE_VOCAB + `\nProperty(collection, key)  reads that field from every item`;

const FLAT = `Write ONE expression. Root is Utterance(...) holding one clause per phrase of the
message, in the order the user said them, separated by commas.
Bind a value with Let($name, value) as its own clause. Later clauses use $name.
Never nest one clause inside another.`;

const NEG = `Mark every retraction with Correction(old, new). Mark every "not X" with Not(X).
Mark every vague word ("or whatever", "like", "those things") with Fuzzy(...).
Write a clause for every distinct thing the user said. Do not drop any.`;

const POS = `All arguments are positional. Never write name= inside a call.`;
const DEPTH = `Keep nesting at most 4 levels deep. If a value needs more, stop, put it in its
own Let($name, ...) clause, and continue on the next clause.`;
const LIT = `Write plain "text" and plain numbers directly. Number("three") for a number
written as a word. Keep the user's original wording and misspellings inside strings.`;
const OUT = `Output only the expression. No prose, no markdown, no code fence, no trailing period.`;

const EX = (broadcast) => `EXAMPLES
"What is 5 times three?"
Utterance(Question(Multiply(5, Number("three"))))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco()))), Fact(Ago(Years(2))), Aside("it was great."))

"get the size, sorry the length, of the files i sent, not the first one, the second, and total them and say if its bigger than before"
Utterance(Let($measure, Correction(Field("size"), Field("length"))), Let($files, Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2))), Let($total, Sum(${broadcast ? "Property($files, $measure)" : "Map($files, Lambda($f, Property($f, $measure)))"})), Question(GreaterThan($total, Ref("before"))))`;

const VARIANTS = {
  A_lambda:    [FLAT, POS, DEPTH, LIT, V_LAMBDA, EX(false), OUT],
  E_broadcast: [FLAT, POS, DEPTH, LIT, V_BROADCAST, EX(true), OUT],
  F_bcast_neg: [FLAT, POS, DEPTH, NEG, LIT, V_BROADCAST, EX(true), OUT],
};
const INPUTS = {
  hard: "grab the weights, er the scores or whatever, from those probe things i sent you. Not the first batch the second one and like add em up and tell me if its more than this time",
  multi: "i went to virginya to visit my mom. She has lived there 5 years. I havent been there for 3 years. it was crazy.",
  count: "how many r's are in strawberry",
};
const NEED = {
  hard: ["Correction","Ref","Ordinal","Not","Sum","GreaterThan","Fuzzy"],
  multi: ["Misspelling","Aside","Fact","Years"],
  count: ["Question","Count"],
};
const clean = (t) => t.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
async function gen(system, prompt) {
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:11434/api/generate", { method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify({ model:MODEL, system, prompt, stream:false, think:false,
      options:{ temperature:TEMP, num_predict:-1 } }) });
  const j = await r.json();
  return { text: clean(j.response||""), ms: Date.now()-t0 };
}
const rows = [];
for (const [v, parts] of Object.entries(VARIANTS)) {
  const system = parts.join("\n\n");
  for (const [i, input] of Object.entries(INPUTS)) {
    for (let s=0; s<SAMPLES; s++) {
      let text="", ms=0, ok=false, err="", d=0, cl=0, hit=0, dupBody=false;
      try {
        const g = await gen(system, input); text=g.text; ms=g.ms;
        const e = parse(text); ok=true; d=depthOf(e); cl=isCall(e)?e.args.length:0;
        const hs = heads(e);
        hit = NEED[i].filter(h=>hs.has(h)).length;
        const scan = (n) => { if(!isCall(n)) return;
          const names = n.args.map(a=>a.name).filter(Boolean);
          if (new Set(names).size !== names.length) dupBody = true;
          n.args.forEach(a=>scan(a.value)); };
        scan(e);
      } catch(ex){ err=String(ex.message||ex).slice(0,60); }
      rows.push({v,i,s,ok,d,cl,hit,need:NEED[i].length,ms,len:text.length,err,dupBody,text});
      process.stderr.write(ok?(dupBody?"D":"."):"x");
    }
  }
  process.stderr.write("|");
}
process.stderr.write("\n");
console.log(JSON.stringify({rows},null,1));
