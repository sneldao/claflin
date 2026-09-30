'use client';

import { useEffect } from 'react';
import type { LiveLedger, LiveOrderRecord } from '@/lib/solana/live-ledger';
import { useJesseHoldings } from '@/lib/solana/readiness';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { formatAmount } from '@/lib/trading/domain';
import styles from './WorkingDesk.module.css';

function amountOrDash(raw: string | null, decimals: number): string {
  if (raw === null) return '—';
  try {
    return formatAmount(BigInt(raw), decimals);
  } catch {
    return '—';
  }
}

function orderLine(r: LiveOrderRecord): string {
  const verb = r.side === 'buy' ? 'Buy' : 'Sell';
  const symbol = SOLANA_INSTRUMENTS.find(i => i.id === r.instrumentId)?.symbol ?? r.instrumentId;
  return `${verb} · ${symbol} · ${r.amount} ${r.unit}`;
}

const STATUS_WORD: Record<LiveOrderRecord['status'], string> = {
  submitted: 'Sent',
  confirmed: 'Confirmed',
  failed: 'Failed',
  unknown: 'Outcome unknown',
};

/**
 * The wallet's live trail and its balances — durable across reloads because
 * the record was written when the signature existed, and honest about age:
 * "checked" times are shown, unresolved orders get an explicit chain check
 * instead of a rebroadcast.
 */
export function JesseLiveLedger({ account, ledger }: { account: string; ledger: LiveLedger }) {
  const holdings = useJesseHoldings(account);
  const pending = ledger.records.filter(r => r.status === 'submitted' || r.status === 'unknown');
  const pendingKey = pending.filter(r => r.signature).map(r => r.proposalId).join(',');

  useEffect(() => {
    if (pendingKey === '') return;
    // Reconciling on mount is the point of the durable record — the
    // pending set re-arms only when its membership changes.
    void ledger.reconcile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, ledger.reconcile]);

  if (ledger.records.length === 0 && holdings.status !== 'ok') {
    return holdings.status === 'loading'
      ? <p className={styles.liveMeta}>Reading this wallet’s balances…</p>
      : null;
  }

  return (
    <div className={styles.liveWalletBlock}>
      <p className={styles.eyebrow}>THIS WALLET · OBSERVED ON-CHAIN</p>
      <p className={styles.liveMeta} data-state={holdings.status === 'unavailable' ? 'unknown' : undefined}>
        {holdings.status === 'unavailable' && 'Balances unreadable right now — the venue still verifies at preparation.'}
        {holdings.status === 'loading' && 'Reading balances…'}
        {holdings.status === 'ok' && (
          <>
            {holdings.usdc ? `${formatAmount(BigInt(holdings.usdc.raw), holdings.usdc.decimals)} USDC` : 'USDC —'}
            {' · '}
            {holdings.solLamports !== null ? `${amountOrDash(holdings.solLamports, 9)} SOL` : 'SOL —'}
            {holdings.holdings?.map(h => ` · ${h.raw !== null && h.raw !== '0' ? amountOrDash(h.raw, h.decimals) : h.raw === '0' ? '0' : '—'} ${h.symbol}`).join('')}
            {holdings.fetchedAt && ` — checked ${new Date(holdings.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </>
        )}
        {' '}
        {holdings.status === 'ok' && (
          <button type="button" className={styles.secondary} onClick={holdings.refresh}>Refresh</button>
        )}
      </p>
      {ledger.records.length > 0 && (
        <ul className={styles.liveOrders} aria-label="Live orders on this wallet">
          {ledger.records.map(r => (
            <li key={r.proposalId} data-status={r.status}>
              <span className={styles.liveOrderStatus}>{STATUS_WORD[r.status]}</span>
              <span>{orderLine(r)}</span>
              {r.signature && (
                <a href={`https://solscan.io/tx/${r.signature}`} target="_blank" rel="noreferrer">Solscan</a>
              )}
              {r.lastCheckedAt && (
                <span className={styles.liveOrderChecked}>
                  checked {new Date(r.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className={styles.liveMeta}>
          {ledger.reconciling ? 'Checking the chain… ' : ''}
          Unresolved outcomes are checked, never rebroadcast.
          {!ledger.reconciling && (
            <button type="button" className={styles.secondary} onClick={() => { void ledger.reconcile(); }}>
              Check again
            </button>
          )}
        </p>
      )}
    </div>
  );
}
