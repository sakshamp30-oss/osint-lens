import Link from 'next/link';
import UsageBadge from './UsageBadge';

export default function AppHeader({ email, last4 }: { email?: string | null; last4?: string | null }) {
  return (
    <header className="panel mx-auto mb-4 mt-4 flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Link href="/search" className="text-lg font-bold tracking-[0.18em] text-amber [text-shadow:0_0_8px_rgba(255,140,0,.6)]">
        OSINT<span className="text-amber-bright">//</span>LENS
      </Link>
      <nav className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest">
        <Link className="chip hover:border-amber hover:text-amber-bright" href="/search">Search</Link>
        <Link className="chip hover:border-amber hover:text-amber-bright" href="/history">Audit log</Link>
        <Link className="chip hover:border-amber hover:text-amber-bright" href="/connect">
          Key {last4 ? `…${last4}` : ''}
        </Link>
        <UsageBadge />
        <form action="/auth/signout" method="post">
          <button className="chip hover:border-bad hover:text-bad" type="submit" title={email ?? ''}>Sign out</button>
        </form>
      </nav>
    </header>
  );
}
