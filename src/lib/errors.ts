export type ErrorCode =
  | 'unauthorized' | 'no_key' | 'invalid_key' | 'quota_exceeded'
  | 'image_too_large' | 'unsupported_format' | 'safety_block' | 'rate_limited'
  | 'moderation_blocked' | 'id_document_blocked' | 'moderation_unavailable'
  | 'bad_request' | 'upstream_error' | 'truncated' | 'bot_check_failed' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, no_key: 409, invalid_key: 400, quota_exceeded: 429,
  image_too_large: 413, unsupported_format: 415, safety_block: 422, rate_limited: 429,
  moderation_blocked: 422, id_document_blocked: 422, moderation_unavailable: 503,
  bad_request: 400, upstream_error: 502, truncated: 502, bot_check_failed: 403, internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly extra: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.extra = extra;
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  // Log name + message only. Never log request bodies (they may contain API keys).
  console.error('[internal]', e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error');
  return new AppError('internal', 'Unexpected server error.');
}

export function errorResponse(e: unknown): Response {
  const err = toAppError(e);
  const headers: Record<string, string> = {};
  const resetAt = err.extra.resetAt;
  if (typeof resetAt === 'number') {
    headers['Retry-After'] = String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
  }
  return Response.json(
    { error: { code: err.code, message: err.message, ...err.extra } },
    { status: err.status, headers },
  );
}
