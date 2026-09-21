'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JesseIntent, SolanaLiveProposal } from '@/lib/solana/contracts';
import {
  base64ToBytes,
  bytesToBase64,
  createBrowserSolanaWallet,
  type SolanaWalletPort,
} from '@/lib/solana/wallet';
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
        setPhase(body.status === 'unknown' ? 'unknown' : 'failed');
        setNote(body.message ?? 'Live submit failed.');
        return;
      }
      if (body.status === 'confirmed') {
        setPhase('confirmed');
        setSolscanUrl(body.solscanUrl ?? (body.signature ? `https://solscan.io/tx/${body.signature}` : null));
        setNote(body.message ?? 'Live settle confirmed.');
        return;
      }
      if (body.status === 'unknown') {
        setPhase('unknown');
        setNote(body.message ?? 'Outcome unknown — do not resign a different order.');
        setSolscanUrl(body.solscanUrl ?? null);
        return;
      }
      setPhase('failed');
      setNote(body.message ?? 'Live settle failed.');
      setSolscanUrl(body.solscanUrl ?? null);
    } catch (err) {
      setPhase('failed');
      setNote(err instanceof Error ? err.message : 'Signing or submit failed.');
    }
  }, [wallet, proposal]);

  return (
    <section className={styles.liveBox} data-source="jesse-live" aria-labelledby="jesse-live-title">
      <p className={styles.eyebrow}>LIVE · JUPITER · SOLANA</p>
      <h2 id="jesse-live-title">Settle on Solana.</h2>
      <p className={styles.liveMeta}>
        Fresh Metis order with your wallet as taker — you sign, Jupiter executes.
        Needs USDC (buys) or the xStock (sells) plus SOL for fees. Per-order cap: 250 USDC / 10 scaled.
        Paper filing stays available below.
      </p>
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
          disabled={!account || !intent || phase === 'preparing' || phase === 'signing' || phase === 'submitting'}
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
      {note && <p className={styles.notice} role="status">{note}</p>}
      {solscanUrl && (
        <p className={styles.liveMeta}>
          <a href={solscanUrl} target="_blank" rel="noreferrer">View on Solscan</a>
        </p>
      )}
      {phase === 'unknown' && (
        <p className={styles.liveMeta}>
          If execute timed out, reconcile the same signature — never broadcast a different order automatically.
        </p>
      )}
    </section>
  );
}
