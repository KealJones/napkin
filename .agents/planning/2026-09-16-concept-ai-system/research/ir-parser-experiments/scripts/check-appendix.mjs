import { parse, depth } from "./ir.mjs";
import { readFileSync } from "fs";
const md = readFileSync("/Users/kealjones/Git/Personal/Cnocept/.agents/planning/2026-09-16-concept-ai-system/design/ir-spec-appendix-code.md","utf8");
const blocks = [...md.matchAll(/^```([a-z]*)\n([\s\S]*?)^```$/gm)].map(m=>({lang:m[1],src:m[2]}));
let n=0, bad=0;
for (const {lang, src} of blocks) {
  if (lang) continue;           // skip ```js source blocks
  n++;
  const s = src.trim();
  if (s.includes("<the seven")) { console.log("SKIP block "+n+" (documented placeholder)"); continue; }
  try { const e = parse(s); console.log("OK   block "+n+"  depth="+String(depth(e)).padStart(2)+"  root="+e.head); }
  catch (ex) { bad++; console.log("FAIL block "+n+": "+ex.message); 
    const at = Number((/@(\d+)/.exec(ex.message)||[])[1]||0);
    console.log("     ..."+s.slice(Math.max(0,at-70), at+40).replace(/\n/g,"\\n")+"...");
  }
}
console.log("\n"+n+" IR blocks checked, "+bad+" invalid");
