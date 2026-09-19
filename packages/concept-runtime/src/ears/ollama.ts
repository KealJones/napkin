/**
 * A local model call. Generation is capped and the request times out: removing an
 * arbitrary 384-token limit in favour of unlimited output let a small model enter an
 * unbounded runaway (research/ir-parser-experiments README, Finding 6).
 *
 * The model is a realization detail. Swapping it must not require touching host code
 * anywhere else.
 */
export interface ModelOptions {
  model?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export const DEFAULTS: Required<ModelOptions> = {
  // Measured: 4b beats 9b on fidelity at 1.6x the speed. Do not "upgrade" without data.
  model: "qwen3.5:4b",
  endpoint: "http://127.0.0.1:11434",
  temperature: 0.3,
  maxTokens: 1024,
  timeoutMs: 90_000,
};

export async function generate(system: string, prompt: string, options: ModelOptions = {}): Promise<string> {
  const o = { ...DEFAULTS, ...options };
  const response = await fetch(`${o.endpoint}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: o.model,
      system,
      prompt,
      stream: false,
      think: false,
      options: { temperature: o.temperature, num_predict: o.maxTokens },
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!response.ok) throw new Error(`Model call failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { response?: string };
  return body.response ?? "";
}

export async function modelAvailable(options: ModelOptions = {}): Promise<boolean> {
  const o = { ...DEFAULTS, ...options };
  try {
    const r = await fetch(`${o.endpoint}/api/version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}
