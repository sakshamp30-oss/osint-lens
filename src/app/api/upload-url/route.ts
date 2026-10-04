import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, errorResponse } from '@/lib/errors';
import { uploadUrls } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel caps request bodies at 4.5 MB. For bigger images the browser uploads straight to a
 * private Supabase Storage bucket via a one-time signed URL, then passes only the path to
 * /api/search, which reads the file once and deletes it.
 */
export async function POST() {
  try {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new AppError('unauthorized', 'Sign in required.');

    const rl = await uploadUrls().limit(user.id);
    if (!rl.success) throw new AppError('rate_limited', 'Too many uploads. Try again later.', { resetAt: rl.reset });

    const path = `${user.id}/${randomUUID()}`;
    const { data, error } = await createAdminClient().storage.from('uploads').createSignedUploadUrl(path);
    if (error || !data) throw new Error('Could not create upload URL');
    return Response.json({ path: data.path, token: data.token });
  } catch (e) {
    return errorResponse(e);
  }
}
