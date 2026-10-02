'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';

export type EligibilityState =
  | { stage: 'off' }
  | { stage: 'signed_out' }
  | { stage: 'no_wallet' }
  | { stage: 'checking' }
  | { stage: 'done'; eligible: boolean; country: string | null; reason: string | null };

/** Where a wallet goes to carry Coinbase's attestations — free, any EVM wallet,
 *  runs on the issuer's side. */
export const COINBASE_VERIFICATIONS_URL = 'https://www.coinbase.com/onchain-verify';

export interface EligibilityLine {
  /** Checklist marker matching the .readiness data-state vocabulary. */
  marker: 'ok' | 'needed' | 'unknown';
  detail: string;
  /** 'verify' points at the issuer's flow; 'retry' re-runs the check; 'none' is terminal or pending. */
  action: 'verify' | 'retry' | 'none';
}

/** One honest line per check outcome — every blocked state names why, and a
 *  blocked-with-a-path state names the path. Kept pure so the copy is testable
 *  without mounting the ticket. */
export function eligibilityLine(state: EligibilityState): EligibilityLine {
  if (state.stage === 'checking') {
    return { marker: 'unknown', detail: 'Reading the wallet’s onchain attestations…', action: 'none' };
  }
  if (state.stage !== 'done') {
    return { marker: 'unknown', detail: 'Checks once a wallet is connected.', action: 'none' };
  }
  if (state.eligible) {
    return { marker: 'ok', detail: 'Verified Account and an eligible country attest this wallet.', action: 'none' };
  }
  switch (state.reason) {
    case 'restricted_jurisdiction':
      return { marker: 'needed', detail: `This wallet’s verified country${state.country ? ` (${state.country})` : ''} is excluded under the issuer’s terms — live settle stays closed.`, action: 'none' };
    case 'no_verified_account_attestation':
      return { marker: 'needed', detail: 'No Coinbase account verification on this wallet. Verification happens on the issuer’s side and is free — verify, then come back.', action: 'verify' };
    case 'no_country_attestation':
      return { marker: 'needed', detail: 'This wallet is verified, but has no country attestation — these instruments need an eligible-country one.', action: 'verify' };
    case 'country_attestation_undecodable':
      return { marker: 'needed', detail: 'The country attestation on this wallet could not be read.', action: 'verify' };
    case 'check_unavailable':
      return { marker: 'needed', detail: 'The onchain check could not be read — live settle stays closed until it can.', action: 'retry' };
    default:
      return { marker: 'needed', detail: 'This wallet is not verified for these instruments — live settle stays closed.', action: 'none' };
  }
}

/**
 * Read-only eligibility check for the live desk — the connected wallet's
 * Coinbase Verifications read via /api/eligibility. Nothing is authorized by
 * this; it reports the signal only. `retry()` re-runs the read.
 */
export function useEligibility(): EligibilityState & { retry: () => void } {
  const auth = useDeskAuth();
  const [attempt, setAttempt] = useState(0);
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
  }, [auth.enabled, auth.authenticated, auth.walletAddress, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  return { ...state, retry };
}
