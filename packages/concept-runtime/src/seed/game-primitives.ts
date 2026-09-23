/** Reusable value operations. None of these primitives knows the rules of a game. */
import { c, parse } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const units: ConceptUnit[] = [];
function primitive(pattern: string, source: string, lazy = false, effectful = false): void {
  const expr = parse(pattern);
  if (typeof expr !== "object" || !expr || !("head" in expr)) throw new Error(pattern);
  units.push(concept(expr.head, { relations: ["IsA(Capability())"], realizations: [realization({
    pattern: expr, context: "Execution()", body: { head: "Code", args: [{ name: "source", value: source }] },
    evaluateArguments: !lazy, properties: effectful ? ["Effectful()"] : [],
  })] }));
}
const args = "const v = args.map(a => a.value);";
const list = "const list = x => { if (!x || x.head !== 'List') throw new Error('Expected List'); return x.args.map(a => a.value); };";
const truth = "const truth = x => x === true || (x && x.head === 'True');";

primitive("Quote($value)", `(args) => args[0].value`, true);
primitive("Build($value)", `async (args, bindings, api) => {
  const value = args[0].value;
  if (!value || !value.head) return value;
  const fields = [];
  for (const a of value.args) fields.push({...a, value: await api.evaluate(a.value)});
  return {head:value.head, args:fields};
}`, true);
primitive("Slot($record, $key)", `(args) => { ${args}
  if (!v[0] || !v[0].head) return null;
  const found = typeof v[1] === 'number' ? v[0].args[v[1]] : v[0].args.find(a => a.name === v[1]);
  return found ? found.value : null;
}`);
primitive("With($record, $key, $value)", `(args) => { ${args}
  if (!v[0] || !v[0].head || typeof v[1] !== 'string') throw new Error('With needs a record and field name');
  const fields = v[0].args.filter(a => a.name !== v[1]);
  fields.push({name:v[1], value:v[2]});
  return {head:v[0].head,args:fields};
}`);
primitive("Head($value)", `(args) => args[0].value && args[0].value.head || null`);
primitive("FormatExpression($value)", `(args,bindings,api) => api.format(args[0].value)`);
primitive("TextContains($text, $part)", `(args) => String(args[0].value).toLowerCase().includes(String(args[1].value).toLowerCase())`);
primitive("CoordinateLabel($square, $files, $firstRank)", `(args) => { ${args}
  const x=v[0]?.args?.[0]?.value,y=v[0]?.args?.[1]?.value;
  return Number.isInteger(x)&&Number.isInteger(y)&&v[1][x] ? v[1][x]+String(y+v[2]) : '?';
}`);
primitive("MakeList(Rest($items))", `(args, bindings, api) => api.call('List', ...args.map(a=>a.value))`);
primitive("Length($items)", `(args) => { ${list} return list(args[0].value).length; }`);
primitive("At($items, $index)", `(args) => { ${list} return list(args[0].value)[args[1].value] ?? null; }`);
primitive("Last($items)", `(args) => { ${list} return list(args[0].value).at(-1) ?? null; }`);
primitive("DropLast($items)", `(args, bindings, api) => { ${list} return api.call('List', ...list(args[0].value).slice(0,-1)); }`);
primitive("Append($items, $value)", `(args, bindings, api) => { ${list} return api.call('List', ...list(args[0].value),args[1].value); }`);
primitive("ConcatLists(Rest($lists))", `(args, bindings, api) => { ${list} return api.call('List', ...args.flatMap(a=>list(a.value))); }`);
primitive("Range($start, $end)", `(args,bindings,api) => { ${args}
  if(!Number.isInteger(v[0]) || !Number.isInteger(v[1]) || v[1]-v[0]>100000) throw new Error('Invalid range');
  return api.call('List', ...Array.from({length:Math.max(0,v[1]-v[0])},(_,i)=>v[0]+i));
}`);
for (const op of ["Map", "FlatMap", "Filter", "Any", "All", "Find"]) {
  primitive(`${op}($items, $lambda)`, `async (args,bindings,api) => {
    ${list} ${truth}
    const items = list(await api.evaluate(args[0].value));
    const lambda = args[1].value;
    if (!lambda || lambda.head !== 'Lambda' || !lambda.args[0]?.value?.variable || lambda.args.length !== 2)
      throw new Error('Expected Lambda(variable, body)');
    const results = [];
    for (const item of items) {
      const output = await api.evaluate(api.substitute(lambda.args[1].value, new Map([[lambda.args[0].value.variable,item]])));
      if ('${op}' === 'Any' && truth(output)) return true;
      if ('${op}' === 'All' && !truth(output)) return false;
      if ('${op}' === 'Find' && truth(output)) return item;
      if ('${op}' === 'Map') results.push(output);
      if ('${op}' === 'FlatMap') results.push(...list(output));
      if ('${op}' === 'Filter' && truth(output)) results.push(item);
    }
    if ('${op}' === 'Any') return false;
    if ('${op}' === 'All') return true;
    if ('${op}' === 'Find') return null;
    return api.call('List', ...results);
  }`, true);
}
primitive("Apply($callable, $arguments)", `async (args,bindings,api) => { ${list}
  const target = args[0].value;
  if (!target || !target.head) throw new Error('Apply needs a Concept');
  return await api.evaluate({head:target.head,args:[...target.args,...list(args[1].value).map(value=>({value}))]});
}`);
for (const op of ["And", "Or"]) {
  primitive(`${op}(Rest($conditions))`, `async (args,bindings,api) => { ${truth}
    for (const a of args) {
      const yes = truth(await api.evaluate(a.value));
      if ('${op}' === 'And' && !yes) return false;
      if ('${op}' === 'Or' && yes) return true;
    }
    return '${op}' === 'And';
  }`, true);
}
primitive("BoolNot($value)", `(args) => { ${truth} return !truth(args[0].value); }`);
primitive("Same($left, $right)", `(args) => {
  const canonical = x => {
    if (!x || !x.head) return JSON.stringify(x);
    const fields = x.args.every(a=>a.name !== undefined) ? [...x.args].sort((a,b)=>a.name.localeCompare(b.name)) : x.args;
    return x.head + '(' + fields.map(a=>(a.name||'')+':'+canonical(a.value)).join(',') + ')';
  };
  return canonical(args[0].value) === canonical(args[1].value);
}`);
for (const [name, expression] of [
  ["LessThan", "v[0] < v[1]"], ["Abs", "Math.abs(v[0])"], ["Modulo", "((v[0] % v[1]) + v[1]) % v[1]"],
  ["Floor", "Math.floor(v[0])"], ["Divide", "v[0] / v[1]"], ["Minimum", "Math.min(...v)"], ["Maximum", "Math.max(...v)"],
] as const) {
  const unary = name === "Abs" || name === "Floor";
  primitive(`${name}(${unary ? "$value" : "$left, $right"})`, `(args) => { ${args}
    if(v.some(x=>typeof x!=='number' || !Number.isFinite(x))) throw new Error('Expected finite numbers');
    const result = ${expression};
    if(typeof result==='number' && !Number.isFinite(result)) throw new Error('Nonfinite arithmetic result');
    return result;
  }`);
}
primitive("Sum($items)", `(args) => { ${list}
  const values = list(args[0].value);
  if(values.some(x=>typeof x!=='number' || !Number.isFinite(x))) throw new Error('Sum expects numbers');
  return values.reduce((a,b)=>a+b,0);
}`);
primitive("BestBy($items, $score)", `async (args,bindings,api) => { ${list}
  const items=list(await api.evaluate(args[0].value)), lambda=args[1].value;
  if(!lambda || lambda.head!=='Lambda') throw new Error('Expected scoring Lambda');
  let best=null, score=-Infinity;
  for(const item of items) {
    const value=await api.evaluate(api.substitute(lambda.args[1].value,new Map([[lambda.args[0].value.variable,item]])));
    if(typeof value!=='number' || !Number.isFinite(value)) throw new Error('Score must be finite');
    if(value>score) { best=item;score=value; }
  }
  return best;
}`, true);

