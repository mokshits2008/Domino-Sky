'use client';

import dynamic from 'next/dynamic';

// Client-only wrapper component
export const NetworkMap = dynamic(
  () => import('./NetworkMapInner').then((mod) => mod.NetworkMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-surface-alt rounded-card border border-border flex items-center justify-center text-xs text-ink-muted">
        Loading network topology map…
      </div>
    ),
  }
);
