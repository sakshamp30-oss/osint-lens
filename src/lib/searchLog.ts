import 'server-only';
import { createAdminClient } from './supabase/admin';
import type { Mode } from '@/types';

export interface LogEntry {
  userId: string;
  mode: Mode;
  status: string;
  errorCode?: string;
  phash?: string;
  bytes?: number;
  width?: number;
  height?: number;
  cacheHit?: boolean;
  model?: string;
  durationMs?: number;
  ipHash?: string;
}

export async function writeSearchLog(e: LogEntry): Promise<void> {
  const { error } = await createAdminClient().from('search_log').insert({
    user_id: e.userId,
    mode: e.mode,
    status: e.status,
    error_code: e.errorCode ?? null,
    phash: e.phash ?? null,
    image_bytes: e.bytes ?? null,
    width: e.width ?? null,
    height: e.height ?? null,
    cache_hit: e.cacheHit ?? false,
    model: e.model ?? null,
    duration_ms: e.durationMs ?? null,
    ip_hash: e.ipHash ?? null,
  });
  if (error) console.error('[search_log] insert failed:', error.message);
}
