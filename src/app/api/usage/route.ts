import { createClient } from '@/lib/supabase/server';
import { errorResponse, AppError } from '@/lib/errors';
import { getUsage } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new AppError('unauthorized', 'Sign in required.');
    return Response.json(await getUsage(user.id));
  } catch (e) {
    return errorResponse(e);
  }
}
