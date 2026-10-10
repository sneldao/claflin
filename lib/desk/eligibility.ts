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

const ATTEST_KEY = 'claflin.eligibility.v1';

function keyFor(scopeId: string): string {
  return `${ATTEST_KEY}.${scopeId}`;
}

export interface EligibilityAttestation {
  market: string;
  attestedAt: number;
}

/**
 * A named thing a visitor confirms eligibility under — a market profile id
 * for the Solana desk, a mandate id for desks whose issuer terms differ.
 * One scope's confirmation never stands in for another's.
 */
export interface EligibilityScope {
  id: string;
  issuerTermsUrl: string;
}

/** The Coinbase/B20 scope for Hetty's desk — a different issuer, a different key. */
export const COINBASE_STOCKS_SCOPE: EligibilityScope = {
  id: 'coinbase-tokenized-stocks',
  /* The Base tokenized-stocks guide carries the restriction language the
     issuer publishes; there is no separate issuer terms page to cite. */
  issuerTermsUrl: 'https://docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base',
};

/** Halley's Meteora launch scope — the launcher is the token's creator. */
export const METEORA_LAUNCH_SCOPE: EligibilityScope = {
  id: 'meteora-launch',
  issuerTermsUrl: 'https://docs.meteora.ag/',
};

export function loadAttestation(storage: Pick<Storage, 'getItem'> | null, marketId: string): EligibilityAttestation | null {
  if (!storage) return null;
  try {
    /* Scoped key first; the legacy unscoped key still reads if its record
       names this scope — a confirm written before scoping stays honoured. */
    for (const key of [keyFor(marketId), ATTEST_KEY]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EligibilityAttestation;
      if (parsed.market === marketId && typeof parsed.attestedAt === 'number') return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAttestation(storage: Pick<Storage, 'setItem'> | null, marketId: string, now: number): EligibilityAttestation | null {
  const record: EligibilityAttestation = { market: marketId, attestedAt: now };
  try {
    storage?.setItem(keyFor(marketId), JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

/** Honest gate copy — names the issuer and the exclusions, not a legal opinion. */
export function attestationCopy(scope: { id: string }): string {
  if (scope.id === COINBASE_STOCKS_SCOPE.id) {
    return `Coinbase tokenized stocks are B20 tokens issued by Coinbase on Base — offered to eligible persons in permitted jurisdictions only, and not to US persons. Confirm you are eligible under the issuer's terms before real funds move.`;
  }
  if (scope.id === METEORA_LAUNCH_SCOPE.id) {
    return `A live launch creates a new tracker token from your own wallet — your wallet is the token's creator, and the token is not stock ownership. Any xStock used as the quote asset carries Backed's issuer terms (not offered to US persons or UK retail clients). Confirm you may create and launch this token where you are before a real launch is signed.`;
  }
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
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith(ATTEST_KEY)) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners = listeners.filter(l => l !== listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Attestation state for the given scope. `attested` means the client
 * confirmed once on this browser; `confirm()` writes the record and returns
 * false if storage refused.
 */
export function useEligibilityAttestation(scope: { id: string }): { attested: boolean; attestedAt: number | null; confirm: () => boolean } {
  const storage = storageAvailable();
  const raw = useSyncExternalStore(
    subscribe,
    () => storage?.getItem(keyFor(scope.id)) ?? storage?.getItem(ATTEST_KEY) ?? null,
    () => null,
  );
  let record: EligibilityAttestation | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as EligibilityAttestation) : null;
    record = parsed && parsed.market === scope.id && typeof parsed.attestedAt === 'number' ? parsed : null;
  } catch {
    record = null;
  }
  const confirm = useCallback(() => {
    const saved = saveAttestation(storageAvailable(), scope.id, Date.now());
    if (saved) emit();
    return saved !== null;
  }, [scope.id]);
  return { attested: record !== null, attestedAt: record?.attestedAt ?? null, confirm };
}
