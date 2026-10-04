import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './cache';

export const LIMITS = { userDay: 100, userMinute: 10, ipDay: 200 } as const;

const cache: Record<string, Ratelimit> = {};
function limiter(name: string, tokens: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`): Ratelimit {
  if (!cache[name]) {
    cache[name] = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `osint:rl:${name}`,
    });
  }
  return cache[name];
}

const userMinute = () => limiter('u-min', LIMITS.userMinute, '1 m');
const userDay = () => limiter('u-day', LIMITS.userDay, '1 d');
const ipDay = () => limiter('ip-day', LIMITS.ipDay, '1 d');
export const keyAttempts = () => limiter('key', 10, '1 h');
export const uploadUrls = () => limiter('upload', 40, '1 h');

export type LimitResult =
  | { ok: true }
  | { ok: false; scope: 'ip' | 'minute' | 'day'; resetAt: number };

export async function checkSearchLimits(userId: string, ip: string): Promise<LimitResult> {
  const a = await ipDay().limit(ip);
  if (!a.success) return { ok: false, scope: 'ip', resetAt: a.reset };
  const b = await userMinute().limit(userId);
  if (!b.success) return { ok: false, scope: 'minute', resetAt: b.reset };
  const c = await userDay().limit(userId);
  if (!c.success) return { ok: false, scope: 'day', resetAt: c.reset };
  return { ok: true };
}

export async function getUsage(userId: string) {
  const [d, m] = await Promise.all([userDay().getRemaining(userId), userMinute().getRemaining(userId)]);
  return {
    day: { remaining: d.remaining, limit: LIMITS.userDay, resetAt: d.reset },
    minute: { remaining: m.remaining, limit: LIMITS.userMinute, resetAt: m.reset },
  };
}

export function clientIp(req: Request): string {
  const v = req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-forwarded-for');
  if (v) return v.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
