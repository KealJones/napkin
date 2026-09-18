import { parse, isCall, depth as depthOf, heads } from "./ir.mjs";
const MODEL = process.env.MODEL||"qwen3.5:4b";
const SAMPLES = Number(process.env.SAMPLES||6), TEMP=0.3;

const SHARED_MARK = `Mark every retraction with Correction(old, new). Mark every "not X" with Not(X).
Mark every vague word ("or whatever", "like", "those things") with Fuzzy(...).
Mark every stressed or capitalised word with Emphasis(...).
Write one line for every distinct thing the user said. Do not drop any.`;
const SHARED_VOCAB = `VOCABULARY (invent new CapitalizedNames freely when nothing fits)
Question(x)  Fact(x)  Do(x)  Aside("verbatim text")
Correction(old, new)   Misspelling("wrote", Meant())   Fuzzy(x)   Emphasis(x)
Ref("verbatim phrase")    refers to earlier conversation; you cannot resolve it
Ordinal(n)  Not(x)  Qualify(thing, q, ...)
Me()  You()  Today()  Years(n)  Field("name")  File("path")
Multiply(a,b)  Count(needle, haystack)  GreaterThan(a,b)  Sum(x)
Property(collection, key)  reads that field from every item`;
const SHARED_LIT = `Write plain "text" and plain numbers directly. Number("three") for a number written
as a word. Keep the user's original wording and misspellings inside strings.
All arguments are positional. Never write name= inside a call.`;

// ---- variant F: single Utterance(...) expression (current winner)
const F = [
`Write ONE expression. Root is Utterance(...) holding one clause per phrase of the message,
in the order the user said them, separated by commas.
Bind a value with Let($name, value) as its own clause. Later clauses use $name.
Never nest one clause inside another.`,
`Keep nesting at most 4 levels deep. If a value needs more, stop, put it in its own
Let($name, ...) clause, and continue on the next clause.`,
SHARED_MARK, SHARED_LIT, SHARED_VOCAB,
`EXAMPLES
"What is 5 times three?"
Utterance(Question(Multiply(5, Number("three"))))

"i went to sanfransisco. i was there 2 years ago. it was great."
Utterance(Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco()))), Fact(Ago(Years(2))), Aside("it was great."))

"get the size, sorry the length, of the files i sent, not the first one, the second, and total them and say if its bigger than before"
Utterance(Let($measure, Correction(Field("size"), Field("length"))), Let($files, Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2))), Let($total, Sum(Property($files, $measure))), Question(GreaterThan($total, Ref("before"))))`,
`Output only the expression. No prose, no markdown, no code fence, no trailing period.`
].join("\n\n");

// ---- variant G: one line per clause, python-style assignment
const G = [
`Write one line for each phrase of the message, in the order the user said them.
A line is either a plain expression, or an assignment: $name = expression
Later lines use $name. Never nest one line inside another. No commas between lines.`,
`Keep nesting at most 4 levels deep inside one line. If a value needs more, stop, assign it
to its own $name on its own line, and continue on the next line.`,
SHARED_MARK, SHARED_LIT, SHARED_VOCAB,
`EXAMPLES
"What is 5 times three?"
Question(Multiply(5, Number("three")))

"i went to sanfransisco. i was there 2 years ago. it was great."
Fact(Visited(Me(), Misspelling("sanfransisco", SanFrancisco())))
Fact(Ago(Years(2)))
Aside("it was great.")

"get the size, sorry the length, of the files i sent, not the first one, the second, and total them and say if its bigger than before"
$measure = Correction(Field("size"), Field("length"))
$files = Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2))
$total = Sum(Property($files, $measure))
Question(GreaterThan($total, Ref("before")))`,
`Output only those lines. No prose, no markdown, no code fence, no numbering, no blank lines.`
].join("\n\n");

