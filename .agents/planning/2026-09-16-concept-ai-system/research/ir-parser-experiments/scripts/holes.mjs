import { parse, isCall, depth as depthOf, heads } from "./ir.mjs";
const MODEL = process.env.MODEL || "qwen3.5:4b";
const SAMPLES = Number(process.env.SAMPLES || 6), TEMP = 0.3;

const SHARED = `Write one line for each phrase of the message, in the order the user said them.
A line is either a plain expression, or an assignment: $name = expression
Never nest one line inside another. All arguments are positional; never write name= inside a call.
Keep nesting at most 4 levels deep. Write plain "text" and plain numbers directly.
Number("three") for a number written as a word. Keep original wording and misspellings.
Invent new CapitalizedNames freely when nothing fits.

VOCABULARY
Fact(x)  Do(x)  Tell(to, content)  Aside("verbatim text")
Whether(proposition)   a yes/no question
Me()  You()  Today()  Date(when)  Multiply(a,b)  Count(needle, haystack)`;

const OUT = `Output only those lines. No prose, no markdown, no code fence, no numbering.`;

// A: interrogative always wraps the proposition; holes marked $_
const A = [SHARED, `QUESTIONS
An interrogative always WRAPS the thing being asked about: What(...), Who(...), When(...),
Where(...), Why(...), How(...), HowMany(...), WhichOf(...).
If the unknown sits inside a relation, put $_ in its place inside the wrapped proposition.

EXAMPLES
"what is the date?"            -> What(Date())
"what do we need?"             -> What(Need(We(), $_))
"who killed him?"              -> Who(Killed($_, Him()))
"how many r's are in strawberry?" -> HowMany(Count("r", "strawberry"))`, OUT].join("\n\n");

// B: interrogative goes where the unknown is
const B = [SHARED, `QUESTIONS
An interrogative GOES WHERE THE UNKNOWN IS: What(), Who(), When(), Where(), Why(), How(),
HowMany(), WhichOf(...).
If an ARGUMENT is unknown, put the interrogative in that argument slot.
If the VALUE of the whole thing is unknown, wrap it.

EXAMPLES
"what is the date?"            -> What(Date())
"what do we need?"             -> Need(We(), What())
"who killed him?"              -> Killed(Who(), Him())
"how many r's are in strawberry?" -> HowMany(Count("r", "strawberry"))`, OUT].join("\n\n");


// C: interrogative ALWAYS in place; value questions get an explicit Is(...) slot
const C = [SHARED, `QUESTIONS
An interrogative is always a HOLE that sits in the argument slot where the unknown belongs:
What(), Who(), When(), Where(), Why(), How(), HowMany(), WhichOf(...).
Never wrap a proposition in an interrogative. If the question asks what something IS,
use Is(thing, What()).

EXAMPLES
"what is the date?"            -> Is(Date(), What())
"what do we need?"             -> Need(We(), What())
"who killed him?"              -> Killed(Who(), Him())
"how many r's are in strawberry?" -> Is(Count("r", "strawberry"), HowMany())`, OUT].join("\n\n");

const INPUTS = {
  value_date:  { q: "What is todays date?",                    need: ["What","Date"] },
  value_math:  { q: "What is 5 times three?",                  need: ["What","Multiply","Number"] },
  arg_need:    { q: "what do we need to finish this?",         need: ["What","Need"] },
  arg_who:     { q: "who wrote this file?",                    need: ["Who","Wrote"] },
  multi_1:     { q: "which tests fail on which platforms?",    need: ["WhichOf"] },
  multi_2:     { q: "who ate what at the party?",              need: ["Who","What","Ate"] },
  mixed:       { q: "tell me what changed in which files and whether it broke the build",
                 need: ["Do","Tell","What","WhichOf","Whether"] },
};

const clean = (t) => t.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
function balance(t){let d=0,q=false,esc=false;
  for(const c of t){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}
    if(c==='"'){q=!q;continue;}if(q)continue;if(c==="(")d++;else if(c===")")d--;}
  return d>0?t+")".repeat(d):(d<0?t.slice(0,d):t);}

function liftLines(text){
  const lines = text.split("\n").map(x=>x.trim()).filter(Boolean);
  const clauses=[]; let broken=0;
  for(const line of lines){
    const m=/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    const body = m ? m[2] : line;
    try{ parse(body); }catch{ try{ parse(balance(body)); }catch{ broken++; continue; } }
    clauses.push(m?`Let($${m[1]}, ${balance(body)})`:balance(body));
  }
  const expr = clauses.length===1 ? clauses[0] : `Sequence(${clauses.join(", ")})`;
  return { expr, broken, n: lines.length };
}
// count interrogative Concepts appearing with zero args (in-place hole style)
function holeStyle(e, acc={wrap:0, inplace:0}){
  if(!isCall(e)) return acc;
  const Q = new Set(["What","Who","When","Where","Why","How","HowMany","WhichOf"]);
  if(Q.has(e.head)) (e.args.length===0 ? acc.inplace++ : acc.wrap++);
  for(const a of e.args) holeStyle(a.value, acc);
  return acc;
}
async function gen(system, prompt){
  const r = await fetch("http://127.0.0.1:11434/api/generate",{method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify({model:MODEL,system,prompt,stream:false,think:false,
      options:{temperature:TEMP,num_predict:1024}}), signal: AbortSignal.timeout(90000)});
  const j = await r.json(); return clean(j.response||"");
}
const rows=[];
for(const [v, system] of Object.entries({A_wrap:A, B_inplace:B, C_strict:C})){
  for(const [name, {q, need}] of Object.entries(INPUTS)){
    for(let s=0;s<SAMPLES;s++){
      let text="", ok=false, hit=0, hs={wrap:0,inplace:0}, err="";
      try{
        text = await gen(system, q);
        const L = liftLines(text);
        const e = parse(L.expr);
        ok = L.broken===0;
        const H = heads(e);
        hit = need.filter(x=>H.has(x)).length;
        hs = holeStyle(e);
      }catch(ex){ err=String(ex.message||ex).slice(0,40); }
      rows.push({v,name,s,ok,hit,need:need.length,wrap:hs.wrap,inplace:hs.inplace,err,text});
      process.stderr.write(ok?".":"x");
    }
  }
  process.stderr.write("|"+v+"\n");
}
console.log(JSON.stringify({model:MODEL,rows},null,1));
