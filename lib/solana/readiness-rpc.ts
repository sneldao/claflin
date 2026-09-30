/**
 * Server-side wallet readiness — one batched JSON-RPC read answering
 * "can this wallet actually fund the instruction?" Advisory only: venue
 * preparation remains the authority; honest nulls mean "we could not read
 * it", never a guessed balance.
 *
 * Never import this from a client module: it speaks RPC and reads
 * deployment configuration.
 */

import { SOLANA_USDC_DECIMALS, SOLANA_USDC_MINT } from './catalog';

export interface TokenSum {
  raw: string;
  decimals: number;
  /** false means no token account exists — a real zero, not an unread. */
  accountExists: boolean;
}

export interface WalletReadiness {
  /** null = unreadable, not zero. */
  solLamports: string | null;
  usdc: TokenSum | null;
  /** One sum per requested mint, order preserved; null = unreadable. */
  holdings: (TokenSum | null)[];
  /** false when the RPC endpoint could not be reached at all. */
  ok: boolean;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface RpcEnvelope {
  result?: unknown;
  error?: unknown;
}

/** getBalance → lamports as a decimal string; null on any shape surprise. */
export function parseBalanceResult(body: unknown): string | null {
  const value = (body as RpcEnvelope)?.result;
  const lamports = (value as { value?: unknown } | null)?.value;
  if (typeof lamports !== 'number' || !Number.isSafeInteger(lamports) || lamports < 0) return null;
  return String(lamports);
}

/**
 * getTokenAccountsByOwner (jsonParsed) → summed token amount. Missing or
 * empty value means no token account — a real zero. Mixed decimals across
 * accounts is structurally impossible for one mint; refuse rather than sum.
 */
export function parseTokenAccountsResult(body: unknown, fallbackDecimals: number): TokenSum | null {
  const result = (body as RpcEnvelope)?.result;
  if (!result || typeof result !== 'object') return null;
  const value = (result as { value?: unknown }).value;
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return { raw: '0', decimals: fallbackDecimals, accountExists: false };
  let decimals: number | null = null;
  let total = 0n;
  for (const entry of value) {
    const tokenAmount = (entry as {
      account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: unknown; decimals?: unknown } } } } };
    })?.account?.data?.parsed?.info?.tokenAmount;
    if (typeof tokenAmount?.amount !== 'string' || !/^\d+$/.test(tokenAmount.amount)) return null;
    if (typeof tokenAmount.decimals !== 'number' || !Number.isInteger(tokenAmount.decimals)) return null;
    if (decimals === null) decimals = tokenAmount.decimals;
    else if (decimals !== tokenAmount.decimals) return null;
    total += BigInt(tokenAmount.amount);
  }
  return { raw: total.toString(), decimals: decimals ?? fallbackDecimals, accountExists: true };
}

/**
 * One batched call: lamports + USDC token accounts (+ an optional instrument
 * mint for sell-side readiness). Transport failure is ok:false with nulls —
 * readiness degrades honestly instead of blocking the desk.
 */
export async function readWalletReadiness({
  rpcUrl,
  wallet,
  mints = [],
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: {
  rpcUrl: string;
  wallet: string;
  /** Catalog mints to read alongside USDC — order preserved. */
  mints?: { mint: string; decimals: number }[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<WalletReadiness> {
  const batch: unknown[] = [
    { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [wallet] },
    { jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner', params: [wallet, { mint: SOLANA_USDC_MINT }, { encoding: 'jsonParsed' }] },
  ];
  mints.forEach((m, i) => {
    batch.push({ jsonrpc: '2.0', id: 3 + i, method: 'getTokenAccountsByOwner', params: [wallet, { mint: m.mint }, { encoding: 'jsonParsed' }] });
  });
  let body: unknown;
  try {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { solLamports: null, usdc: null, holdings: [], ok: false };
    body = await res.json();
  } catch {
    return { solLamports: null, usdc: null, holdings: [], ok: false };
  }
  const envelopes = Array.isArray(body) ? body : [body];
  const byId = (id: number) => envelopes.find(e => (e as { id?: unknown })?.id === id) ?? null;
  return {
    solLamports: parseBalanceResult(byId(1)),
    usdc: parseTokenAccountsResult(byId(2), SOLANA_USDC_DECIMALS),
    holdings: mints.map((m, i) => parseTokenAccountsResult(byId(3 + i), m.decimals)),
    ok: true,
  };
}
