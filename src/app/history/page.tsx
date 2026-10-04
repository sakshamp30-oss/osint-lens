import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import { formatBytes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: key }, { data: rows, error }] = await Promise.all([
    supabase.from('api_keys').select('last4').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('search_log')
      .select('id, created_at, mode, status, error_code, cache_hit, phash, image_bytes, width, height, model, duration_ms')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  return (
    <>
      <AppHeader email={user.email} last4={key?.last4} />
      <main className="mx-auto max-w-[1500px] px-4 pb-16">
        <section className="panel">
          <div className="panel-head"><span>Audit log · your searches</span><span className="normal-case tracking-normal text-amber-dim">last 200 · only you can see these</span></div>
          <div className="overflow-x-auto p-3">
            {error ? <p className="text-bad">Could not load the log.</p> : null}
            {rows && rows.length === 0 ? <p className="text-amber-dim">// no searches yet</p> : null}
            {rows && rows.length > 0 ? (
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead className="text-[10px] uppercase tracking-widest text-amber-dim">
                  <tr>
                    <th className="py-1 pr-3">Time</th><th className="pr-3">Mode</th><th className="pr-3">Status</th>
                    <th className="pr-3">Cache</th><th className="pr-3">Image</th><th className="pr-3">Size</th>
                    <th className="pr-3">pHash</th><th className="pr-3">Model</th><th>ms</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-amber-dim/40">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="pr-3 uppercase">{r.mode}</td>
                      <td className={`pr-3 ${r.status === 'ok' ? 'text-ok' : 'text-bad'}`}>
                        {r.status}{r.error_code ? ` (${r.error_code})` : ''}
                      </td>
                      <td className="pr-3">{r.cache_hit ? 'HIT' : '—'}</td>
                      <td className="pr-3">{r.width && r.height ? `${r.width}×${r.height}` : '—'}</td>
                      <td className="pr-3">{formatBytes(r.image_bytes)}</td>
                      <td className="pr-3 font-mono text-amber-dim" title={r.phash ?? ''}>{r.phash ? `${r.phash.slice(0, 12)}…` : '—'}</td>
                      <td className="pr-3 text-amber-dim">{r.model ?? '—'}</td>
                      <td>{r.duration_ms ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
