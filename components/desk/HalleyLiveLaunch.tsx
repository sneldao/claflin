'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HalleyLaunchIntent } from '@/lib/meteora/contracts';
import type { HalleyLiveProposal } from '@/lib/meteora/live-contracts';
import {
  base64ToBytes,
  bytesToBase64,
  createBrowserSolanaWallet,
  hasInjectedSolanaProvider,
  type SolanaWalletPort,
} from '@/lib/solana/wallet';
import { signatureFromSignedTransaction } from '@/lib/solana/signature';
import { attestationCopy, METEORA_LAUNCH_SCOPE, useEligibilityAttestation } from '@/lib/desk/eligibility';
import { useJesseReadiness } from '@/lib/solana/readiness';
import { useHalleyLaunchLedger } from '@/lib/meteora/live-ledger';
import { formatAmount } from '@/lib/trading/domain';
import styles from './WorkingDesk.module.css';

type LivePhase =
  | 'idle'
  | 'connecting'
  | 'preparing'
  | 'review'
  | 'signing'
  | 'submitting'
  | 'confirmed'
  | 'partial'
  | 'failed'
  | 'unknown';

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

function money(value: string | null | undefined): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n >= 100 ? n.toFixed(2) : n.toPrecision(4);
}

/**
 * Live launch — two server-prepared transactions (curve config, then
 * pool + mint); the launcher's wallet signs both, the house broadcasts
 * in order. The wallet is payer, pool creator, fee claimer and leftover
 * receiver; the token's creator is the launcher. Paper filing stays a
 * separate action on the ticket.
 */
