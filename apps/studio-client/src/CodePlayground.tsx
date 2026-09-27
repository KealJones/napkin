/**
 * Code playground: source on the left in any language a pack reads or writes, its Concepts
 * on the right. Edit either side and the other follows: source is read by the language's
 * From rules, Concepts are written by its To rules (packages/concept-runtime/packs).
 */
import { useEffect, useRef, useState } from "react";
import { request } from "./transport";

type Language = { name: string; reads: boolean; writes: boolean };

const SAMPLE: Record<string, string> = {
  TypeScript: "function whatever(args: string[]) {\n  // loop over args here\n  for (const a of args) {\n    console.log(a);\n  }\n}\n",
  JavaScript: "function add(a, b) {\n  return a + b;\n}\n",
  Python: "def whatever(args):\n    # loop over args here\n    for a in args:\n        print(a)\n",
};

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as Record<string, unknown>;
}

export function CodePlayground() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [language, setLanguage] = useState(() => localStorage.getItem("code-playground-language") ?? "TypeScript");
  const [source, setSource] = useState(SAMPLE.TypeScript ?? "");
  const [ir, setIr] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [irNote, setIrNote] = useState("");
  // Which side was typed in last: the other side is the one that follows.
  const leading = useRef<"source" | "ir">("source");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void request("/api/code/languages")
      .then((r) => r.json())
      .then((d: { languages?: Language[] }) => setLanguages(d.languages ?? []));
  }, []);

  const current = languages.find((l) => l.name === language);

  const readSource = async (text: string, lang: string) => {
    const d = await post("/api/code/read", { language: lang, source: text });
    if (typeof d.error === "string") {
      setSourceNote(d.error);
      return;
    }
    setIr(String(d.ir ?? ""));
    const unsupported = (d.unsupported as { kind: string; source: string }[] | undefined) ?? [];
    setSourceNote(unsupported.length ? `Not read yet: ${unsupported.map((u) => `${u.kind} (${u.source})`).join(", ")}` : "");
    setIrNote("");
  };

  const writeIr = async (text: string, lang: string) => {
    if (!languages.find((l) => l.name === lang)?.writes) {
      setIrNote(`No pack says how to write ${lang} yet, so the source is not rewritten.`);
      return;
    }
    const d = await post("/api/code/write", { language: lang, ir: text });
    if (typeof d.error === "string") {
      setIrNote(d.error);
      return;
    }
    setSource(String(d.source ?? ""));
    const unwritable = (d.unwritable as string[] | undefined) ?? [];
    setIrNote(unwritable.length ? `No way to write yet: ${unwritable.join(", ")}` : "");
    setSourceNote("");
  };

  const later = (run: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(run, 350);
  };

  // The first reading, and again whenever the language changes.
  useEffect(() => {
    if (!languages.length) return;
    void readSource(source, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages.length]);

  const pickLanguage = (next: string) => {
    localStorage.setItem("code-playground-language", next);
    setLanguage(next);
    // The Concepts stay; the source is theirs written in the new language, when it can be.
    if (ir && languages.find((l) => l.name === next)?.writes) void writeIr(ir, next);
    else {
      const sample = SAMPLE[next];
      if (sample) {
        setSource(sample);
        void readSource(sample, next);
      }
    }
  };

  return (
    <section className="page active">
      <div className="lab-grid code-grid">
        <div className="lab-col">
          <div className="code-head">
            <label>
              Language{" "}
              <select value={language} onChange={(e) => pickLanguage(e.target.value)} aria-label="Language">
                {(languages.length ? languages : [{ name: language, reads: true, writes: true }]).map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                    {!l.writes ? " (read only)" : !l.reads ? " (write only)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="lab-muted">{current && !current.writes ? "Concepts are read from this, but not written back to it yet." : "Edit either side."}</span>
          </div>
          <textarea
            className="code-editor"
            spellCheck={false}
            value={source}
            onChange={(e) => {
              leading.current = "source";
              setSource(e.target.value);
              const text = e.target.value;
              later(() => void readSource(text, language));
            }}
          />
          {sourceNote && <div className="lab-muted code-note">{sourceNote}</div>}
        </div>
        <div className="lab-col">
          <div className="code-head">
            <strong>Concepts</strong>
            <span className="lab-muted">the IR, as the packs read it</span>
          </div>
          <textarea
            className="code-editor"
            spellCheck={false}
            value={ir}
            onChange={(e) => {
              leading.current = "ir";
              setIr(e.target.value);
              const text = e.target.value;
              later(() => void writeIr(text, language));
            }}
          />
          {irNote && <div className="lab-muted code-note">{irNote}</div>}
        </div>
      </div>
    </section>
  );
}
