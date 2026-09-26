/**
 * The studio's API run in the browser, for a host with no server (GitHub Pages).
 *
 * It mounts the files the site ships (public-pages/napkin, see scripts/assets.mjs), reads back
 * what this browser kept in OPFS, and answers the page's requests with the same handler the
 * Node server uses. No model reads or teaches here.
 *
 * Messages: the page sends { id, url, method, headers, body }; the worker answers
 * { id, status, headers }, then { id, chunk } per piece of the body, then { id, end }.
 */
import { home, join, mount, read, restore, write } from "@napkin/concept-runtime/platform/browser";

type Ask = { id: number; url: string; method: string; headers: [string, string][]; body?: string };

const base = new URL(import.meta.env.BASE_URL, self.location.origin);

async function boot() {
  const paths = (await (await fetch(new URL("napkin/manifest.json", base))).json()) as string[];
  const texts = await Promise.all(paths.map(async (p) => (await fetch(new URL(`napkin/files${p}`, base))).text()));
  mount(Object.fromEntries(paths.map((p, i) => [p, texts[i]!])));
  const graphPath = join(home(), ".napkin/store.ncon");
  const tracePath = join(home(), ".napkin/trace.jsonl");
  await restore([graphPath, tracePath]);
  // A first visit starts from what was learned before, without anyone's talk (scripts/seed.mjs);
  // from then on the journal is this browser's own.
  const seed = read("/seed/store.ncon");
  if (!read(graphPath) && seed) write(graphPath, seed);
  // The runtime reads its word lists as it loads, so it is imported only once they are mounted.
  const { createStudio } = await import("@napkin/studio-server/handler");
  return createStudio({ graphPath, tracePath, models: false });
}

const studio = boot();

self.onmessage = async (event: MessageEvent<Ask>) => {
  const { id, url, method, headers, body } = event.data;
  try {
    const answer = await (await studio).handle(new Request(new URL(url, base), { method, headers, ...(body === undefined ? {} : { body }) }));
    self.postMessage({ id, status: answer.status, headers: [...answer.headers] });
    // Read piece by piece (not `for await`, which Safari's streams do not offer), so a turn's
    // trace reaches the page as it happens.
    const reader = answer.body?.getReader();
    for (let part = await reader?.read(); part && !part.done; part = await reader!.read()) self.postMessage({ id, chunk: part.value });
  } catch (error) {
    self.postMessage({ id, status: 500, headers: [["content-type", "application/json"]] });
    self.postMessage({ id, chunk: new TextEncoder().encode(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })) });
  }
  self.postMessage({ id, end: true });
};