primitive("CoordinateFromLabel($text, $files, $firstRank)", `(args,bindings,api) => { ${args}
  if(typeof v[0]!=='string' || typeof v[1]!=='string') return null;
  const m=/^([a-z])([0-9]+)$/i.exec(v[0]); if(!m) return null;
  const file=v[1].indexOf(m[1].toLowerCase()), rank=Number(m[2])-v[2];
  return file<0 || rank<0 ? null : api.call('Square',file,rank);
}`);
primitive("GridOffset($square, $dx, $dy, $width, $height)", `(args,bindings,api) => { ${args}
  const x=v[0]?.args?.[0]?.value+v[1], y=v[0]?.args?.[1]?.value+v[2];
  return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<v[3]&&y<v[4] ? api.call(v[0].head,x,y) : null;
}`);
primitive("Occupant($board, $square)", `(args,bindings,api) => { ${list} ${args}
  if(v[1]===null) return null;
  return list(v[0]).find(p=>api.format(p.args.find(a=>a.name==='square')?.value??null)===api.format(v[1]))??null;
}`);
primitive("GridRay($board, $from, $delta, $steps, $width, $height, $includeBlocker)", `(args,bindings,api) => { ${list} ${args}
  const occupied=new Set(list(v[0]).map(p=>api.format(p.args.find(a=>a.name==='square')?.value??null)));
  const out=[], dx=v[2].args[0].value,dy=v[2].args[1].value;
  for(let i=1;i<=v[3];i++) {
    const x=v[1].args[0].value+dx*i,y=v[1].args[1].value+dy*i;
    if(x<0||y<0||x>=v[4]||y>=v[5]) break;
    const sq=api.call(v[1].head,x,y), blocked=occupied.has(api.format(sq));
    if(!blocked || v[6]===true) out.push(sq);
    if(blocked) break;
  }
  return api.call('List',...out);
}`);
primitive("BoardChange($board, $removals, $additions)", `(args,bindings,api) => { ${list} ${args}
  const removed=new Set(list(v[1]).map(api.format));
  const kept=list(v[0]).filter(p=>!removed.has(api.format(p.args.find(a=>a.name==='square')?.value??null)));
  return api.call('List',...kept,...list(v[2]));
}`);

