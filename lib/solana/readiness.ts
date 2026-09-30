'use client';

/**
 * Client readiness — the wallet funding check behind the live box. Advisory:
 * a missing or unread balance never blocks, it informs. Venue preparation is
 * still the authority on whether an order can actually be filled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api-client';
import type { TokenSum } from './readiness-rpc';

export interface JesseReadiness {
  status: 'idle' | 'loading' | 'ok' | 'unavailable';
  solLamports: string | null;
  usdc: TokenSum | null;
  token: TokenSum | null;
  refresh: () => void;
}

const IDLE = { status: 'idle' as const, solLamports: null, usdc: null, token: null };

export function useJesseReadiness(wallet: string | null, mint: string | null): JesseReadiness {
  const [stored, setStored] = useState<Omit<JesseReadiness, 'refresh' | 'status'> & { status: JesseReadiness['status'] }>(IDLE);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const gen = useRef(0);
  const key = wallet ? `${wallet}|${mint ?? ''}` : null;

  const load = useCallback(async () => {
    const my = ++gen.current;
    const params = new URLSearchParams({ wallet: wallet ?? '' });
    if (mint) params.set('mint', mint);
    const res = await fetchJson<{
      solLamports?: unknown;
      usdc?: unknown;
      token?: unknown;
      ok?: unknown;
    }>(`/api/desk/jesse/readiness?${params.toString()}`);
    if (gen.current !== my) return;
    setLoadedKey(key);
    if (!res.ok || res.data.ok !== true) {
      setStored({ status: 'unavailable', solLamports: null, usdc: null, token: null });
      return;
    }
    setStored({
      status: 'ok',
      solLamports: typeof res.data.solLamports === 'string' ? res.data.solLamports : null,
      usdc: isTokenSum(res.data.usdc) ? res.data.usdc : null,
      token: isTokenSum(res.data.token) ? res.data.token : null,
    });
  }, [wallet, mint, key]);

  useEffect(() => {
    if (!key) return;
    // Every setState inside load runs after the fetch awaits, never
    // synchronously in this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [key, load]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const shown: Omit<JesseReadiness, 'refresh'> = !key
    ? IDLE
    : loadedKey !== key
      ? { ...IDLE, status: 'loading' }
      : stored;
  return { ...shown, refresh };
}

function isTokenSum(value: unknown): value is TokenSum {
  const v = value as TokenSum | null;
  return Boolean(v) && typeof v!.raw === 'string' && /^\d+$/.test(v!.raw)
    && typeof v!.decimals === 'number' && typeof v!.accountExists === 'boolean';
}
