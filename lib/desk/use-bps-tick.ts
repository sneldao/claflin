'use client';

import { useEffect, useState } from 'react';

/**
 * A real change between successive readings of the same instrument flashes
 * ▲/▼ once; a new instrument or a first reading never ticks. Shared by the
 * slip's gap strip and the room tape so both move the same way.
 */
export function useBpsTick(id: string | null, bps: string | null): 'up' | 'down' | null {
  const [seen, setSeen] = useState<{ id: string | null; bps: string | null }>({ id, bps });
  const [tick, setTick] = useState<'up' | 'down' | null>(null);
  if (seen.id !== id || seen.bps !== bps) {
    const sameInstrument = seen.id === id;
    setSeen({ id, bps });
    const before = Number(seen.bps);
    const after = Number(bps);
    setTick(sameInstrument && seen.bps !== null && bps !== null
      && Number.isFinite(before) && Number.isFinite(after) && before !== after
      ? (after > before ? 'up' : 'down')
      : null);
  }
  useEffect(() => {
    if (!tick) return;
    const timer = setTimeout(() => setTick(null), 1200);
    return () => clearTimeout(timer);
  }, [tick]);
  return tick;
}
