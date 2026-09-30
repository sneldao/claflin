'use client';

/**
 * Client readiness — the wallet funding check behind the live box. Advisory:
 * a missing or unread balance never blocks, it informs. Venue preparation is
 * still the authority on whether an order can actually be filled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api-client';
import { SOLANA_INSTRUMENTS } from './catalog';
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

export interface JesseHolding {
  mint: string;
  symbol: string;
  decimals: number;
  /** null = unreadable; '0' with accountExists false = a real zero. */
  raw: string | null;
  accountExists: boolean | null;
}

export interface JesseHoldings {
  status: 'idle' | 'loading' | 'ok' | 'unavailable';
  usdc: TokenSum | null;
  solLamports: string | null;
  holdings: JesseHolding[] | null;
  fetchedAt: number | null;
  refresh: () => void;
}

const HOLDINGS_IDLE = { status: 'idle' as const, usdc: null, solLamports: null, holdings: null, fetchedAt: null };

/** Every catalog xStock balance for the connected wallet — the holdings surface. */
export function useJesseHoldings(wallet: string | null): JesseHoldings {
  const [stored, setStored] = useState<Omit<JesseHoldings, 'refresh'>>(HOLDINGS_IDLE);
  const [loadedWallet, setLoadedWallet] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async () => {
    const my = ++gen.current;
    const params = new URLSearchParams({ wallet: wallet ?? '' });
    for (const i of SOLANA_INSTRUMENTS) params.append('mint', i.mint);
    const res = await fetchJson<{
      solLamports?: unknown;
      usdc?: unknown;
      ok?: unknown;
      holdings?: unknown;
    }>(`/api/desk/jesse/readiness?${params.toString()}`);
    if (gen.current !== my) return;
    setLoadedWallet(wallet);
    if (!res.ok || res.data.ok !== true) {
      setStored({ ...HOLDINGS_IDLE, status: 'unavailable' });
      return;
    }
    const rows = Array.isArray(res.data.holdings) ? res.data.holdings : [];
    const holdings = rows.map(row => {
      const r = row as { mint?: unknown; symbol?: unknown; decimals?: unknown; sum?: unknown };
      const sum = isTokenSum(r.sum) ? r.sum : null;
      return {
        mint: typeof r.mint === 'string' ? r.mint : '',
        symbol: typeof r.symbol === 'string' ? r.symbol : '',
        decimals: typeof r.decimals === 'number' ? r.decimals : 8,
        raw: sum?.raw ?? null,
        accountExists: sum?.accountExists ?? null,
      };
    }).filter(h => h.mint !== '');
    setStored({
      status: 'ok',
      usdc: isTokenSum(res.data.usdc) ? res.data.usdc : null,
      solLamports: typeof res.data.solLamports === 'string' ? res.data.solLamports : null,
      holdings,
      fetchedAt: Date.now(),
    });
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;
    // Every setState inside load runs after the fetch awaits, never
    // synchronously in this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [wallet, load]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const shown: Omit<JesseHoldings, 'refresh'> = !wallet
    ? HOLDINGS_IDLE
    : loadedWallet !== wallet
      ? { ...HOLDINGS_IDLE, status: 'loading' }
      : stored;
  return { ...shown, refresh };
}
