'use client';

import { useEffect, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';

export type EligibilityState =
  | { stage: 'off' }
  | { stage: 'signed_out' }
  | { stage: 'no_wallet' }
  | { stage: 'checking' }
  | { stage: 'done'; eligible: boolean; country: string | null; reason: string | null };

/**
 * Read-only eligibility check for the future live desk. Not mounted on the
 * paper desk — authority-tier UI must not appear until a ticket can use it.
 * When called, a signed-in linked wallet is checked via /api/eligibility.
 * Nothing is authorized by this; it reports the signal only.
 */
export function useEligibility(): EligibilityState {
  const auth = useDeskAuth();
  const [state, setState] = useState<EligibilityState>({ stage: 'off' });

  useEffect(() => {
    if (!auth.enabled) { setState({ stage: 'off' }); return; }
    if (!auth.authenticated) { setState({ stage: 'signed_out' }); return; }
    if (!auth.walletAddress) { setState({ stage: 'no_wallet' }); return; }
    let cancelled = false;
    setState({ stage: 'checking' });
    fetch(`/api/eligibility?address=${encodeURIComponent(auth.walletAddress)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((r: { eligible: boolean; country: string | null; reason: string | null }) => {
        if (!cancelled) setState({ stage: 'done', eligible: r.eligible, country: r.country, reason: r.reason });
      })
      .catch(() => { if (!cancelled) setState({ stage: 'done', eligible: false, country: null, reason: 'check_unavailable' }); });
    return () => { cancelled = true; };
  }, [auth.enabled, auth.authenticated, auth.walletAddress]);

  return state;
}
