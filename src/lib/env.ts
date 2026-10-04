import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

// Getters (not constants) so `next build` does not fail when env is absent.
export const env = {
  get supabaseUrl() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseServiceKey() { return req('SUPABASE_SERVICE_ROLE_KEY'); },
  get masterKey() { return req('MASTER_ENCRYPTION_KEY'); },
  get turnstileSecret() { return process.env.TURNSTILE_SECRET_KEY ?? ''; },
  get geminiModel() { return process.env.GEMINI_MODEL || 'gemini-3.8-flash'; },
  get geminiModelFallbacks(): string[] {
    return (process.env.GEMINI_MODEL_FALLBACKS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },
    get geminiThinkingBudget(): number | null {
    const v = process.env.GEMINI_THINKING_BUDGET;
    return v ? Number(v) : null;
  },
  get geminiMediaResolution() { return process.env.GEMINI_MEDIA_RESOLUTION || ''; },
  get maxUploadBytes() { return num('MAX_UPLOAD_MB', 14) * 1024 * 1024; },
  get nsfwModel() { return process.env.NSFW_MODEL || 'Falconsai/nsfw_image_detection'; },
  get nsfwThreshold() { return num('NSFW_THRESHOLD', 0.85); },
  get moderationFailOpen() { return process.env.MODERATION_FAIL_OPEN === 'true'; },
  
};
