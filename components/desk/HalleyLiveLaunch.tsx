'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  canPrepareHalleyLaunch,
  halleyLiveRecordHeading,
  halleyProposalBound,
  halleySubmitOutcome,
  type HalleyLivePhase,
} from '@/lib/meteora/live-status';
import { formatAmount } from '@/lib/trading/domain';
import styles from './WorkingDesk.module.css';

type LivePhase = HalleyLivePhase;

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
  stale = false,
  closed = false,
  onRefreshEstimate,
  onBusyChange,
}: {
  intent: HalleyLaunchIntent | null;
  revision: number;
  /** The estimate under review lapsed or was replaced — the ceremony must
      not prepare or sign against stale terms. */
  stale?: boolean;
  closed?: boolean;
  /** Parent-supplied redraw so the caller can refresh a lapsed estimate. */
  onRefreshEstimate?: () => void;
  /** The wallet ceremony is mid-flight — mode switching must wait. */
  onBusyChange?: (busy: boolean) => void;
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
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [injected] = useState(() => hasInjectedSolanaProvider());
  const readiness = useJesseReadiness(account, null);
  const sol = solBalance(readiness.solLamports);
  const signLock = useRef(false);

  const busy = phase === 'preparing' || phase === 'signing' || phase === 'submitting';
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  /* A prepared proposal binds to the revision it was built from — a
     re-estimate or edit leaves it unusable rather than letting it ride
     stale terms. */
  const bound = halleyProposalBound(proposal, revision, intent, account) ? proposal : null;
  const proposalWalletMismatch = proposal !== null && proposal.revision === revision
    && account !== null && proposal.wallet !== account;

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

  const canPrepare = !closed && canPrepareHalleyLaunch(
    phase, intent !== null, stale, account !== null, eligibility.attested, bound !== null,
  );
  const prepareLock = useRef(false);

  const prepare = useCallback(async () => {
    if (!wallet || !intent || closed || stale || prepareLock.current) return;
    const address = wallet.getAccount()?.address;
    if (!address || !eligibility.attested) return;
    if (!canPrepareHalleyLaunch(phase, true, false, true, true,
      halleyProposalBound(proposal, revision, intent, address))) return;
    prepareLock.current = true;
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
    } finally {
      prepareLock.current = false;
    }
  }, [wallet, intent, revision, closed, stale, phase, eligibility, proposal]);

  const signAndSubmit = useCallback(async () => {
    if (!wallet || !intent || stale || closed || phase !== 'review' || signLock.current) return;
    const address = wallet.getAccount()?.address;
    if (!address) {
      setNote('Connect a Solana wallet first.');
      return;
    }
    if (!proposal) return;
    if (!halleyProposalBound(proposal, revision, intent, address)) {
      setNote('Reconnect the wallet that prepared this launch, or prepare a new proposal.');
      return;
    }
    signLock.current = true;
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
      signLock.current = false;
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
        name: proposal.intent.name,
        anchorSymbol: proposal.intent.anchorSymbol,
        curve: proposal.intent.curve,
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
      const outcome = halleySubmitOutcome(res.ok, body.status);
      if (!res.ok) {
        signLock.current = false;
        setPhase('unknown');
        ledger.update(proposal.id, { status: 'unknown', ...patch });
        setNote(body.message ?? 'Launch outcome unknown — reconcile before another launch.');
        return;
      }
      if (outcome === 'confirmed') {
        signLock.current = false;
        setPhase('confirmed');
        ledger.update(proposal.id, { status: 'confirmed', ...patch });
        setNote(body.message ?? 'Launch confirmed.');
        return;
      }
      if (outcome === 'partial') {
        signLock.current = false;
        setPhase('partial');
        ledger.update(proposal.id, { status: 'partial', ...patch });
        setNote(body.message ?? 'The config landed but the pool did not.');
        return;
      }
      if (outcome === 'unknown') {
        signLock.current = false;
        setPhase('unknown');
        ledger.update(proposal.id, { status: 'unknown', ...patch });
        setNote(body.message ?? 'Outcome unknown — do not relaunch.');
        return;
      }
      signLock.current = false;
      if (outcome === 'failed') {
        setPhase('failed');
        ledger.update(proposal.id, { status: 'failed', ...patch });
        setNote(body.message ?? 'Live launch failed.');
      } else {
        setPhase('unknown');
        ledger.update(proposal.id, { status: 'unknown', ...patch });
        setNote('Launch outcome unknown — reconcile before another launch.');
      }
    } catch (err) {
      signLock.current = false;
      setPhase('unknown');
      ledger.update(proposal.id, { status: 'unknown', lastCheckedAt: Date.now() });
      setNote(err instanceof Error ? `${err.message} — outcome unknown; reconcile before another launch.` : 'Outcome unknown — reconcile before another launch.');
    }
  }, [wallet, proposal, revision, ledger, intent, stale, closed, phase]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
  }, []);
  const copyTokenLink = useCallback(async () => {
    const url = links?.mintUrl ?? (proposal ? `https://solscan.io/token/${proposal.baseMint}` : null);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 4000);
  }, [links, proposal]);

  return (
    <section
      id="halley-live"
      className={styles.liveBox}
      data-source="halley-live"
      data-outcome={phase === 'confirmed' ? 'filled' : phase === 'failed' ? 'failed' : undefined}
      aria-labelledby="halley-live-title"
    >
      <p className={styles.eyebrow}>LIVE · METEORA DBC · SOLANA</p>
      <h2 id="halley-live-title">Launch it for real.</h2>
      <p className={styles.liveMeta}>
        The same curve, deployed on mainnet. Your wallet creates the mint and pays
        account rent — you are the token’s creator. The house is venue, never issuer.
        A paper filing stays a separate record on the slip — never a step toward the mint.
      </p>
      {!intent && !stale && (
        <p className={styles.liveMeta}>
          Connect your wallet and confirm you may launch below. Then return to the slip and request a fresh
          60-second estimate; the ceremony prepares only the terms you reviewed.
          {' '}
          <a href="#instruction">Back to the launch slip</a>
        </p>
      )}
      {closed && (
        <p className={styles.notice} role="status">
          The live launch path has closed — nothing new can be prepared or signed. An in-flight ceremony still settles below.
        </p>
      )}
      {stale && (
        <p className={styles.notice} role="status">
          The estimate under review has lapsed — nothing here can prepare or sign against stale terms.
          {' '}
          {onRefreshEstimate && (
            <button type="button" className={styles.secondary} onClick={onRefreshEstimate}>
              Fresh estimate
            </button>
          )}
        </p>
      )}
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
        {!(phase === 'review' && bound) && (
          <button
            type="button"
            className={styles.primary}
            disabled={!canPrepare}
            onClick={() => { void prepare(); }}
          >
            {phase === 'preparing' ? 'Preparing…' : phase === 'review' ? 'Prepare revised launch' : 'Prepare live launch'}
          </button>
        )}
        {proposalWalletMismatch && phase === 'review' && (
          <p className={styles.notice} role="status">
            Reconnect the wallet that prepared this launch, or prepare a new proposal.
          </p>
        )}
        {bound && phase === 'review' && (
          <button
            type="button"
            className={styles.primary}
            disabled={stale || !intent || closed}
            onClick={() => { void signAndSubmit(); }}
          >
            Sign &amp; launch
          </button>
        )}
      </div>
      {bound && (phase === 'review' || phase === 'signing' || phase === 'submitting') && (
        <p className={styles.liveMeta} role="status">
          {bound.intent.symbol} · opens {money(bound.openingPriceQuote)} {bound.quoteSymbol}
          {' · '}mint <code>{bound.baseMint.slice(0, 8)}…</code>
          {' · '}pool <code>{bound.pool.slice(0, 8)}…</code>
          {' · '}graduates at {money(bound.graduationPriceQuote)} {bound.quoteSymbol} → DAMM v2
        </p>
      )}
      {note && <p className={styles.notice} role="status">{note}</p>}
      {/* The created instrument — only once the chain confirmed it. The
          mint address is the shareable artifact; the house hosts no token
          page of its own. */}
      {phase === 'confirmed' && proposal && (
        <CreatedTokenCard
          proposal={proposal}
          wallet={account ?? proposal.wallet}
          links={links}
          copied={copied}
          onCopy={() => { void copyTokenLink(); }}
        />
      )}
      {/* Signatures were broadcast but the mint is not confirmed — say what
          is known and what is not, never "created". */}
      {links && proposal && phase !== 'confirmed' && (links.solscanUrl || links.configSolscanUrl) && (
        <div className={styles.instrumentRecord} role="group" aria-label="Unconfirmed chain outcome">
          <p className={styles.eyebrow}>{halleyLiveRecordHeading(phase) ?? 'Pending chain check'}</p>
          <ul className={styles.instrumentRecordRows}>
            <li><span>Planned mint</span><code>{shortAddress(proposal.baseMint)}</code></li>
            <li><span>Planned pool</span><code>{shortAddress(proposal.pool)}</code></li>
            {links.configSolscanUrl && (
              <li><span>Curve config</span><a href={links.configSolscanUrl} target="_blank" rel="noreferrer">tx ↗</a></li>
            )}
            {links.solscanUrl && (
              <li><span>Pool + mint</span><a href={links.solscanUrl} target="_blank" rel="noreferrer">tx ↗</a></li>
            )}
          </ul>
          <p className={styles.instrumentRecordNote}>
            {phase === 'partial'
              ? 'The config transaction broadcast; the pool did not confirm. Reconcile below before launching anything again.'
              : 'The mint is not confirmed. Reconcile below before launching anything again.'}
          </p>
        </div>
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
                <span>{r.name ? `${r.name} · ` : ''}{r.symbol}</span>
                {' · '}
                <span>{r.status}</span>
                {(r.status === 'partial' || r.status === 'unknown' || r.status === 'submitted') && (
                  <span> — mint not confirmed</span>
                )}
                {' '}
                {r.status === 'confirmed' && r.baseMint && (
                  <a href={`https://solscan.io/token/${r.baseMint}`} target="_blank" rel="noreferrer">mint ↗</a>
                )}
                {' '}
                {r.status === 'confirmed' && (
                  <a href={`https://solscan.io/account/${r.pool}`} target="_blank" rel="noreferrer">pool</a>
                )}
                {' '}
                {r.configSignature && (
                  <a href={`https://solscan.io/tx/${r.configSignature}`} target="_blank" rel="noreferrer">config</a>
                )}
                {' '}
                {r.signature && (
                  <a href={`https://solscan.io/tx/${r.signature}`} target="_blank" rel="noreferrer">pool tx</a>
                )}
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

type CreatedTokenLinks = {
  solscanUrl: string | null;
  configSolscanUrl: string | null;
  mintUrl: string | null;
  poolUrl: string | null;
} | null;

export function CreatedTokenCard({
  proposal,
  wallet,
  links,
  copied,
  onCopy,
}: {
  proposal: HalleyLiveProposal;
  wallet: string;
  links: CreatedTokenLinks;
  copied: 'ok' | 'fail' | null;
  onCopy: () => void;
}) {
  return (
    <div className={styles.instrumentRecord} role="group" aria-label="Token created">
      <p className={styles.eyebrow}>TOKEN CREATED · MAINNET</p>
      <h3 className={styles.instrumentTitle}>{proposal.intent.name} ({proposal.intent.symbol})</h3>
      <p className={styles.instrumentRecordNote}>
        A new tracker token on a {proposal.intent.curve} curve, quoted in {proposal.quoteSymbol}
        {proposal.intent.anchorSymbol ? ` — anchored to ${proposal.intent.anchorSymbol} for its opening reference, not pegged to it` : ''}.
        {' '}It is not stock ownership. Created by your wallet {shortAddress(wallet)} — the house is venue, never issuer.
      </p>
      <ul className={styles.instrumentRecordRows}>
        <li>
          <span>Mint</span>
          <code>{proposal.baseMint}</code>
          {' '}
          <a href={links?.mintUrl ?? `https://solscan.io/token/${proposal.baseMint}`} target="_blank" rel="noreferrer">verify ↗</a>
        </li>
        <li>
          <span>Pool</span>
          <code>{proposal.pool}</code>
          {' '}
          <a href={links?.poolUrl ?? `https://solscan.io/account/${proposal.pool}`} target="_blank" rel="noreferrer">verify ↗</a>
        </li>
        {links?.configSolscanUrl && (
          <li><span>Curve config</span><a href={links.configSolscanUrl} target="_blank" rel="noreferrer">tx ↗</a></li>
        )}
        {links?.solscanUrl && (
          <li><span>Pool + mint</span><a href={links.solscanUrl} target="_blank" rel="noreferrer">tx ↗</a></li>
        )}
      </ul>
      <div className={styles.slipActions}>
        <button type="button" className={styles.secondary} onClick={onCopy}>
          Copy token link
        </button>
        {copied === 'ok' && <span className={styles.readinessDetail} role="status">Link copied.</span>}
        {copied === 'fail' && <span className={styles.readinessDetail} role="status">Copy failed — select the mint address above.</span>}
      </div>
    </div>
  );
}
