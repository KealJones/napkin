/** The studio page, served inline so there is no build step and nothing to desync. */
export const page = (): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>cnocept studio</title>
<style>
  :root { color-scheme: dark; --bg:#0d0f13; --panel:#151922; --line:#232935; --dim:#7d8799;
          --text:#dfe5ee; --accent:#7fd1c1; --warn:#e0b26a; --gap:#d98b8b; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
         background:var(--bg); color:var(--text); }
  header { padding:12px 18px; border-bottom:1px solid var(--line); display:flex;
           gap:16px; align-items:baseline; }
  h1 { font-size:15px; margin:0; letter-spacing:.4px; }
  .dim { color:var(--dim); }
  main { display:grid; grid-template-columns:260px 1fr 340px; height:calc(100vh - 49px); }
  section { overflow:auto; padding:14px 16px; }
  section + section { border-left:1px solid var(--line); }
  input, button, textarea { font:inherit; background:var(--panel); color:var(--text);
           border:1px solid var(--line); border-radius:6px; padding:8px 10px; }
  button { cursor:pointer; } button:hover { border-color:var(--accent); }
  .row { display:flex; gap:8px; margin-bottom:12px; }
  .row input { flex:1; }
  ul { list-style:none; margin:0; padding:0; }
  li { padding:3px 6px; border-radius:4px; cursor:pointer; }
  li:hover { background:var(--panel); }
  li.inert { color:var(--dim); }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.9px; color:var(--dim);
       margin:18px 0 8px; font-weight:600; }
  h2:first-child { margin-top:0; }
  pre { margin:0 0 8px; padding:10px 12px; background:var(--panel); border:1px solid var(--line);
        border-radius:6px; white-space:pre-wrap; word-break:break-word; }
  .accent { color:var(--accent); } .warn { color:var(--warn); } .gap { color:var(--gap); }
  .trace { font-size:12.5px; }
  .trace div { padding:1px 0; white-space:pre; }
  label { display:flex; gap:6px; align-items:center; color:var(--dim); font-size:13px; }
</style></head>
<body>
<header>
  <h1>cnocept</h1>
  <span class="dim" id="status">loading…</span>
</header>
<main>
  <section>
    <div class="row"><input id="filter" placeholder="filter" /></div>
    <ul id="concepts"></ul>
  </section>
  <section>
    <div class="row">
      <input id="message" placeholder="ask something, or an expression like Add(2, 3)" />
      <button id="send">run</button>
    </div>
    <label><input type="checkbox" id="learn" /> learn what it does not know</label>
    <div id="out"></div>
  </section>
  <section>
    <div id="detail" class="dim">select a Concept</div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let units = [];

const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
const block = (title, body, cls='') =>
  body ? '<h2>' + title + '</h2><pre class="' + cls + '">' + esc(body) + '</pre>' : '';

async function loadGraph() {
  const g = await (await fetch('/api/graph')).json();
  units = g.units;
  $('status').textContent = g.size + ' Concepts  ·  ' + g.graph;
  render();
}
function render() {
  const f = $('filter').value.toLowerCase();
  $('concepts').innerHTML = units
    .filter((u) => u.identity.toLowerCase().includes(f))
    .map((u) => '<li class="' + (u.realizable ? '' : 'inert') + '" data-id="' + u.identity + '">' +
         esc(u.identity) + '</li>').join('');
}
$('filter').addEventListener('input', render);
$('concepts').addEventListener('click', (e) => {
  const id = e.target.dataset.id; if (id) showConcept(id);
});

async function showConcept(id) {
  const d = await (await fetch('/api/concept/' + encodeURIComponent(id))).json();
  if (!d.known) {
    $('detail').innerHTML = '<h2>' + esc(id) + '</h2><pre class="gap">not in the graph</pre>' +
      block('cluster', d.cluster.map((x) => x.identity + '  via ' + x.via).join('\\n'));
    return;
  }
  const derivedOnly = d.derived.filter((x) => !d.stored.includes(x));
  $('detail').innerHTML = '<h2>' + esc(d.identity) + '</h2>' +
    block('relations', d.stored.join('\\n')) +
    block('derived — not stored', derivedOnly.join('\\n'), 'accent') +
    block('cluster', d.cluster.map((x) => x.identity + '  via ' + x.via).join('\\n')) +
    block('realizations', d.realizations.map((r) =>
      r.pattern + '\\n  context ' + r.context +
      (r.properties.length ? '\\n  ' + r.properties.join(' ') : '') +
      '\\n  => ' + r.body).join('\\n\\n'));
}

function renderTrace(trace) {
  return '<div class="trace">' + trace.map((e) => {
    const pad = '  '.repeat(e.depth);
    const mark = e.outcome === 'residual' ? '~' : e.outcome === 'failure' ? '!' : ' ';
    const cls = e.outcome === 'residual' ? 'gap' : e.outcome === 'failure' ? 'warn' : '';
    return '<div class="' + cls + '">' + esc(mark + ' ' + pad + e.input) + '</div>' +
           '<div class="dim">' + esc('  ' + pad + '  => ' + (e.output ?? '?')) + '</div>';
  }).join('') + '</div>';
}

async function run() {
  const message = $('message').value.trim();
  if (!message) return;
  $('out').innerHTML = '<pre class="dim">thinking…</pre>';
  const looksExpression = /^[A-Z][A-Za-z0-9_]*\\(/.test(message);
  const res = await fetch(looksExpression ? '/api/realize' : '/api/ask', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(looksExpression ? { expression: message } : { message, learn: $('learn').checked }),
  });
  const d = await res.json();
  if (d.error) { $('out').innerHTML = '<pre class="warn">' + esc(d.error) + '</pre>'; return; }
  $('out').innerHTML =
    block('heard', d.heard) +
    block('parsed', d.parsed) +
    block('result', d.result, 'accent') +
    block('checks failed', (d.problems ?? []).join('\\n'), 'warn') +
    block('lines rejected', (d.rejected ?? []).map((r) => r.line + '  <-- ' + r.reason).join('\\n'), 'warn') +
    block('learned', (d.learned ?? []).map((l) => l.how + ': ' + l.identity + ' — ' + l.detail).join('\\n\\n'), 'accent') +
    block('gaps', (d.gaps ?? []).map((g) => g.kind + ': ' + g.expression).join('\\n'), 'gap') +
    block('ambiguities', (d.ambiguities ?? []).join('\\n'), 'warn') +
    '<h2>trace</h2>' + renderTrace(d.trace ?? []);
  if (d.size) loadGraph();
}
$('send').addEventListener('click', run);
$('message').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
loadGraph();
</script>
</body></html>`;
