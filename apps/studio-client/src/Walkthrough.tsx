// How Napkin works, as the parallax walkthrough beside the IR guide
// (.agents/planning/2026-09-16-concept-ai-system/design/ir-walkthrough.html): one file, shown here
// as it is, so the page and the studio never drift apart.
import walkthrough from "../../../.agents/planning/2026-09-16-concept-ai-system/design/ir-walkthrough.html?raw";

export function Walkthrough() {
  return (
    <section className="page active walkthrough-page">
      <iframe className="walkthrough-frame" title="How Napkin works" srcDoc={walkthrough} />
    </section>
  );
}
