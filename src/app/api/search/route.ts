import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, hmacHex } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError, toAppError, errorResponse } from '@/lib/errors';
import { inspectImage, type ImageInfo } from '@/lib/image';
import { moderateImage } from '@/lib/moderation';
import { collectForensics } from '@/lib/forensics';
import { cacheGet, cacheKey, cacheSet, CACHE_TTL_SECONDS } from '@/lib/cache';
import { checkSearchLimits, clientIp } from '@/lib/ratelimit';
import { streamGemini, type GeminiPart } from '@/lib/gemini/client';
import { buildPrompt } from '@/lib/gemini/prompts';
import { writeSearchLog } from '@/lib/searchLog';
import { MODES, type AnalysisResult, type ForensicsMeta, type Mode, type StreamEvent } from '@/types';
import { File } from 'node:buffer';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UPLOAD_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
const ID_FLAG_RE = /"contains_id_document"\s*:\s*(true|false)/;

function parseModelJson(text: string): AnalysisResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const v: unknown = JSON.parse(cleaned);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as AnalysisResult;
  } catch {
    /* fall through */
  }
  throw new AppError('upstream_error', 'The model returned malformed JSON. Please retry.');
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const admin = createAdminClient();
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return errorResponse(new AppError('unauthorized', 'Sign in required.'));

  const ip = clientIp(req);
  let mode: Mode = 'reverse';
  let storagePath: string | null = null;
  let info: ImageInfo | null = null;
  let ipHash: string | undefined;

  const cleanupUpload = async () => {
    if (!storagePath) return;
    const p = storagePath;
    storagePath = null;
    await admin.storage.from('uploads').remove([p]).catch(() => undefined);
  };
  const logBase = () => ({
    userId: user.id, mode, phash: info?.phash, bytes: info?.bytes, width: info?.width, height: info?.height, ipHash,
  });

  try {
    ipHash = hmacHex('ip', ip);
    const form = await req.formData();

    const rawMode = form.get('mode');
    if (typeof rawMode !== 'string' || !(MODES as readonly string[]).includes(rawMode)) {
      throw new AppError('bad_request', 'Unknown search mode.');
    }
    mode = rawMode as Mode;

    // ── rate limits (per IP, per user/minute, per user/day) ──
    const rl = await checkSearchLimits(user.id, ip);
    if (!rl.ok) {
      const when = new Date(rl.resetAt).toLocaleTimeString('en-GB', { timeZone: 'UTC' });
      const scope = rl.scope === 'minute' ? 'per-minute' : rl.scope === 'day' ? 'daily' : 'per-IP daily';
      throw new AppError('rate_limited', `You've hit the ${scope} search limit. Try again after ${when} UTC.`,
        { resetAt: rl.resetAt, scope: rl.scope });
    }

    // ── key must exist (decrypted later, only on a cache miss) ──
    const { data: keyRow } = await admin.from('api_keys').select('ciphertext').eq('user_id', user.id).maybeSingle();
    if (!keyRow) throw new AppError('no_key', 'Connect your Gemini API key first.');

    // ── read image: multipart (<4.5 MB) or via Supabase Storage (larger) ──
    let buffer: Buffer;
    const file = form.get('image');
    const sp = form.get('storagePath');
    if (file instanceof File) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (typeof sp === 'string') {
      if (!sp.startsWith(`${user.id}/`) || !UPLOAD_PATH_RE.test(sp)) throw new AppError('bad_request', 'Invalid upload reference.');
      storagePath = sp;
      const { data, error } = await admin.storage.from('uploads').download(sp);
      if (error || !data) throw new AppError('bad_request', 'Uploaded image not found. Please upload again.');
      buffer = Buffer.from(await data.arrayBuffer());
      await cleanupUpload(); // we hold the bytes now; delete the stored copy immediately
    } else {
      throw new AppError('bad_request', 'No image provided.');
    }

    info = await inspectImage(buffer, env.maxUploadBytes);
    const model = env.geminiModel;
    const key = cacheKey(info.phash, mode, model, mode === 'forensics' ? info.sha256 : '');

    const { data: profile } = await admin.from('users').select('is_investigator').eq('id', user.id).maybeSingle();
    const investigator = profile?.is_investigator === true;

    const encoder = new TextEncoder();
    const imageInfo = info; // narrowed const for closures

    // ── cache lookup ──
    const cached = await cacheGet(key);
    if (cached) {
      let forensicsMeta: ForensicsMeta | null = null;
      if (mode === 'forensics') forensicsMeta = await collectForensics(imageInfo.buffer, imageInfo.format);
      await writeSearchLog({ ...logBase(), status: 'ok', cacheHit: true, model: cached.model, durationMs: Date.now() - t0 });
      await admin.rpc('bump_cache_hit', { p_key: key });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (e: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          send({ type: 'start', mode, phash: imageInfo.phash, cached: true, model: cached.model, width: imageInfo.width, height: imageInfo.height, bytes: imageInfo.bytes });
          if (forensicsMeta) send({ type: 'meta', forensics: forensicsMeta });
          send({ type: 'done', result: cached.result, cached: true });
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
    }

    // ── moderation (before anything is sent to Gemini) ──
    const mod = await moderateImage(imageInfo.buffer);
    if (mod.blocked) {
      await admin.from('moderation_queue').insert({
        user_id: user.id, phash: imageInfo.phash, reason: 'nsfw_classifier', score: mod.nsfwScore,
      });
      await writeSearchLog({ ...logBase(), status: 'blocked_nsfw', errorCode: 'moderation_blocked', durationMs: Date.now() - t0 });
      throw new AppError('moderation_blocked', 'This image was blocked by content moderation and was not analyzed.');
    }

    const forensicsMeta = mode === 'forensics' ? await collectForensics(imageInfo.buffer, imageInfo.format) : null;
    const prompt = buildPrompt(mode, { idDocsAllowed: investigator, forensics: forensicsMeta });

    let apiKey: string;
    try {
      apiKey = decryptSecret(keyRow.ciphertext, user.id);
    } catch {
      throw new AppError('invalid_key', 'Your stored key could not be read. Please reconnect your Gemini key.');
    }

    const abort = new AbortController();
    req.signal.addEventListener('abort', () => abort.abort());

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (e: StreamEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          } catch {
            closed = true;
          }
        };
        try {
          send({ type: 'start', mode, phash: imageInfo.phash, cached: false, model, width: imageInfo.width, height: imageInfo.height, bytes: imageInfo.bytes });
          if (forensicsMeta) send({ type: 'meta', forensics: forensicsMeta });

          let full = '';
          let decided = false;
          const blockId = () => new AppError('id_document_blocked',
            'This image appears to be an identity document. Document analysis is restricted to investigator accounts.');

          // Image part first, then text (Gemini's recommended order for a single image).
          const parts: GeminiPart[] = [
            { inlineData: { mimeType: imageInfo.mime, data: imageInfo.buffer.toString('base64') } },
            { text: prompt.taskText },
          ];

          for await (const chunk of streamGemini({
            apiKey, systemInstruction: prompt.systemInstruction, parts,
            schema: prompt.schema, temperature: prompt.temperature, signal: abort.signal,
          })) {
            full += chunk;
            if (!decided) {
              // contains_id_document is the first schema property: hold output until we see
              // it, so a restricted document's content never reaches the browser.
              const m = ID_FLAG_RE.exec(full);
              if (!m) continue;
              decided = true;
              if (m[1] === 'true' && !investigator) {
                abort.abort();
                throw blockId();
              }
              send({ type: 'chunk', text: full });
            } else {
              send({ type: 'chunk', text: chunk });
            }
          }

          const result = parseModelJson(full);
          if (result.contains_id_document === true && !investigator) throw blockId();
          if (!decided) send({ type: 'chunk', text: full });

          if (result.contains_id_document !== true) {
            const stored = await cacheSet(key, { result, model, createdAt: new Date().toISOString() });
            if (stored) {
              await admin.from('cache_meta').upsert({
                cache_key: key, mode, phash: imageInfo.phash, model,
                expires_at: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
              });
            }
          }
          await writeSearchLog({ ...logBase(), status: 'ok', model, durationMs: Date.now() - t0 });
          send({ type: 'done', result, cached: false });
        } catch (e) {
          const err = toAppError(e);
          if (!abort.signal.aborted || err.code === 'id_document_blocked') {
            await writeSearchLog({
              ...logBase(),
              status: err.code === 'id_document_blocked' ? 'blocked_id' : 'error',
              errorCode: err.code, model, durationMs: Date.now() - t0,
            });
            send({ type: 'error', code: err.code, message: err.message });
          }
        } finally {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() {
        abort.abort();
      },
    });

    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    await cleanupUpload();
    const err = toAppError(e);
    if (err.code !== 'moderation_blocked' && err.code !== 'rate_limited' && err.code !== 'unauthorized') {
      await writeSearchLog({ ...logBase(), status: 'error', errorCode: err.code, durationMs: Date.now() - t0 });
    }
    return errorResponse(err);
  }
}
