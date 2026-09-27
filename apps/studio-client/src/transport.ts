/**
 * How the studio reaches its API: over HTTP to the Node server, or, in a build for a host
 * with no server (`VITE_NAPKIN_HOST=browser`), to the same handler running in a Worker.
 * Either way the caller gets a `Response`, streamed bodies included.
 */

type Answer = { id: number; status?: number; headers?: [string, string][]; chunk?: Uint8Array; end?: boolean };

const inBrowser = import.meta.env.VITE_NAPKIN_HOST === "browser";

let worker: Worker | undefined;
let next = 0;
const waiting = new Map<number, { start: (r: Response) => void; controller?: ReadableStreamDefaultController<Uint8Array> }>();

function receive({ data }: MessageEvent<Answer>) {
  const at = waiting.get(data.id);
  if (!at) return;
  if (data.status !== undefined) {
    const body = new ReadableStream<Uint8Array>({ start: (controller) => void (at.controller = controller) });
    at.start(new Response(body, { status: data.status, headers: data.headers ?? [] }));
  } else if (data.chunk) at.controller?.enqueue(data.chunk);
  else if (data.end) {
    at.controller?.close();
    waiting.delete(data.id);
  }
}

export function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (!inBrowser) return fetch(path, init);
  if (!worker) {
    worker = new Worker(new URL("./napkin.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = receive;
  }
  const id = next++;
  const headers = [...new Headers(init.headers)];
  const body = typeof init.body === "string" ? init.body : undefined;
  return new Promise((start) => {
    waiting.set(id, { start });
    worker!.postMessage({ id, url: path, method: init.method ?? "GET", headers, ...(body === undefined ? {} : { body }) });
  });
}

