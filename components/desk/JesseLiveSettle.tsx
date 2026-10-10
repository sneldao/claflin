'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JesseIntent, SolanaLiveProposal } from '@/lib/solana/contracts';
import {
  base64ToBytes,
  bytesToBase64,
  createBrowserSolanaWallet,
  type SolanaWalletPort,
} from '@/lib/solana/wallet';
import { useEligibilityAttestation } from '@/lib/desk/eligibility';
import { CLAFLIN_MARKET } from '@/lib/desk/market';
import { useLiveLedger } from '@/lib/solana/live-ledger';
import { signatureFromSignedTransaction } from '@/lib/solana/signature';
import { JesseLiveLedger } from './JesseLiveLedger';
import { JesseReadiness } from './JesseReadiness';
import { SolanaProposalCosts } from './QuoteReview';
import styles from './WorkingDesk.module.css';

type LivePhase =
  | 'idle'
  | 'connecting'
  | 'preparing'
  | 'review'
  | 'signing'
  | 'submitting'
  | 'confirmed'
  | 'failed'
  | 'unknown';

/**
 * Live settle — Jupiter order(taker) → wallet sign → execute.
 * Mounted when the desk is in live mode and the server reports live enabled.
 * Paper filing stays a separate action on the ticket.
 */
export function JesseLiveSettle({
  intent,
  revision,
}: {
  intent: JesseIntent | null;
  revision: number;
}) {
  const wallet = useMemo<SolanaWalletPort | null>(
    () => (typeof window !== 'undefined' ? createBrowserSolanaWallet() : null),
    [],
  );
  const [account, setAccount] = useState<string | null>(null);
  const eligibility = useEligibilityAttestation(CLAFLIN_MARKET);
  const ledger = useLiveLedger(account);
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [proposal, setProposal] = useState<SolanaLiveProposal | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [solscanUrl, setSolscanUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    return wallet.subscribe(() => {
      setAccount(wallet.getAccount()?.address ?? null);
    });
  }, [wallet]);

  const connect = useCallback(async () => {
    if (!wallet) return;
    setPhase('connecting');
    setNote(null);
    try {
      await wallet.connect();
      setAccount(wallet.getAccount()?.address ?? null);
      setPhase('idle');
    } catch (err) {
      setPhase('idle');
      setNote(err instanceof Error ? err.message : 'Wallet connect failed.');
    }
  }, [wallet]);

  const prepare = useCallback(async () => {
    if (!wallet || !intent) return;
    const address = wallet.getAccount()?.address;
    if (!address) {
      setNote('Connect a Solana wallet first.');
      return;
    }
    setPhase('preparing');
    setNote(null);
    setSolscanUrl(null);
    try {
      const res = await fetch('/api/desk/jesse/live/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, wallet: address, revision }),
      });
      const body = await res.json() as SolanaLiveProposal & { message?: string; error?: string };
      if (!res.ok) {
        setPhase('failed');
        setNote(body.message ?? 'Live prepare failed.');
        return;
      }
      setProposal(body);
      setPhase('review');
    } catch {
      setPhase('failed');
      setNote('Live prepare unavailable.');
    }
  }, [wallet, intent, revision]);

  const signAndSubmit = useCallback(async () => {
    if (!wallet || !proposal) return;
    const address = wallet.getAccount()?.address;
    if (!address) {
      setNote('Connect a Solana wallet first.');
      return;
    }
    setPhase('signing');
    setNote(null);
    try {
      const unsigned = base64ToBytes(proposal.transactionBase64);
      const signed = await wallet.signTransaction(unsigned);
      /* The durable record exists the moment the signature does — before
         execute, so a dead tab never loses the on-chain pointer. */
      ledger.record({
        proposalId: proposal.id,
        wallet: address,
        signature: signatureFromSignedTransaction(signed),
        instrumentId: proposal.intent.instrumentId,
        side: proposal.intent.side,
        amount: proposal.intent.amount,
        unit: proposal.intent.unit,
        submittedAt: Date.now(),
        status: 'submitted',
        lastCheckedAt: null,
      });
      setPhase('submitting');
      const res = await fetch('/api/desk/jesse/live/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          signedTransactionBase64: bytesToBase64(signed),
          idempotencyKey: crypto.randomUUID(),
          wallet: address,
        }),
      });
      const body = await res.json() as {
        status?: string;
        message?: string;
        solscanUrl?: string | null;
        signature?: string | null;
      };
      if (!res.ok) {
        const status = body.status === 'unknown' ? 'unknown' : 'failed';
        setPhase(status);
        ledger.update(proposal.id, {
          status,
          ...(body.signature ? { signature: body.signature } : {}),
          lastCheckedAt: Date.now(),
        });
        setNote(body.message ?? 'Live submit failed.');
        return;
      }
      if (body.status === 'confirmed') {
        setPhase('confirmed');
        ledger.update(proposal.id, {
          status: 'confirmed',
          signature: body.signature ?? null,
          lastCheckedAt: Date.now(),
        });
        setSolscanUrl(body.solscanUrl ?? (body.signature ? `https://solscan.io/tx/${body.signature}` : null));
        setNote(body.message ?? 'Live settle confirmed.');
        return;
      }
      if (body.status === 'unknown') {
        setPhase('unknown');
        ledger.update(proposal.id, { status: 'unknown', lastCheckedAt: Date.now() });
        setNote(body.message ?? 'Outcome unknown — do not resign a different order.');
        setSolscanUrl(body.solscanUrl ?? null);
        return;
      }
      setPhase('failed');
      ledger.update(proposal.id, {
        status: 'failed',
        signature: body.signature ?? null,
        lastCheckedAt: Date.now(),
      });
      setNote(body.message ?? 'Live settle failed.');
      setSolscanUrl(body.solscanUrl ?? null);
    } catch (err) {
      setPhase('failed');
      /* A record that exists here was already signed — the execute may or
         may not have landed, so unknown is the honest state. */
      ledger.update(proposal.id, { status: 'unknown', lastCheckedAt: Date.now() });
      setNote(err instanceof Error ? err.message : 'Signing or submit failed.');
    }
  }, [wallet, proposal, ledger]);

  return (
    <section className={styles.liveBox} data-source="jesse-live" aria-labelledby="jesse-live-title">
      <p className={styles.eyebrow}>LIVE · JUPITER · SOLANA</p>
      <h2 id="jesse-live-title">Settle on Solana.</h2>
      <p className={styles.liveMeta}>
        Fresh Metis order with your wallet as taker — you sign, Jupiter executes.
        Needs USDC (buys) or the xStock (sells) plus SOL for fees. Per-order cap: 250 USDC / 10 scaled.
        Paper filing stays available below.
      </p>
      <JesseReadiness
        account={account}
        intent={intent}
        attested={eligibility.attested}
        onAttest={eligibility.confirm}
      />
      <div className={styles.slipActions}>
        {!account ? (
          <button type="button" className={styles.primary} disabled={phase === 'connecting'} onClick={() => { void connect(); }}>
            {phase === 'connecting' ? 'Connecting…' : 'Connect Solana wallet'}
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => { void wallet?.disconnect(); }}>
            Disconnect {account.slice(0, 4)}…{account.slice(-4)}
          </button>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={!account || !intent || !eligibility.attested || phase === 'preparing' || phase === 'signing' || phase === 'submitting'}
          onClick={() => { void prepare(); }}
        >
          {phase === 'preparing' ? 'Preparing…' : 'Prepare live order'}
        </button>
        {proposal && phase === 'review' && (
          <button type="button" className={styles.primary} onClick={() => { void signAndSubmit(); }}>
            Sign &amp; execute
          </button>
        )}
      </div>
      {proposal && (phase === 'review' || phase === 'signing' || phase === 'submitting') && (
        <p className={styles.liveMeta} role="status">
          Spend {proposal.reviewedEstimate.inputAmount} {proposal.reviewedEstimate.inputSymbol}
          {' → '}
          about {proposal.reviewedEstimate.outputAmount} {proposal.reviewedEstimate.outputSymbol}
          {' · '}Jupiter Metis · {proposal.slippageBps} bps slippage
        </p>
      )}
      {proposal && (phase === 'review' || phase === 'signing' || phase === 'submitting') && (
        <SolanaProposalCosts feeSummary={proposal.feeSummary} />
      )}
      {note && <p className={styles.notice} role="status">{note}</p>}
      {solscanUrl && (
        <p className={styles.liveMeta}>
          {phase === 'confirmed' ? 'Settled on mainnet — ' : ''}
          <a href={solscanUrl} target="_blank" rel="noreferrer">signature on Solscan ↗</a>
        </p>
      )}
      {phase === 'unknown' && (
        <p className={styles.liveMeta}>
          If execute timed out, reconcile the same signature — never broadcast a different order automatically.
        </p>
      )}
      {account && <JesseLiveLedger account={account} ledger={ledger} />}
    </section>
  );
}
