// How Napkin works, as the parallax walkthroughs beside the design docs
// (.agents/planning/2026-09-16-concept-ai-system/design/*-walkthrough.html): each file shown here
// as it is, so the pages and the studio never drift apart. A link in one to another asks the
// studio to switch (postMessage), since a page shown from its text has no address to link from.
import { useEffect, useState } from "react";
import how from "../../../.agents/planning/2026-09-16-concept-ai-system/design/ir-walkthrough.html?raw";
import meanings from "../../../.agents/planning/2026-09-16-concept-ai-system/design/meanings-walkthrough.html?raw";

const WALKTHROUGHS = { how, meanings } as const;
type Name = keyof typeof WALKTHROUGHS;

export function Walkthrough() {
  const [shown, setShown] = useState<Name>("how");
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      const asked = (e.data as { walkthrough?: unknown } | null)?.walkthrough;
      if (typeof asked === "string" && asked in WALKTHROUGHS) setShown(asked as Name);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);
  return (
    <section className="page active walkthrough-page">
      <iframe key={shown} className="walkthrough-frame" title="How Napkin works" srcDoc={WALKTHROUGHS[shown]} />
    </section>
  );
}
