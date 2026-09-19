import { parse, isCall, heads } from "./ir.mjs";
const MODEL = process.env.MODEL || "qwen3.5:4b";
const SAMPLES = Number(process.env.SAMPLES || 6), TEMP = 0.3;
const Q = new Set(["What","Who","When","Where","Why","How","HowMany","WhichOf","Whether"]);

const BASE = `Write one line for each phrase of the message, in the order the user said them.
A line is either a plain expression, or an assignment: $name = expression
Never nest one line inside another. All arguments are positional; never write name= inside a call.
Keep nesting at most 4 levels deep. Write plain "text" and plain numbers directly.
Number("three") for a number written as a word. Keep original wording and misspellings.
Invent new CapitalizedNames freely when nothing fits.

VOCABULARY
Fact(x)  Do(x)  Tell(to, content)  Aside("verbatim text")
Whether(proposition)   a yes/no question
Me()  You()  Today()  Date(when)  Multiply(a,b)  Count(needle, haystack)

QUESTIONS
An interrogative GOES WHERE THE UNKNOWN IS: What(), Who(), When(), Where(), Why(), How(),
HowMany(), WhichOf(...).
If an ARGUMENT is unknown, put the interrogative in that argument slot.
If the VALUE of the whole thing is unknown, wrap it.

EXAMPLES
"what is the date?"            -> What(Date())
"what do we need?"             -> Need(We(), What())
"who killed him?"              -> Killed(Who(), Him())
"how many r's are in strawberry?" -> HowMany(Count("r", "strawberry"))`;

const RULES = `
TWO RULES YOU MUST NOT BREAK

1. If the message asks a question, the output MUST contain an interrogative:
   What, Who, When, Where, Why, How, HowMany, WhichOf, or Whether.
   "What is 5 times three?" is a question, so What(Multiply(5, Number("three"))) is right
   and Multiply(5, Number("three")) is WRONG — it states a fact instead of asking.

2. Every name MUST start with a capital letter and MUST be followed by parentheses.
   Write This(), not this. Write Tests(), not tests. Write ChangedFiles(), not changed_files.
   A bare lowercase word is never a value.`;

const OUT = `Output only those lines. No prose, no markdown, no code fence, no numbering.`;

const V = {
  B0_base:    [BASE, OUT].join("\n\n"),
  B1_rules:   [BASE, RULES, OUT].join("\n\n"),
  B2_repair:  [BASE, RULES, OUT].join("\n\n"),   // same prompt, plus a repair retry
};

const INPUTS = {
  value_date: { q:"What is todays date?", ask:true, need:["What","Date"] },
  value_math: { q:"What is 5 times three?", ask:true, need:["What","Multiply","Number"] },
  arg_need:   { q:"what do we need to finish this?", ask:true, need:["What","Need"] },
  arg_who:    { q:"who wrote this file?", ask:true, need:["Who","Wrote"] },
  multi_1:    { q:"which tests fail on which platforms?", ask:true, need:["WhichOf"] },
  multi_2:    { q:"who ate what at the party?", ask:true, need:["Who","What","Ate"] },
  mixed:      { q:"tell me what changed in which files and whether it broke the build",
                ask:true, need:["Do","Tell","What","WhichOf","Whether"] },
};

const clean=(t)=>t.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
function balance(t){let d=0,q=false,esc=false;
  for(const c of t){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}
    if(c==='"'){q=!q;continue;}if(q)continue;if(c==="(")d++;else if(c===")")d--;}
  return d>0?t+")".repeat(d):(d<0?t.slice(0,d):t);}

function lift(text){
  const lines=text.split("\n").map(x=>x.trim()).filter(Boolean);
  const clauses=[]; const errs=[];
  for(const line of lines){
    const m=/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    const body=m?m[2]:line;
    try{ parse(balance(body)); }catch(e){ errs.push(line+"  <-- "+e.message); continue; }
    clauses.push(m?`Let($${m[1]}, ${balance(body)})`:balance(body));
  }
  if(!clauses.length) return {expr:null, errs};
  return {expr: clauses.length===1?clauses[0]:`Sequence(${clauses.join(", ")})`, errs};
}
// the two checks, run mechanically on the parsed result
function validate(expr, ask){
  const problems=[];
  const H=heads(expr);
  if(ask && ![...H].some(h=>Q.has(h)))
    problems.push("the message asks a question but the output contains no interrogative (What, Who, When, Where, Why, How, HowMany, WhichOf, Whether)");
  return problems;
}
async function gen(system,prompt){
  const r=await fetch("http://127.0.0.1:11434/api/generate",{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({model:MODEL,system,prompt,stream:false,think:false,
      options:{temperature:TEMP,num_predict:1024}}),signal:AbortSignal.timeout(90000)});
  return clean((await r.json()).response||"");
}
const rows=[];
for(const [v,system] of Object.entries(V)){
  for(const [name,{q,ask,need}] of Object.entries(INPUTS)){
    for(let s=0;s<SAMPLES;s++){
      let text="",ok=false,hit=0,hasQ=false,lex=0,repaired=false,err="";
      try{
        text=await gen(system,q);
        let L=lift(text);
        let problems = L.expr ? validate(parse(L.expr), ask) : ["nothing parsed"];
        lex = L.errs.filter(e=>/bare identifier|Capitalized/.test(e)).length;
        if(v==="B2_repair" && (problems.length || L.errs.length)){
          const why=[...problems, ...L.errs].join("\n");
          text = await gen(system, q+"\n\nYour previous answer was rejected:\n"+text+
                 "\n\nProblems:\n"+why+"\n\nWrite it again, corrected.");
          repaired=true;
          L=lift(text);
          problems = L.expr ? validate(parse(L.expr), ask) : ["nothing parsed"];
          lex = L.errs.filter(e=>/bare identifier|Capitalized/.test(e)).length;
        }
        if(L.expr){
          const e=parse(L.expr); const H=heads(e);
          ok = L.errs.length===0 && problems.length===0;
          hit = need.filter(x=>H.has(x)).length;
          hasQ = [...H].some(h=>Q.has(h));
        }
      }catch(ex){ err=String(ex.message||ex).slice(0,50); }
      rows.push({v,name,s,ok,hit,need:need.length,hasQ,lex,repaired,err,text});
      process.stderr.write(ok?".":(hasQ?"q":"x"));
    }
  }
  process.stderr.write("|"+v+"\n");
}
console.log(JSON.stringify({model:MODEL,rows},null,1));
