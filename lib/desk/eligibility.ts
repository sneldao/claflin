'use client';

/**
 * Issuer-terms attestation for the Solana desk. Backed xStocks carry their
 * own eligibility rules — not offered to US persons, not available to UK
 * retail clients, excluded in sanctioned jurisdictions — and unlike Hetty's
 * desk there is no onchain attestation to read. The client attests once per
 * market; the record is honest about what it is: a self-declaration, stored
 * in this browser, never a legal determination.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { MarketProfile } from './market';

const ATTEST_KEY = 'claflin.eligibility.v1';

export interface EligibilityAttestation {
  market: string;
  attestedAt: number;
}

export function loadAttestation(storage: Pick<Storage, 'getItem'> | null, marketId: string): EligibilityAttestation | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ATTEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EligibilityAttestation;
    return parsed.market === marketId && typeof parsed.attestedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAttestation(storage: Pick<Storage, 'setItem'> | null, marketId: string, now: number): EligibilityAttestation | null {
  const record: EligibilityAttestation = { market: marketId, attestedAt: now };
  try {
    storage?.setItem(ATTEST_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

/** Honest gate copy — names the issuer and the exclusions, not a legal opinion. */
export function attestationCopy(market: MarketProfile): string {
  return `xStocks are tracker certificates issued by Backed Assets. They are not offered to US persons, not available to UK retail clients, and are excluded in sanctioned jurisdictions. Confirm you are eligible under the issuer's terms before real funds move.`;
}

function storageAvailable(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

let listeners: Array<() => void> = [];
function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.push(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === ATTEST_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners = listeners.filter(l => l !== listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Attestation state for the active market. `attested` means the client
 * confirmed once on this browser; `confirm()` writes the record and returns
 * false if storage refused.
 */
export function useEligibilityAttestation(market: MarketProfile): { attested: boolean; attestedAt: number | null; confirm: () => boolean } {
  const storage = storageAvailable();
  const raw = useSyncExternalStore(
    subscribe,
    () => storage?.getItem(ATTEST_KEY) ?? null,
    () => null,
  );
  let record: EligibilityAttestation | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as EligibilityAttestation) : null;
    record = parsed && parsed.market === market.id && typeof parsed.attestedAt === 'number' ? parsed : null;
  } catch {
    record = null;
  }
  const confirm = useCallback(() => {
    const saved = saveAttestation(storageAvailable(), market.id, Date.now());
    if (saved) emit();
    return saved !== null;
  }, [market.id]);
  return { attested: record !== null, attestedAt: record?.attestedAt ?? null, confirm };
}
