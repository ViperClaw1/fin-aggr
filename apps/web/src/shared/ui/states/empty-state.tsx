import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  /** Explanation or an action, e.g. a link that resets filters. */
  children?: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="rounded border border-dashed border-border p-6 text-center">
      <p className="font-medium">{title}</p>
      {children === undefined ? null : <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}
