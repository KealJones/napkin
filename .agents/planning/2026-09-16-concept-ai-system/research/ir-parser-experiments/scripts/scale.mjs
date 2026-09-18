import { parse, isCall, depth as depthOf, heads } from "./ir.mjs";
const MODELS = (process.env.MODELS||"qwen3.5:2b,qwen3.5:4b,qwen3.5:9b").split(",");
const SAMPLES = Number(process.env.SAMPLES||6), TEMP=0.3;

const SYSTEM = [
`Write ONE expression. Root is Utterance(...) holding one clause per phrase of the
message, in the order the user said them, separated by commas.
Bind a value with Let($name, value) as its own clause. Later clauses use $name.
Never nest one clause inside another.`,
`All arguments are positional. Never write name= inside a call.`,
`Keep nesting at most 4 levels deep. If a value needs more, stop, put it in its
own Let($name, ...) clause, and continue on the next clause.`,
`Mark every retraction with Correction(old, new). Mark every "not X" with Not(X).
Mark every vague word ("or whatever", "like", "those things") with Fuzzy(...).
Mark every stressed or capitalised word with Emphasis(...).
Write a clause for every distinct thing the user said. Do not drop any.`,
`Write plain "text" and plain numbers directly. Number("three") for a number
written as a word. Keep the user's original wording and misspellings inside strings.`,
`VOCABULARY (invent new CapitalizedNames freely when nothing fits)
Question(x)  Fact(x)  Do(x)  Aside("verbatim text")
Correction(old, new)      the user retracted old and meant new
Misspelling("wrote", Meant())
Fuzzy(x)   Emphasis(x)
Ref("verbatim phrase")    refers to earlier conversation; you cannot resolve it
Ordinal(n)  Not(x)  Qualify(thing, q, ...)
Me()  You()  Today()  Years(n)  Field("name")  File("path")
Multiply(a,b)  Count(needle, haystack)  GreaterThan(a,b)  Sum(x)
Property(collection, key)  reads that field from every item`,
`EXAMPLES
"What is 5 times three?"
Utterance(Question(Multiply(5, Number("three"))))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco()))), Fact(Ago(Years(2))), Aside("it was great."))

"get the size, sorry the length, of the files i sent, not the first one, the second, and total them and say if its bigger than before"
Utterance(Let($measure, Correction(Field("size"), Field("length"))), Let($files, Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2))), Let($total, Sum(Property($files, $measure))), Question(GreaterThan($total, Ref("before"))))`,
`Output only the expression. No prose, no markdown, no code fence, no trailing period.`
].join("\n\n");

const INPUTS = {
  simple: "What is 5 times three?",
  deictic:"What is todays date?",
  count:  "how many r's are in strawberry",
  multi:  "i went to virginya to visit my mom. She has lived there 5 years. I havent been there for 3 years. it was crazy.",
  hard:   "grab the weights, er the scores or whatever, from those probe things i sent you. Not the first batch the second one and like add em up and tell me if its more than this time",
  meta:   "yes but I Actually I want you to build/write a very detailed IR spec it will be the like holy grail source of truth about what the IR should be. REALLY stay true to my original intent. make it able to express an entire page of Code structurally identically (example: /Users/kealjones/Git/Personal/Cnocept/packages/concept-runtime/src/bootstrap/runtime-entry-source-example.js) as well as messy complicated weird circular overly corrected ambiguous english with misspellings etc. HELL USE THIS exact prompt as a test case.... look how fucking long this is god damn.",
};
const NEED = {
  simple:["Question","Multiply","Number"], deictic:["Question","Today"], count:["Question","Count"],
  multi:["Misspelling","Aside","Fact","Years"],
  hard:["Correction","Ref","Ordinal","Not","Sum","GreaterThan","Fuzzy"],
  meta:["Do","Correction","Emphasis","Aside","File"],
};
const clean=(t)=>t.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
function balance(t){ // mechanical repair: append missing close parens
  let d=0,q=false,esc=false;
  for(const c of t){ if(esc){esc=false;continue;} if(c==="\\"){esc=true;continue;}
    if(c==='"'){q=!q;continue;} if(q)continue; if(c==="(")d++; else if(c===")")d--; }
  return d>0 ? t+")".repeat(d) : t;
}
async function gen(model,prompt){
  const t0=Date.now();
  const r=await fetch("http://127.0.0.1:11434/api/generate",{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({model,system:SYSTEM,prompt,stream:false,think:false,
      options:{temperature:TEMP,num_predict:1024}}),signal:AbortSignal.timeout(90000)});
  const j=await r.json(); return {text:clean(j.response||""),ms:Date.now()-t0};
}
const rows=[];
for(const model of MODELS){
  for(const [i,input] of Object.entries(INPUTS)){
    for(let s=0;s<SAMPLES;s++){
      let text="",ms=0,ok=false,okRepaired=false,d=0,cl=0,hit=0,err="";
      try{ const g=await gen(model,input); text=g.text; ms=g.ms;
        try{ const e=parse(text); ok=true; okRepaired=true; d=depthOf(e); cl=isCall(e)?e.args.length:0; hit=NEED[i].filter(h=>heads(e).has(h)).length; }
        catch(e1){ err=String(e1.message).slice(0,40);
          try{ const e2=parse(balance(text)); okRepaired=true; d=depthOf(e2); cl=isCall(e2)?e2.args.length:0; hit=NEED[i].filter(h=>heads(e2).has(h)).length; }catch{} }
      }catch(ex){ err=String(ex.message||ex).slice(0,40); }
      rows.push({model,i,s,ok,okRepaired,d,cl,hit,need:NEED[i].length,ms,len:text.length,err,text});
      process.stderr.write(ok?".":(okRepaired?"r":"x"));
    }
  }
  process.stderr.write("|"+model+"\n");
}
console.log(JSON.stringify({rows},null,1));
