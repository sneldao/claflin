'use client';

import { useMemo, useState } from 'react';
import { CLAFLIN_MARKET } from '@/lib/desk/market';
import { attestationCopy } from '@/lib/desk/eligibility';
import { useJesseReadiness } from '@/lib/solana/readiness';
import { hasInjectedSolanaProvider } from '@/lib/solana/wallet';
import { getSolanaInstrument } from '@/lib/solana/catalog';
import { formatAmount } from '@/lib/trading/domain';
import styles from './WorkingDesk.module.css';
import type { JesseIntent } from '@/lib/solana/contracts';

function shortAddress(account: string): string {
  return `${account.slice(0, 4)}…${account.slice(-4)}`;
}

function solBalance(lamports: string | null): string | null {
  if (lamports === null) return null;
  try {
    return formatAmount(BigInt(lamports), 9);
  } catch {
    return null;
  }
}

/**
 * The pre-trade checklist inside the live box — eligibility under the
 * issuer's terms, a wallet that can sign, and the funds the instruction
 * actually needs. Advisory: a missing or unread balance informs; venue
 * preparation stays the authority.
 */
export function JesseReadiness({
  account,
  intent,
  attested,
  onAttest,
}: {
  account: string | null;
  intent: JesseIntent | null;
  attested: boolean;
  onAttest: () => boolean;
}) {
  const market = CLAFLIN_MARKET;
  const selling = intent?.side === 'sell';
  const instrument = useMemo(() => {
    if (!intent?.instrumentId) return null;
    try {
      return getSolanaInstrument(intent.instrumentId);
    } catch {
      return null;
    }
  }, [intent?.instrumentId]);

  const [coarse] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
  );
  const [injected] = useState(() => hasInjectedSolanaProvider());
  const [currentUrl] = useState(() => (typeof window !== 'undefined' ? window.location.href : ''));

  const readiness = useJesseReadiness(account, selling ? instrument?.mint ?? null : null);
  const sol = solBalance(readiness.solLamports);
  const usdc = readiness.usdc;
  const token = readiness.token;
  const solShort = sol !== null && parseFloat(sol) < 0.002;
  const tokenMissing = token !== null && token.raw === '0';

  return (
    <ol className={styles.readiness} aria-label="What this order needs">
      <li data-state={attested ? 'ok' : 'needed'}>
        <span>Eligible under the issuer’s terms</span>
        {!attested && (
          <span className={styles.readinessDetail}>
            {attestationCopy(market)}{' '}
            <a href={market.issuerTermsUrl} target="_blank" rel="noreferrer">Issuer terms</a>
            <button type="button" className={styles.secondary} onClick={onAttest}>
              I confirm I’m eligible
            </button>
          </span>
        )}
      </li>
      <li data-state={account ? 'ok' : 'needed'}>
        <span>{account ? `Wallet connected · ${shortAddress(account)}` : 'A Solana wallet'}</span>
        {!account && !injected && (
          <span className={styles.readinessDetail}>
            {coarse && currentUrl
              ? 'Open Claflin inside a wallet app — it connects itself:'
              : 'Install Phantom or Solflare, then connect.'}
            {coarse && currentUrl && market.wallets.map(w => (
              <a key={w.name} href={w.url(currentUrl)}>{`Open in ${w.name}`}</a>
            ))}
          </span>
        )}
      </li>
      {account && (
        <li data-state={readiness.status === 'unavailable' ? 'unknown' : 'needed'}>
          <span>{selling ? 'The xStock and SOL for fees' : 'USDC and SOL for fees'}</span>
          <span className={styles.readinessDetail}>
            {readiness.status === 'loading' && 'Reading balances…'}
            {readiness.status === 'unavailable' && 'Balance check unavailable — the venue still verifies at preparation.'}
            {readiness.status === 'ok' && (
              <>
                {selling
                  ? token === null
                    ? `${instrument?.symbol ?? 'xStock'} balance unreadable`
                    : tokenMissing
                      ? `No ${instrument?.symbol ?? 'xStock'} balance in this wallet`
                      : `${instrument?.symbol ?? 'xStock'} account found`
                  : usdc === null
                    ? 'USDC balance unreadable'
                    : `${formatAmount(BigInt(usdc.raw), usdc.decimals)} USDC`}
                {' · '}
                {sol === null ? 'SOL balance unreadable' : `${sol} SOL`}
                {solShort && ` — top up about ${market.solFeeHint} for fees`}
              </>
            )}
            <span className={styles.readinessFund}>
              {!selling && market.ramps.map(r => (
                <a key={`usdc-${r.name}`} href={r.urlFor('USDC', account)} target="_blank" rel="noreferrer">
                  {`Get USDC · ${r.name}`}
                </a>
              ))}
              {solShort && market.ramps[0] && (
                <a href={market.ramps[0].urlFor('SOL', account)} target="_blank" rel="noreferrer">
                  {`Get SOL · ${market.ramps[0].name}`}
                </a>
              )}
              {readiness.status === 'ok' && (
                <button type="button" className={styles.secondary} onClick={readiness.refresh}>
                  Refresh
                </button>
              )}
            </span>
          </span>
        </li>
      )}
    </ol>
  );
}
