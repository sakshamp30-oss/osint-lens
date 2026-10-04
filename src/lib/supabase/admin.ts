import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

/** Service-role client. Bypasses RLS: server-only, never import from client code. */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
