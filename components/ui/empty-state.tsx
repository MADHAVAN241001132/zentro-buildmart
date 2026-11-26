import type { ReactNode } from 'react';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-card px-6 py-12 text-center">
      <h2 className="font-display text-2xl text-burgundy">{title}</h2>
      {body ? <p className="mx-auto mt-2 max-w-md text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
