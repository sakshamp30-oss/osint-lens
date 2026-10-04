'use client';
import { useCallback, useEffect, useState } from 'react';

interface Usage {
  day: { remaining: number; limit: number; resetAt: number };
  minute: { remaining: number; limit: number };
}

export default function UsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage', { cache: 'no-store' });
      if (res.ok) setUsage((await res.json()) as Usage);
    } catch {
      /* indicator is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener('usage:refresh', handler);
    return () => window.removeEventListener('usage:refresh', handler);
  }, [load]);

  if (!usage) return <span className="chip text-amber-dim">USAGE …</span>;
  const low = usage.day.remaining <= 10;
  return (
    <span
      className={`chip ${low ? 'border-bad text-bad' : 'text-amber-bright'}`}
      title={`Daily window resets ${new Date(usage.day.resetAt).toLocaleString()}`}
    >
      TODAY {usage.day.remaining}/{usage.day.limit} · MIN {usage.minute.remaining}/{usage.minute.limit}
    </span>
  );
}
