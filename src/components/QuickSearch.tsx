import { ExternalLink } from 'lucide-react';
import { ENGINES } from '@/lib/searchLinks';
import type { SuggestedQuery } from '@/types';

export default function QuickSearch({ queries }: { queries: Partial<SuggestedQuery>[] }) {
  const valid = queries.filter((q): q is SuggestedQuery & { query: string } => typeof q.query === 'string' && q.query.length > 2);
  if (valid.length === 0) return <p className="text-amber-dim">// no suggested queries</p>;
  return (
    <ul className="space-y-2">
      {valid.map((q, i) => (
        <li key={`${q.query}-${i}`} className="border border-amber-dim/60 p-2">
          <div className="text-amber-bright">{q.query}</div>
          {q.rationale ? <div className="mb-2 text-[11px] text-amber-dim">{q.rationale}</div> : null}
          <div className="flex flex-wrap gap-2">
            {ENGINES.map((e) => (
              <a
                key={e.id}
                href={e.url(q.query)}
                target="_blank"
                rel="noopener noreferrer"
                className="chip gap-1 hover:border-amber hover:bg-amber hover:text-black"
              >
                {e.label} <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
