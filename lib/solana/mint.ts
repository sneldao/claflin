/**
 * Server-side Solana mint reader — the Token-2022 Scaled UI Amount state a
 * quote must convert with. Never import this from a client module: it speaks
 * RPC and reads deployment configuration.
 *
 * The multiplier is read live, never cached (catalog.ts explains why: it is
 * fee-accreting and can activate a queued value mid-review). Effective-at
 * semantics follow the mint's own schedule: once
 * `newMultiplierEffectiveTimestamp` has passed, `newMultiplier` IS the
 * multiplier even though the account still carries both raw fields; a future
 * timestamp is a pending corporate action that shortens quote freshness.
 */

import { TradingError } from '../trading/domain';
import { parseMultiplier } from './amounts';

export interface ScaledMintObservation {
  decimals: number;
  /** The multiplier effective at observedAt, as a decimal string. */
  multiplier: string;
  /** The slot the RPC node reported for this read. */
  observedSlot: number;
  /** Read instant, ms since epoch. */
  observedAt: number;
  /** Pending activation instant (ms) when a queued multiplier lands in the
   *  future — a quote must not outlive it. Null when nothing is queued. */
  nextEffectiveAt: number | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface RpcMintEnvelope {
  result?: {
    context?: { slot?: unknown };
    value?: {
      data?: {
        program?: unknown;
        parsed?: {
          info?: {
            decimals?: unknown;
            extensions?: unknown;
          };
        };
      } | null;
    } | null;
  } | null;
}

function extensionState(info: { extensions?: unknown }, name: string): Record<string, unknown> | null {
  if (!Array.isArray(info.extensions)) return null;
  for (const entry of info.extensions) {
    const candidate = entry as { extension?: unknown; state?: unknown };
    if (candidate.extension === name && typeof candidate.state === 'object' && candidate.state !== null) {
      return candidate.state as Record<string, unknown>;
    }
  }
  return null;
}

function validMultiplier(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    parseMultiplier(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strict parser for a jsonParsed getAccountInfo mint read. Anything
 * structurally unexpected fails closed with quote_unavailable — a mint the
 * desk cannot interpret is a mint the desk does not quote. Exported for
 * tests; the reader below is the production path.
 */
export function parseScaledMintAccount(body: unknown, now: number): ScaledMintObservation {
  const envelope = body as RpcMintEnvelope;
  const slot = envelope?.result?.context?.slot;
  const value = envelope?.result?.value;
  if (!value || typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot <= 0) {
    throw new TradingError('quote_unavailable', 'The Solana network did not return readable mint data. Please retry.', 503);
  }
  const data = value.data;
  const info = data?.parsed?.info;
  if (!info || data?.program !== 'spl-token-2022') {
    throw new TradingError('quote_unavailable', 'That mint is not a Token-2022 scaled instrument.', 503);
  }
  const decimals = info.decimals;
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new TradingError('quote_unavailable', 'The mint returned unreadable units.', 503);
  }
  const accountState = extensionState(info, 'defaultAccountState');
  if (accountState?.accountState === 'frozen') {
    throw new TradingError('quote_unavailable', 'This instrument is frozen by its issuer — no estimate is available.', 503);
  }
  const pausable = extensionState(info, 'pausableConfig');
  if (pausable?.paused === true) {
    throw new TradingError('quote_unavailable', 'This instrument is paused by its issuer — no estimate is available.', 503);
  }
  const scaled = extensionState(info, 'scaledUiAmountConfig');
  if (!scaled || !validMultiplier(scaled.multiplier)) {
    throw new TradingError('quote_unavailable', 'The mint has no readable scaled-unit multiplier.', 503);
  }
  const multiplier = scaled.multiplier;
  const queued = typeof scaled.newMultiplier === 'string' && validMultiplier(scaled.newMultiplier) ? scaled.newMultiplier : null;
  const effectiveAtSeconds = typeof scaled.newMultiplierEffectiveTimestamp === 'number' && Number.isSafeInteger(scaled.newMultiplierEffectiveTimestamp)
    ? scaled.newMultiplierEffectiveTimestamp
    : 0;
  const effectiveAtMs = effectiveAtSeconds > 0 ? effectiveAtSeconds * 1000 : null;
  if (queued && effectiveAtMs !== null) {
    if (effectiveAtMs <= now) {
      /* The queued value is already the effective one — the account keeps
         both raw fields, but the program's schedule governs. */
      return { decimals, multiplier: queued, observedSlot: slot, observedAt: now, nextEffectiveAt: null };
    }
    return { decimals, multiplier, observedSlot: slot, observedAt: now, nextEffectiveAt: effectiveAtMs };
  }
  return { decimals, multiplier, observedSlot: slot, observedAt: now, nextEffectiveAt: null };
}

/** Production reader: one jsonParsed getAccountInfo against the configured
 *  RPC endpoint. Network and shape failures are honest 503s, never a
 *  defaulted multiplier. */
export function createMintReader({
  rpcUrl,
  fetchImpl = fetch,
  now = Date.now,
}: {
  rpcUrl: string;
  fetchImpl?: FetchLike;
  now?: () => number;
}): (mint: string) => Promise<ScaledMintObservation> {
  return async (mint: string): Promise<ScaledMintObservation> => {
    let res: Response;
    try {
      res = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [mint, { encoding: 'jsonParsed' }],
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new TradingError('quote_unavailable', 'The Solana network could not be reached. Please retry.', 503);
    }
    if (!res.ok) {
      throw new TradingError('quote_unavailable', 'The Solana network could not be reached. Please retry.', 503);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TradingError('quote_unavailable', 'The Solana network returned an unreadable response. Please retry.', 503);
    }
    return parseScaledMintAccount(body, now());
  };
}
