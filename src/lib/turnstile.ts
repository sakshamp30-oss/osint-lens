import 'server-only';
import { AppError } from './errors';
import { env } from './env';

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const secret = env.turnstileSecret;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('bot_check_failed', 'Bot protection is not configured on the server.');
    }
    return; // local development without Turnstile
  }
  if (!token) throw new AppError('bot_check_failed', 'Please complete the bot check.');
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  let ok = false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    ok = ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    throw new AppError('bot_check_failed', 'Bot check could not be verified. Try again.');
  }
  if (!ok) throw new AppError('bot_check_failed', 'Bot check failed. Refresh and try again.');
}
