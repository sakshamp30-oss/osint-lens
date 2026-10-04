import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import SearchWorkbench from '@/components/SearchWorkbench';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: key } = await supabase.from('api_keys').select('last4').eq('user_id', user.id).maybeSingle();
  if (!key) redirect('/connect');

  return (
    <>
      <AppHeader email={user.email} last4={key.last4} />
      <main className="mx-auto max-w-[1500px] px-4 pb-16">
        <SearchWorkbench />
      </main>
    </>
  );
}
