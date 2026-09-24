// @ts-check
/**
 * `node preview.js <file.ncon> [more.ncon...] > preview.html`: a pack painted exactly as the
 * extension paints it (same scanner, same colors), for looking at without installing it.
 * JavaScript inside Code bodies is plain here; the editor highlights it as JavaScript.
 */
const { readFileSync } = require("node:fs");
const { basename } = require("node:path");
const { scan, RAINBOW, PALETTE, ROLES, SYNTAX_TOKENS, GHOSTS, PREFIX_GHOSTS } = require("./scan.js");

/** `--style syntax` previews the syntax style, with VS Code's default bracket pair colors. */
const syntax = process.argv.includes("--style") && process.argv[process.argv.indexOf("--style") + 1] === "syntax";
const BRACKETS = ["#FFD700", "#DA70D6", "#179FFF"];
/** The editor leaves comments to the theme; the preview draws them as Monokai does. */
const COMMENT = { color: "#88846F" };

const escape = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** @param {string} text */
function paint(text) {
  const { marks } = scan(text);
  // Escapes sit inside strings: paint strings first, escapes over them.
  const flat = marks.filter((m) => m.kind !== "escape").sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const m of flat) {
    if (m.start < at) continue;
    out += escape(text.slice(at, m.start));
    const piece = text.slice(m.start, m.end);
    const depth = RAINBOW[m.depth % RAINBOW.length];
    /** @type {string} */
    let style;
    const css = (/** @type {{ color: string, fontStyle?: string }} */ p) => `color:${p.color}${p.fontStyle ? ";font-style:" + p.fontStyle : ""}`;
    if (syntax && (m.kind === "head" || m.kind === "form")) style = css(/** @type {Record<string, { color: string }>} */ (ROLES)[m.role ?? "call"]);
    else if (syntax && (m.kind === "open" || m.kind === "close")) style = `color:${BRACKETS[m.depth % BRACKETS.length]}`;
    else if (m.kind === "head") style = `color:${depth}`;
    else if (m.kind === "form") style = `color:${PALETTE.form.color};font-style:${PALETTE.form.fontStyle}`;
    else if (m.kind === "open" || m.kind === "close") style = m.form ? `color:${PALETTE.form.color}` : `color:${depth}`;
    else if (m.kind === "code") style = "color:#CFCFC2";
    else if (m.kind === "comment") style = `color:${COMMENT.color}`;
    else {
      const p = /** @type {Record<string, { color: string, fontStyle?: string }>} */ (syntax ? SYNTAX_TOKENS : PALETTE)[m.kind];
      style = p ? `color:${p.color}${p.fontStyle ? ";font-style:" + p.fontStyle : ""}` : "";
    }
    out += `<span style="${style}">${escape(piece)}</span>`;
    const ghost = m.kind === "comma" && m.of ? " " + /** @type {Record<string, string>} */ (GHOSTS)[m.of] : m.kind === "open" && m.of ? /** @type {Record<string, string>} */ (PREFIX_GHOSTS)[m.of] : undefined;
    if (ghost && !ghost.includes("undefined")) out += `<span style="color:#90908A;opacity:.7">${escape(ghost)}</span>`;
    at = m.end;
  }
  return out + escape(text.slice(at));
}

const files = process.argv.slice(2).filter((a, i, all) => a !== "--style" && all[i - 1] !== "--style");
const sections = files.map((f) => {
  const [name, range] = f.split(":");
  let text = readFileSync(name, "utf8");
  if (range) {
    const [from, to] = range.split("-").map(Number);
    text = text.split("\n").slice(from - 1, to).join("\n");
  }
  return `<h2>${escape(basename(name))}${range ? ` <small>lines ${range}</small>` : ""}</h2><pre>${paint(text)}</pre>`;
});

process.stdout.write(`<!doctype html><meta charset="utf-8"><title>N-Con preview</title>
<style>
  body { background:#1E1F1C; color:#F8F8F2; font:14px/1.5 "SF Mono", Menlo, monospace; margin:0; padding:24px 32px; }
  h2 { color:#75715E; font-weight:normal; font-size:13px; margin:28px 0 8px; }
  h2 small { color:#5C5A4F; }
  pre { background:#272822; padding:16px 20px; border-radius:8px; overflow-x:auto; margin:0; }
  .legend span { display:inline-block; width:14px; height:14px; border-radius:3px; margin-right:6px; vertical-align:middle; }
  .legend { color:#75715E; font-size:12px; }
</style>
<div class="legend">${syntax ? "syntax style" : "rainbow style"} &middot; nesting depth: ${(syntax ? BRACKETS : RAINBOW).map((c, i) => `<span style="background:${c}" title="depth ${i}"></span>`).join("")} then it cycles</div>
${sections.join("\n")}
`);
