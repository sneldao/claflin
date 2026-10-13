'use client';

/**
 * The launched market — what a confirmed live launch opens onto. Reads the
 * public pool-status stream (curve progress, live price, premium to the
 * equity reference, the DAMM v2 pool once graduated) and lets any wallet
 * buy or sell on the curve, and the launcher collect accrued curve fees.
 *
 * Every action is a server-prepared transaction the wallet signs unchanged;
 * nothing here moves funds without that signature.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HalleyTxProposal } from '@/lib/meteora/live-contracts';
import type { HalleyPoolStatus } from '@/lib/meteora/pool-reader';
import { quoteMintForSymbol } from '@/lib/meteora/catalog';
import { base64ToBytes, bytesToBase64, type SolanaWalletPort } from '@/lib/solana/wallet';
import styles from './WorkingDesk.module.css';

const POLL_MS = 15_000;

function fmt(value: string | null | undefined, digits = 4): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n >= 100 ? n.toFixed(2) : n.toPrecision(digits);
}

function raw(value: string, decimals: number): string {
  const n = Number(value) / 10 ** decimals;
  return Number.isFinite(n) ? fmt(String(n)) : value;
}

/** Plain-language line for where the launch is in its life. */
export function marketPhaseLine(status: HalleyPoolStatus): string {
  if (status.phase === 'graduated') return 'Graduated — trading on the DAMM v2 pool.';
  if (status.phase === 'graduating') return 'The curve is full — migrating to DAMM v2.';
  return `Bonding — ${(status.curveProgress * 100).toFixed(1)}% of the way to graduation.`;
}

export function premiumLine(status: HalleyPoolStatus): string | null {
  const ref = status.reference;
  if (!ref || ref.premiumBps === null) return null;
  const bps = Number(ref.premiumBps);
  const side = bps >= 0 ? 'above' : 'below';
  return `${Math.abs(bps / 100).toFixed(2)}% ${side} the ${ref.symbol} reference (${ref.source === 'onchain' ? 'onchain venue mark' : 'Pyth'}) — a comparison, not an arbitrage.`;
}

export function HalleyLiveMarket({
  pool,
  anchorSymbol,
  quoteSymbol,
  wallet,
  account,
}: {
  pool: string;
  anchorSymbol: string | null;
  quoteSymbol: string;
  wallet: SolanaWalletPort | null;
  account: string | null;
}) {
  const [status, setStatus] = useState<HalleyPoolStatus | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lock = useRef(false);

  const refresh = useCallback(async () => {
    const qs = new URLSearchParams({ pool });
    if (anchorSymbol) qs.set('anchor', anchorSymbol);
    try {
      const res = await fetch(`/api/desk/halley/pool-status?${qs.toString()}`, { cache: 'no-store' });
      if (res.ok) setStatus(await res.json() as HalleyPoolStatus);
    } catch { /* the tape waits for the next tick */ }
  }, [pool, anchorSymbol]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const run = useCallback(async (prepareUrl: string, body: Record<string, unknown>) => {
    if (!wallet || !account || lock.current) {
      setNote('Connect a Solana wallet first.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setNote(null);
    try {
      const prep = await fetch(prepareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool, wallet: account, ...body }),
      });
      const proposal = await prep.json() as HalleyTxProposal & { message?: string };
      if (!prep.ok) {
        setNote(proposal.message ?? 'The desk could not prepare that.');
        return;
      }
      setNote(proposal.summary);
      let signed: Uint8Array;
      try {
        signed = await wallet.signTransaction(base64ToBytes(proposal.transactionBase64));
      } catch {
        setNote('Signature not given — nothing was sent.');
        return;
      }
      const sub = await fetch('/api/desk/halley/live/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          signedTransactionBase64: bytesToBase64(signed),
          idempotencyKey: crypto.randomUUID(),
          wallet: account,
        }),
      });
      const result = await sub.json() as { message?: string; solscanUrl?: string | null };
      setNote(`${result.message ?? 'Outcome unknown — reconcile before resending.'}${result.solscanUrl ? ` ${result.solscanUrl}` : ''}`);
      void refresh();
    } catch {
      setNote('Outcome unknown — check the wallet history before resending.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [wallet, account, pool, refresh]);

  const premium = status ? premiumLine(status) : null;
  const canTrade = status !== null && status.phase === 'bonding';
  const unclaimed = status?.unclaimedFees ? BigInt(status.unclaimedFees.launcher) : BigInt(0);
  const quoteDecimals = quoteMintForSymbol(quoteSymbol)?.decimals ?? 6;

  return (
    <div className={styles.instrumentRecord} role="group" aria-label="Launched market">
      <p className={styles.eyebrow}>THE MARKET · METEORA</p>
      {status === null ? (
        <p className={styles.instrumentRecordNote}>Reading the pool…</p>
      ) : (
        <>
          <p className={styles.instrumentRecordNote}>{marketPhaseLine(status)}</p>
          <ul className={styles.instrumentRecordRows}>
            <li><span>Price</span><code>{fmt(status.priceQuote)} {status.quoteSymbol ?? quoteSymbol}</code>{status.priceVenue && <span> · {status.priceVenue === 'dbc' ? 'curve' : 'DAMM v2'}</span>}</li>
            <li><span>Raised</span><code>{raw(status.quoteReserve, quoteDecimals)} / {raw(status.migrationQuoteThreshold, quoteDecimals)} {status.quoteSymbol ?? quoteSymbol}</code></li>
            <li><span>Fees</span><code>{status.config.feeSchedule}{status.config.dynamicFee ? ' + volatility' : ''} · after graduation {status.config.migratedPool.poolFeeBps / 100}%{status.config.migratedPool.collectFeeMode === 'compounding' ? ' compounding' : ''}</code></li>
            <li><span>Locked LP</span><code>{status.config.lockedLiquidityBps / 100}%</code></li>
            {status.damm && (
              <li><span>DAMM v2</span><a href={`https://solscan.io/account/${status.damm.pool}`} target="_blank" rel="noreferrer">pool ↗</a></li>
            )}
          </ul>
          {premium && <p className={styles.liveMeta}>{premium}</p>}
        </>
      )}
      {canTrade && (
        <form
          className={styles.slipActions}
          onSubmit={e => {
            e.preventDefault();
            void run('/api/desk/halley/live/swap', { side, amount: amount.trim() });
          }}
        >
          <label>
            <span className={styles.eyebrow}>{side === 'buy' ? `Spend (${quoteSymbol})` : 'Sell (tracker)'}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={side === 'buy' ? '10' : '1000'}
              aria-label={side === 'buy' ? `Amount of ${quoteSymbol} to spend` : 'Amount of tracker to sell'}
            />
          </label>
          <button type="button" className={styles.secondary} onClick={() => setSide(side === 'buy' ? 'sell' : 'buy')} disabled={busy}>
            {side === 'buy' ? 'Switch to sell' : 'Switch to buy'}
          </button>
          <button type="submit" className={styles.primary} disabled={busy || !amount.trim() || !account}>
            {busy ? 'Working…' : side === 'buy' ? 'Buy on the curve' : 'Sell on the curve'}
          </button>
        </form>
      )}
      {status && account && unclaimed > BigInt(0) && (
        <div className={styles.slipActions}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => { void run('/api/desk/halley/live/claim', {}); }}>
            Collect {raw(String(unclaimed), quoteDecimals)} {quoteSymbol} in curve fees
          </button>
        </div>
      )}
      {note && <p className={styles.notice} role="status">{note}</p>}
    </div>
  );
}