export function HalleyLiveLaunch({
  intent,
  revision,
}: {
  intent: HalleyLaunchIntent | null;
  revision: number;
}) {
  const wallet = useMemo<SolanaWalletPort | null>(
    () => (typeof window !== 'undefined' ? createBrowserSolanaWallet() : null),
    [],
  );
  const [account, setAccount] = useState<string | null>(null);
  const eligibility = useEligibilityAttestation(METEORA_LAUNCH_SCOPE);
  const ledger = useHalleyLaunchLedger(account);
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [proposal, setProposal] = useState<HalleyLiveProposal | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [links, setLinks] = useState<{ solscanUrl: string | null; configSolscanUrl: string | null; mintUrl: string | null; poolUrl: string | null } | null>(null);
  const [injected] = useState(() => hasInjectedSolanaProvider());
  const readiness = useJesseReadiness(account, null);
  const sol = solBalance(readiness.solLamports);

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
    setLinks(null);
    try {
      const res = await fetch('/api/desk/halley/live/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, wallet: address, revision }),
      });
      const body = await res.json() as HalleyLiveProposal & { message?: string; error?: string };
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
    setNote('Two signatures: the curve config, then the pool and mint.');
    /* A rejected signature is not a failure — nothing signed, nothing
       broadcast; the ticket returns to review untouched. */
    let signedConfig: Uint8Array;
    let signedPool: Uint8Array;
    try {
      signedConfig = await wallet.signTransaction(base64ToBytes(proposal.configTransactionBase64));
      signedPool = await wallet.signTransaction(base64ToBytes(proposal.poolTransactionBase64));
    } catch {
      setPhase('review');
      setNote('Signature not given — the launch proposal is unchanged.');
      return;
    }
    try {
      /* The durable record exists the moment the signatures do — before
         submit, so a dead tab never loses the on-chain pointers. */
      ledger.record({
        proposalId: proposal.id,
        wallet: address,
        signature: signatureFromSignedTransaction(signedPool),
        configSignature: signatureFromSignedTransaction(signedConfig),
        symbol: proposal.intent.symbol,
        quoteSymbol: proposal.quoteSymbol,
        baseMint: proposal.baseMint,
        pool: proposal.pool,
        submittedAt: Date.now(),
        status: 'submitted',
        lastCheckedAt: null,
      });
      setPhase('submitting');
      setNote(null);
      const res = await fetch('/api/desk/halley/live/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          signedConfigTransactionBase64: bytesToBase64(signedConfig),
          signedPoolTransactionBase64: bytesToBase64(signedPool),
          idempotencyKey: crypto.randomUUID(),
          wallet: address,
        }),
      });
      const body = await res.json() as {
        status?: string;
        message?: string;
        signature?: string | null;
        configSignature?: string | null;
        solscanUrl?: string | null;
        configSolscanUrl?: string | null;
        mintUrl?: string | null;
        poolUrl?: string | null;
      };
      setLinks({
        solscanUrl: body.solscanUrl ?? (body.signature ? `https://solscan.io/tx/${body.signature}` : null),
        configSolscanUrl: body.configSolscanUrl ?? (body.configSignature ? `https://solscan.io/tx/${body.configSignature}` : null),
        mintUrl: body.mintUrl ?? null,
        poolUrl: body.poolUrl ?? null,
      });
      const patch = {
        ...(body.signature ? { signature: body.signature } : {}),
        ...(body.configSignature ? { configSignature: body.configSignature } : {}),
        lastCheckedAt: Date.now(),
      };
      if (!res.ok) {
        const status = body.status === 'unknown' ? 'unknown' : 'failed';
        setPhase(status);
        ledger.update(proposal.id, { status, ...patch });
        setNote(body.message ?? 'Live submit failed.');
        return;
      }
      if (body.status === 'confirmed') {
        setPhase('confirmed');
        ledger.update(proposal.id, { status: 'confirmed', ...patch });
        setNote(body.message ?? 'Launch confirmed.');
        return;
      }
      if (body.status === 'partial') {
        setPhase('partial');
        ledger.update(proposal.id, { status: 'partial', ...patch });
        setNote(body.message ?? 'The config landed but the pool did not.');
        return;
      }
      if (body.status === 'unknown') {
        setPhase('unknown');
        ledger.update(proposal.id, { status: 'unknown', ...patch });
        setNote(body.message ?? 'Outcome unknown — do not relaunch.');
        return;
      }
      setPhase('failed');
      ledger.update(proposal.id, { status: 'failed', ...patch });
      setNote(body.message ?? 'Live launch failed.');
    } catch (err) {
      setPhase('failed');
      ledger.update(proposal.id, { status: 'unknown', lastCheckedAt: Date.now() });
      setNote(err instanceof Error ? err.message : 'Signing or submit failed.');
    }
  }, [wallet, proposal, ledger]);

  return (
    <section className={styles.liveBox} data-source="halley-live" aria-labelledby="halley-live-title">
      <p className={styles.eyebrow}>LIVE · METEORA DBC · SOLANA</p>
      <h2 id="halley-live-title">Launch it for real.</h2>
      <p className={styles.liveMeta}>
        The same curve, deployed on mainnet. Your wallet creates the mint and pays
        account rent — you are the token’s creator. The house is venue, never issuer.
        Paper filing stays available above.
      </p>
      <ol className={styles.readiness} aria-label="What this launch needs">
        <li data-state={eligibility.attested ? 'ok' : 'needed'}>
          <span>Confirmed under the launch terms</span>
          {!eligibility.attested && (
            <span className={styles.readinessDetail}>
              {attestationCopy(METEORA_LAUNCH_SCOPE)}{' '}
              <a href={METEORA_LAUNCH_SCOPE.issuerTermsUrl} target="_blank" rel="noreferrer">Venue docs</a>
              <button type="button" className={styles.secondary} onClick={eligibility.confirm}>
                I confirm I may launch
              </button>
            </span>
          )}
        </li>
        <li data-state={account ? 'ok' : 'needed'}>
          <span>{account ? `Wallet connected · ${shortAddress(account)}` : 'A Solana wallet'}</span>
          {!account && !injected && (
            <span className={styles.readinessDetail}>Install Phantom or Solflare, then connect.</span>
          )}
        </li>
        {account && (
          <li data-state={readiness.status === 'unavailable' ? 'unknown' : 'needed'}>
            <span>SOL for fees and account rent</span>
            <span className={styles.readinessDetail}>
              {readiness.status === 'loading' && 'Reading balances…'}
              {readiness.status === 'unavailable' && 'Balance check unavailable — the venue still verifies at preparation.'}
              {readiness.status === 'ok' && (sol === null ? 'SOL balance unreadable' : `${sol} SOL`)}
            </span>
          </li>
        )}
      </ol>
      <div className={styles.slipActions}>
        {!account ? (
          <button type="button" className={styles.primary} disabled={phase === 'connecting'} onClick={() => { void connect(); }}>
            {phase === 'connecting' ? 'Connecting…' : 'Connect Solana wallet'}
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => { void wallet?.disconnect(); }}>
            Disconnect {shortAddress(account)}
          </button>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={!account || !intent || !eligibility.attested || phase === 'preparing' || phase === 'signing' || phase === 'submitting'}
          onClick={() => { void prepare(); }}
        >
          {phase === 'preparing' ? 'Preparing…' : 'Prepare live launch'}
        </button>
        {proposal && phase === 'review' && (
          <button type="button" className={styles.primary} onClick={() => { void signAndSubmit(); }}>
            Sign &amp; launch
          </button>
        )}
      </div>
      {proposal && (phase === 'review' || phase === 'signing' || phase === 'submitting') && (
        <p className={styles.liveMeta} role="status">
          {proposal.intent.symbol} · opens {money(proposal.openingPriceQuote)} {proposal.quoteSymbol}
          {' · '}mint <code>{proposal.baseMint.slice(0, 8)}…</code>
          {' · '}pool <code>{proposal.pool.slice(0, 8)}…</code>
          {' · '}graduates at {money(proposal.graduationPriceQuote)} {proposal.quoteSymbol} → DAMM v2
        </p>
      )}
      {note && <p className={styles.notice} role="status">{note}</p>}
      {links && (links.solscanUrl || links.configSolscanUrl || links.mintUrl || links.poolUrl) && (
        <p className={styles.liveMeta}>
          {links.configSolscanUrl && <a href={links.configSolscanUrl} target="_blank" rel="noreferrer">Config tx</a>}
          {' '}
          {links.solscanUrl && <a href={links.solscanUrl} target="_blank" rel="noreferrer">Launch tx</a>}
          {' '}
          {links.mintUrl && <a href={links.mintUrl} target="_blank" rel="noreferrer">Mint</a>}
          {' '}
          {links.poolUrl && <a href={links.poolUrl} target="_blank" rel="noreferrer">Pool</a>}
        </p>
      )}
      {phase === 'unknown' && (
        <p className={styles.liveMeta}>
          If broadcast timed out, reconcile the same signatures — never launch a different mint automatically.
        </p>
      )}
      {phase === 'partial' && (
        <p className={styles.liveMeta}>
          The config transaction landed but the pool transaction did not — a fresh prepare creates a new config and a new mint.
        </p>
      )}
      {account && ledger.records.length > 0 && (
        <div className={styles.liveLedger} aria-label="Launches from this wallet">
          <p className={styles.eyebrow}>Live launches</p>
          <ul>
            {ledger.records.map(r => (
              <li key={r.proposalId}>
                <span>{r.symbol}</span>
                {' · '}
                <span>{r.status}</span>
                {' '}
                {r.configSignature && (
                  <a href={`https://solscan.io/tx/${r.configSignature}`} target="_blank" rel="noreferrer">config</a>
                )}
                {' '}
                {r.signature && (
                  <a href={`https://solscan.io/tx/${r.signature}`} target="_blank" rel="noreferrer">pool tx</a>
                )}
                {' '}
                <a href={`https://solscan.io/account/${r.pool}`} target="_blank" rel="noreferrer">pool</a>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.secondary} disabled={ledger.reconciling} onClick={() => { void ledger.reconcile(); }}>
            {ledger.reconciling ? 'Checking…' : 'Reconcile'}
          </button>
        </div>
      )}
    </section>
  );
}
