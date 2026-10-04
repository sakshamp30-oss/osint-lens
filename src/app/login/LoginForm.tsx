'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const turnstile = useRef<TurnstileInstance>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const captchaToken = captcha;
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (error) setMsg({ kind: 'err', text: error.message });
      else {
        router.replace('/search');
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { captchaToken, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMsg({ kind: 'err', text: error.message });
      else setMsg({ kind: 'ok', text: 'Check your email to confirm your account, then sign in.' });
    }
    turnstile.current?.reset(); // tokens are single-use
    setCaptcha(undefined);
    setBusy(false);
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg({ kind: 'err', text: error.message });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="label !mt-0" htmlFor="email">Email</label>
      <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="label" htmlFor="password">Password</label>
      <Input
        id="password" type="password" required minLength={8}
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        value={password} onChange={(e) => setPassword(e.target.value)}
      />
      {SITE_KEY ? (
        <Turnstile ref={turnstile} siteKey={SITE_KEY} options={{ theme: 'dark' }} onSuccess={setCaptcha} onExpire={() => setCaptcha(undefined)} />
      ) : null}
      {msg ? <p className={msg.kind === 'err' ? 'text-bad' : 'text-ok'}>{msg.text}</p> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || (!!SITE_KEY && !captcha)}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>
      <Button type="button" className="w-full" onClick={google}>Continue with Google</Button>
      <button
        type="button"
        className="w-full text-center text-[11px] uppercase tracking-widest text-amber-dim hover:text-amber-bright"
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}
      >
        {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