primitive("AmbientValue($key, $fallback)", `(args,bindings,api) => api.ambient(args[0].value) ?? args[1].value`);
primitive("IdentityKey($prefix, $scope)", `(args) => {
  if(!/^[A-Z][A-Za-z0-9_]*$/.test(args[0].value) || typeof args[1].value!=='string') throw new Error('Invalid identity');
  return args[0].value+'_'+Buffer.from(args[1].value).toString('hex');
}`);
primitive("Recall($identity)", `async (args,bindings,api) => {
  return api.store.has(args[0].value) ? await api.evaluate(api.call(args[0].value)) : null;
}`, false, true);
primitive("CreateRecord($identity, $value)", `(args,bindings,api) => {
  const identity=args[0].value;
  if(!/^[A-Z][A-Za-z0-9_]*$/.test(identity)) throw new Error('Invalid Concept identity');
  if(api.store.has(identity)) return api.call('AlreadyExists',identity);
  api.store.seed({identity,relations:[{claim:api.call('IsA',api.call('StoredRecord'))}],realizations:[{
    pattern:api.call(identity),body:api.call('Quote',args[1].value),properties:[],evaluateArguments:false,evaluateResult:false
  }]});
  return api.call('Stored',args[1].value);
}`, false, true);
primitive("CompareAndSwap($identity, $expected, $next)", `async (args,bindings,api) => {
  const identity=args[0].value, previous=api.store.get(identity);
  if(!previous) return api.call('Conflict');
  const current=await api.evaluate(api.call(identity));
  if(previous!==api.store.get(identity) || api.format(current)!==api.format(args[1].value)) return api.call('Conflict');
  api.store.addRealization(identity,{
    pattern:api.call(identity),body:api.call('Quote',args[2].value),properties:[],evaluateArguments:false,evaluateResult:false
  });
  return api.call('Stored',args[2].value);
}`, false, true);
for (const name of ["StoredRecord", "Stored", "AlreadyExists", "Conflict"]) {
  units.push(concept(name, { relations: [c("IsA", c(name === "StoredRecord" ? "Data" : "Result"))] }));
}
export const gamePrimitiveUnits: readonly ConceptUnit[] = units;