const INPUTS = {
  simple:"What is 5 times three?",
  deictic:"What is todays date?",
  count:"how many r's are in strawberry",
  multi:"i went to virginya to visit my mom. She has lived there 5 years. I havent been there for 3 years. it was crazy.",
  hard:"grab the weights, er the scores or whatever, from those probe things i sent you. Not the first batch the second one and like add em up and tell me if its more than this time",
  meta:"yes but I Actually I want you to build/write a very detailed IR spec it will be the like holy grail source of truth about what the IR should be. REALLY stay true to my original intent. make it able to express an entire page of Code structurally identically (example: /Users/kealjones/Git/Personal/Cnocept/packages/concept-runtime/src/bootstrap/runtime-entry-source-example.js) as well as messy complicated weird circular overly corrected ambiguous english with misspellings etc. HELL USE THIS exact prompt as a test case.... look how fucking long this is god damn.",
};
const NEED = {
  simple:["Question","Multiply","Number"], deictic:["Question","Today"], count:["Question","Count"],
  multi:["Misspelling","Aside","Fact","Years"],
  hard:["Correction","Ref","Ordinal","Not","Sum","GreaterThan","Fuzzy"],
  meta:["Do","Correction","Emphasis","Aside","File"],
};
const clean=(t)=>t.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
function balance(t){let d=0,q=false,esc=false;
  for(const c of t){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}
    if(c==='"'){q=!q;continue;}if(q)continue;if(c==="(")d++;else if(c===")")d--;}
  return d>0?t+")".repeat(d):(d<0?t.slice(0,d):t);}

// G post-process: lines -> single Utterance(...) expression
function liftLines(text){
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const clauses=[], broken=[];
  for(const line of lines){
    const m=/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    const body = m ? m[2] : line;
    let node=null;
    try{ node=parse(body); }catch{ try{ node=parse(balance(body)); }catch{ broken.push(line); continue; } }
    clauses.push(m?`Let($${m[1]}, ${body})`:body);
  }
  const expr = clauses.length === 1 ? clauses[0] : `Sequence(${clauses.join(", ")})`;
  return { expr, lines:lines.length, broken:broken.length };
}
async function gen(system,prompt){
  const t0=Date.now();
  const r=await fetch("http://127.0.0.1:11434/api/generate",{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({model:MODEL,system,prompt,stream:false,think:false,
      options:{temperature:TEMP,num_predict:1024}}),signal:AbortSignal.timeout(90000)});
  const j=await r.json(); return {text:clean(j.response||""),ms:Date.now()-t0};
}
const rows=[];
for(const [v,system] of Object.entries({F_single:F, G_lines:G})){
  for(const [i,input] of Object.entries(INPUTS)){
    for(let s=0;s<SAMPLES;s++){
      let text="",ms=0,ok=false,okRep=false,d=0,cl=0,hit=0,lost=0,err="";
      try{ const g=await gen(system,input); text=g.text; ms=g.ms; }catch(ex){ err="GEN:"+String(ex.name||ex).slice(0,20); }
      if(v==="F_single"){
        try{ const e=parse(text); ok=true;okRep=true;d=depthOf(e);cl=isCall(e)?e.args.length:0;hit=NEED[i].filter(h=>heads(e).has(h)).length; }
        catch(e1){ err=String(e1.message).slice(0,40);
          try{ const e2=parse(balance(text)); okRep=true;d=depthOf(e2);cl=isCall(e2)?e2.args.length:0;hit=NEED[i].filter(h=>heads(e2).has(h)).length; }catch{} }
      } else {
        const L=liftLines(text); lost=L.broken;
        try{ const e=parse(L.expr); ok=(L.broken===0); okRep=true; d=depthOf(e); cl=isCall(e)?e.args.length:0; hit=NEED[i].filter(h=>heads(e).has(h)).length; }
        catch(e1){ err=String(e1.message).slice(0,40); }
      }
      rows.push({v,i,s,ok,okRep,d,cl,hit,need:NEED[i].length,lost,ms,len:text.length,err,text});
      process.stderr.write(ok?".":(okRep?"r":"x"));
    }
  }
  process.stderr.write("|"+v+"\n");
}
console.log(JSON.stringify({model:MODEL,rows},null,1));
