'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Props { connected: boolean; last4: string | null; validatedAt: string | null }

export default function ConnectForm({ connected, last4, validatedAt }: Props) {
  const router = useRouter();
  const turnstile = useRef<TurnstileInstance>(null);
  const [apiKey, setApiKey] = useState('');
  const [token, setToken] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/key', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey, turnstileToken: token }),
      });
      const j = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not save key');
      setApiKey('');
      router.push('/search');
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not save key' });
      turnstile.current?.reset();
      setToken(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete your stored Gemini API key? You will need to reconnect to search.')) return;
    setBusy(true);
    const res = await fetch('/api/key', { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: 'Key deleted.' });
      router.refresh();
    } else setMsg({ kind: 'err', text: 'Could not delete the key.' });
  }

  return (
    <div className="space-y-4">
      <Panel title="Connect your Gemini API key" hint={connected ? `connected …${last4}` : 'required'}>
        <p className="mb-3 text-amber-bright">
          Your key is used <b>only for your own searches</b>. It is encrypted at rest (AES-256-GCM), never logged, never sent
          to the browser again, and you can rotate or delete it at any time.
        </p>
        {connected ? (
          <p className="mb-3 text-amber-dim">
            A key ending in <b className="text-amber-bright">…{last4}</b> is stored (validated {validatedAt ? new Date(validatedAt).toLocaleString() : '—'}).
            Paste a new key below to rotate it.
          </p>
        ) : null}
        <form onSubmit={save}>
          <label className="label !mt-0" htmlFor="apikey">Gemini API key</label>
          <Input
            id="apikey" type="password" required autoComplete="off" spellCheck={false}
            placeholder="AIza… or AQ.…" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="mt-2 text-[11px] text-amber-dim">
            Get one free at{' '}
            <a className="underline hover:text-amber-bright" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              aistudio.google.com/apikey
            </a>. We validate it with one free model lookup before saving.
          </p>
          {SITE_KEY ? (
            <div className="mt-3">
              <Turnstile ref={turnstile} siteKey={SITE_KEY} options={{ theme: 'dark' }} onSuccess={setToken} onExpire={() => setToken(undefined)} />
            </div>
          ) : null}
          {msg ? <p className={`mt-3 ${msg.kind === 'err' ? 'text-bad' : 'text-ok'}`}>{msg.text}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy || !apiKey || (!!SITE_KEY && !token)}>
              {connected ? 'Rotate key' : 'Validate & save'}
            </Button>
            {connected ? <Button type="button" variant="danger" onClick={remove} disabled={busy}>Delete key</Button> : null}
          </div>
        </form>
      </Panel>
    </div>
  );
}
