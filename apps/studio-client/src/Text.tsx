// A message's text, with code shown as code: ``` fenced blocks (with their language) and
// `inline` spans. Everything else is the text as said.
import { Fragment, type ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    /^`[^`\n]+`$/.test(part) ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code> : <Fragment key={`${key}-${i}`}>{part}</Fragment>,
  );
}

export function Text({ value }: { value: string }) {
  const parts = value.split(/(```[\w+-]*\n[\s\S]*?\n```)/g);
  return (
    <>
      {parts.map((part, i) => {
        const block = /^```([\w+-]*)\n([\s\S]*?)\n```$/.exec(part);
        if (block) {
          return (
            <pre key={i} className="code-block" data-language={block[1] || undefined}>
              <code>{block[2]}</code>
            </pre>
          );
        }
        return <Fragment key={i}>{inline(part, String(i))}</Fragment>;
      })}
    </>
  );
}
