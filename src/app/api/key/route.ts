import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/crypto';
import { validateGeminiKey } from '@/lib/gemini/client';
import { AppError, errorResponse } from '@/lib/errors';
import { clientIp, keyAttempts } from '@/lib/ratelimit';
import { verifyTurnstile } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepts legacy AIza keys and new AQ. authentication keys.
// Google's API is the real validator — this is just a sanity check.
const KEY_RE = /^(AIza[0-9A-Za-z_-]{35}|AQ\.[0-9A-Za-z_.-]{20,})$/;

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AppError('unauthorized', 'Sign in required.');
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    const { data } = await createClient()
      .from('api_keys')
      .select('last4, validated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    return Response.json({ connected: !!data, last4: data?.last4 ?? null, validatedAt: data?.validated_at ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ip = clientIp(req);

    const rl = await keyAttempts().limit(user.id);
    if (!rl.success) {
      throw new AppError('rate_limited', 'Too many key attempts. Try again later.', { resetAt: rl.reset });
    }

    let body: { apiKey?: unknown; turnstileToken?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new AppError('bad_request', 'Invalid request body.');
    }
    await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, ip);

    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!KEY_RE.test(apiKey)) {
      throw new AppError('invalid_key', 'That does not look like a Gemini API key. It should start with "AIza" or "AQ." — get one at aistudio.google.com/apikey.');
    }

    await validateGeminiKey(apiKey); // throws invalid_key / upstream_error

    const ciphertext = encryptSecret(apiKey, user.id);
    const now = new Date().toISOString();
    const { error } = await createAdminClient().from('api_keys').upsert({
      user_id: user.id,
      ciphertext,
      last4: apiKey.slice(-4),
      key_version: 1,
      validated_at: now,
      updated_at: now,
    });
    if (error) throw new Error('Failed to store key');
    return Response.json({ connected: true, last4: apiKey.slice(-4), validatedAt: now });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const { error } = await createAdminClient().from('api_keys').delete().eq('user_id', user.id);
    if (error) throw new Error('Failed to delete key');
    return Response.json({ connected: false });
  } catch (e) {
    return errorResponse(e);
  }
}
