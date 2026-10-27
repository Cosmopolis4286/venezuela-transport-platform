import { useEffect, useState } from 'react';

/** Whole seconds left until `iso` (0 once reached), ticking every second. */
export function useSecondsLeft(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  return iso ? Math.max(0, Math.floor((Date.parse(iso) - now) / 1000)) : 0;
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
