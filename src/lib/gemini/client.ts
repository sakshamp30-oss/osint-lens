import 'server-only';
import { AppError } from '../errors';
import { env } from '../env';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function mapHttpError(status: number, bodyText: string): AppError {
  let message = '';
  let apiStatus = '';
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string; status?: string } };
    message = j.error?.message ?? '';
    apiStatus = j.error?.status ?? '';
  } catch {
    /* non-JSON body */
  }
  const lower = message.toLowerCase();
  const short = message.slice(0, 300);

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return new AppError('quota_exceeded',
      'Your Gemini API key has hit its quota or rate limit. Check usage and billing in Google AI Studio, then retry.');
  }
  if (lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('api key expired')) {
    return new AppError('invalid_key', 'Google rejected your Gemini API key. Reconnect a valid key.');
  }
  if (status === 401 || status === 403) {
    return new AppError('invalid_key',
      'Your Gemini key was rejected or lacks permission (is the Generative Language API enabled for it?).');
  }
  if (status === 413 || lower.includes('request payload size') || lower.includes('too large')) {
    return new AppError('image_too_large', 'The image is too large for Gemini. Try a smaller file.');
  }
  if (status === 404) {
    return new AppError('upstream_error', `Gemini model not found. The server's GEMINI_MODEL may be retired. ${short}`);
  }
  if (status === 400) {
    return new AppError('upstream_error', `Gemini rejected the request: ${short || 'bad request'}`);
  }
  return new AppError('upstream_error', `Gemini is unavailable (HTTP ${status}). ${short}`);
}

/** One cheap, token-free call: GET models/{model}. Verifies the key and model access. */
export async function validateGeminiKey(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(env.geminiModel)}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError('upstream_error', 'Could not reach the Gemini API. Try again.');
  }
  if (!res.ok) throw mapHttpError(res.status, await res.text());
}

interface StreamArgs {
  apiKey: string;
  systemInstruction: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  temperature: number;
  signal?: AbortSignal;
}

interface GeminiEvent {
  error?: { message?: string; status?: string; code?: number };
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

const OK_FINISH = new Set(['STOP', 'FINISH_REASON_UNSPECIFIED']);

/** Yields text deltas from streamGenerateContent (SSE). Throws AppError on any failure. */
async function* streamGeminiOnce(
  args: StreamArgs & { model: string },
): AsyncGenerator<string, void, void> {
    const generationConfig: Record<string, unknown> = {
    temperature: args.temperature,
    responseMimeType: 'application/json',
    responseSchema: args.schema,
    maxOutputTokens: 8192,
  };
  if (env.geminiThinkingBudget !== null) {
    generationConfig.thinkingConfig = { thinkingBudget: env.geminiThinkingBudget };
  }
  if (env.geminiMediaResolution) generationConfig.mediaResolution = env.geminiMediaResolution;

  const body = {
    systemInstruction: { parts: [{ text: args.systemInstruction }] },
    contents: [{ role: 'user', parts: args.parts }],
    generationConfig,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(args.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      // The key travels in a header, never in the URL, so it cannot leak into access logs.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey },
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new AppError('upstream_error', 'Could not reach the Gemini API. Try again.');
  }
  if (!res.ok) {
  const text = await res.text();
  const err = mapHttpError(res.status, text);
  if (RETRYABLE_STATUSES.has(res.status)) {
    throw new RetryableUpstreamError(res.status, err.message);
  }
  throw err;
}
  if (!res.body) throw new AppError('upstream_error', 'Gemini returned an empty response.');

  const handleLine = (line: string): string => {
    if (!line.startsWith('data:')) return '';
    const payload = line.slice(5).trim();
    if (!payload) return '';
    let ev: GeminiEvent;
    try {
      ev = JSON.parse(payload) as GeminiEvent;
    } catch {
      return '';
    }
    if (ev.error) {
      throw mapHttpError(ev.error.code ?? 500, JSON.stringify({ error: ev.error }));
    }
    if (ev.promptFeedback?.blockReason) {
      throw new AppError('safety_block',
        `Gemini's safety filters blocked this image (${ev.promptFeedback.blockReason}). Try a different image.`);
    }
    const cand = ev.candidates?.[0];
    let text = '';
    for (const p of cand?.content?.parts ?? []) {
      if (typeof p.text === 'string' && !p.thought) text += p.text;
    }
    const fr = cand?.finishReason;
    if (fr && !OK_FINISH.has(fr)) {
      if (fr === 'MAX_TOKENS') {
        throw new AppError('truncated', 'The model response was cut off before completing. Retry, or use a simpler image.');
      }
      throw new AppError('safety_block', `Gemini stopped generating (${fr}). Its safety filters may have blocked the output.`);
    }
    return text;
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        const t = handleLine(line);
        if (t) yield t;
      }
    }
    const tail = handleLine(buf.replace(/\r$/, ''));
    if (tail) yield tail;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

const RETRYABLE_STATUSES = new Set([404, 408, 425, 429, 500, 502, 503, 504]);

class RetryableUpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'RetryableUpstreamError';
  }
}

function getModelChain(): string[] {
  const primary = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
  const fallbacks = (process.env.GEMINI_MODEL_FALLBACKS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([primary, ...fallbacks]));
}

export async function* streamGemini(
  args: StreamArgs,
): AsyncGenerator<string, void, void> {
  const models = getModelChain();
  let lastError: unknown = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let yielded = false;

    try {
      for await (const chunk of streamGeminiOnce({ ...args, model })) {
        yielded = true;
        yield chunk;
      }
      return;
    } catch (err) {
      if (yielded) throw err;

      const isLast = i === models.length - 1;

      if (err instanceof RetryableUpstreamError && !isLast) {
        console.warn(
          `[gemini] ${model} → HTTP ${err.status}; falling back to ${models[i + 1]}`,
        );
        lastError = err;
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error('All Gemini models failed.');
}