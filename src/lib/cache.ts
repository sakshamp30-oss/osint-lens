import 'server-only';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import type { AnalysisResult, Mode } from '@/types';

export const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

let redis: Redis | null = null;
export function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

/**
 * key = sha256(pHash | mode | model | exact), where `exact` is the byte-level sha256 for
 * forensics only (EXIF/ELA depend on exact bytes, not on how the image looks).
 */
export function cacheKey(phash: string, mode: Mode, model: string, exact = ''): string {
  return `osint:v1:${createHash('sha256').update(`${phash}|${mode}|${model}|${exact}`).digest('hex')}`;
}

export interface CachedEntry {
  result: AnalysisResult;
  model: string;
  createdAt: string;
}

export async function cacheGet(key: string): Promise<CachedEntry | null> {
  try {
    return (await getRedis().get<CachedEntry>(key)) ?? null;
  } catch {
    console.error('[cache] get failed');
    return null; // cache is an optimisation; never fail a search because of it
  }
}

export async function cacheSet(key: string, entry: CachedEntry): Promise<boolean> {
  try {
    await getRedis().set(key, entry, { ex: CACHE_TTL_SECONDS });
    return true;
  } catch {
    console.error('[cache] set failed');
    return false;
  }
}
