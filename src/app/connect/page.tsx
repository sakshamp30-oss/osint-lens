import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import ConnectForm from './ConnectForm';

export const dynamic = 'force-dynamic';

export default async function ConnectPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: key } = await supabase
    .from('api_keys')
    .select('last4, validated_at') // never select('*'): ciphertext is not readable by this role
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <>
      <AppHeader email={user.email} last4={key?.last4} />
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <ConnectForm connected={!!key} last4={key?.last4 ?? null} validatedAt={key?.validated_at ?? null} />
      </main>
    </>
  );
}
