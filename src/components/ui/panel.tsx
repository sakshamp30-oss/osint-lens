import { cn } from '@/lib/utils';

export function Panel({
  title, hint, className, children,
}: { title: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('panel', className)}>
      <div className="panel-head">
        <span>{title}</span>
        {hint ? <span className="normal-case tracking-normal text-amber-dim">{hint}</span> : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
