'use client';

import Link from 'next/link';
import { HOUSE_DESKS } from '@/lib/house';
import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { HouseMark } from './HouseMark';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { TradeTicket } from './TradeTicket';
import { PaperHistory } from './PaperHistory';
import { HettyStatus } from './HettyStatus';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { usePaperSync } from '@/lib/trading/usePaperSync';
import { useEligibility } from '@/lib/trading/useEligibility';
import { DESK_INSTRUMENTS, resolveDeskAlias } from '@/lib/trading/catalog';
import { useEffect } from 'react';
import styles from './WorkingDesk.module.css';

// Three.js (~600KB) and the ElevenLabs SDK are decorative/session-only —
// lazy-loaded so the desk's first paint stays light.
const DeskInstrument = dynamic(() => import('./DeskInstrument').then(m => m.DeskInstrument), { ssr: false });
const HettyCall = dynamic(() => import('./HettyCall').then(m => m.HettyCall), { ssr: false });

export function WorkingDesk() {
  const desk = useTradingDesk();
  const auth = useDeskAuth();
  usePaperSync(desk);
  const eligibility = useEligibility();
  const hetty = HOUSE_DESKS[0];
  const [hettyLive, setHettyLive] = useState(false);
  const handleLiveChange = useCallback((live: boolean) => setHettyLive(live), []);

  // Colophon seal: the house mark stroke-draws once when the footer scrolls
  // into view — a deliberate closer, not a loop. Reduced-motion draws it static.
  const [sealDrawn, setSealDrawn] = useState(false);
  const sealRef = useRef<HTMLDivElement>(null);
  /* The drawn state is intentionally synchronized to matchMedia in an effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const el = sealRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSealDrawn(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSealDrawn(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Shared-instruction deep link: ?intent=nvda&side=buy&amount=25 prefills
  // the ticket. Strictly validated — bad params are dropped, never applied.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('intent');
    if (!raw) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    const instrument = resolveDeskAlias(raw);
    if (!instrument?.quoteSupported) return;
    const side = params.get('side') === 'sell' ? 'sell' : 'buy';
    const amount = (params.get('amount') ?? '').trim();
    const cleanAmount = /^(0|[1-9]\d*)(\.\d+)?$/.test(amount) ? amount : '';
    desk.edit(side === 'sell'
      ? { instrumentId: instrument.id, side: 'sell', unit: 'token', amount: cleanAmount }
      : { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: cleanAmount });
    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = DESK_INSTRUMENTS.find(s => s.id === desk.state.draft.instrumentId);
  const reviewActive = desk.state.stage === 'review' || desk.state.stage === 'loading' || desk.state.stage === 'saved';
  const instrumentStage = hettyLive
    ? 'conversation'
    : desk.state.stage === 'review' || desk.state.stage === 'saved'
      ? 'confirmation'
      : desk.state.stage === 'loading'
        ? 'conversation'
        : 'arrival';
  const instrumentLabel = hettyLive
    ? 'HETTY — ON THE LINE'
    : selected
      ? `${selected.symbol.toUpperCase()} · ${desk.state.stage === 'loading' ? 'CALLING THE VENUE' : desk.state.stage === 'review' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
      : 'PAPER TRADING / NO LIVE ORDERS';

  const loadInstrument = (instrumentId: string) => {
    desk.edit({ ...desk.state.draft, instrumentId });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    document.getElementById('amount')?.focus({ preventScroll: true });
  };

  // Pointer drives the room: the light pool follows, the window drifts
  // against it, the instrument tilts. Coalesced to one rAF per frame and
  // written as CSS vars directly on the element — no React re-render, no
  // redundant style invalidation between pointermove bursts.
  const parallax = useRef({ px: 0, py: 0, raf: 0 });
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const p = parallax.current;
    p.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    p.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (p.raf) return;
    p.raf = requestAnimationFrame(() => {
      p.raf = 0;
      el.style.setProperty('--px', String(p.px));
      el.style.setProperty('--py', String(p.py));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(parallax.current.raf), []);

  return <div className={styles.workspace} onPointerMove={handlePointerMove} data-live={hettyLive ? 'true' : 'false'} data-desk-stage={desk.state.stage}>
    <div className={styles.room} aria-hidden="true">
      <div className={styles.window}><i /><i /><i /></div>
      <div className={styles.lightShaft} />
      <div className={styles.lightPool} />
      <div className={styles.tradeLamp} />
      <div className={styles.motes}><i /><i /><i /><i /><i /><i /></div>
    </div>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Claflin, your trading desk"><HouseMark className={styles.houseMark} /><span><strong>CLAFLIN</strong><small>A CONSIDERED APPROACH</small></span></Link>
      <nav aria-label="Desk navigation"><a href="#instruction">The desk</a><a href="#on-desk">On your desk</a><a href="#paper-history">Your record</a><a href="#hetty">About Hetty</a>
        {auth.enabled && (auth.authenticated ? (
          <span className={styles.authChip}>
            <span className={styles.authLabel} title={auth.label ?? 'Signed in'}>{auth.label ?? 'Signed in'}</span>
            <button type="button" onClick={auth.logout}>Sign out</button>
          </span>
        ) : (
          <button type="button" className={styles.authLink} onClick={auth.login}>Sign in</button>
        ))}
      </nav>
    </header>
    <main id="main-content" className={styles.main}>
      <TickerTape onSelect={loadInstrument} disabled={desk.state.stage === 'loading'} />
      <div className={styles.mode}><span>HETTY / BASE <span className={styles.chainId}>8453</span></span><strong>PAPER TRADING</strong><span>Live estimates. No real funds move.</span></div>
      <div className={styles.grid} data-review={reviewActive ? 'true' : 'false'}>
        <section className={styles.introduction} aria-labelledby="desk-title">
          <p className={styles.eyebrow}>WELCOME TO CLAFLIN</p>
          <h1 id="desk-title">Your trading<br /><em>desk.</em></h1>
          <p>A clear view of the trade before you make it. Explore Coinbase Tokenized Stocks on Base, review the terms, and decide for yourself.</p>
          <p className={styles.welcomeNote}>Hetty’s desk is open for paper trading. Start with a stock.</p>
          <div className={styles.instrumentShell} data-stage={instrumentStage}>
            <div className={styles.instrument} data-stage={instrumentStage}><DeskInstrument stage={instrumentStage} label={instrumentLabel} /></div>
            <p className={styles.instrumentCaption} aria-hidden="true"><span>CLAFLIN / DESK INSTRUMENT</span>ENAMEL · BRASS · LIGHT</p>
          </div>
          <HettyStatus desk={desk} />
        </section>
        <TradeTicket desk={desk} />
        {auth.enabled && (
          <p className={styles.liveAccess} aria-live="polite">
            {eligibility.stage === 'signed_out' && 'Live access — sign in to begin verification.'}
            {eligibility.stage === 'no_wallet' && (
              <>Live access — <button type="button" className={styles.authLink} onClick={auth.linkWallet}>link a wallet</button> to check Coinbase verification.</>
            )}
            {eligibility.stage === 'checking' && 'Live access — checking Coinbase verification…'}
            {eligibility.stage === 'done' && eligibility.eligible && `Verified onchain (Coinbase · ${eligibility.country ?? 'residence attested'}) — live execution arrives in a later release.`}
            {eligibility.stage === 'done' && !eligibility.eligible && (
              eligibility.reason === 'restricted_jurisdiction'
                ? `Live access — this wallet's verified country (${eligibility.country ?? 'restricted'}) is not eligible for these products.`
                : eligibility.reason === 'no_country_attestation'
                  ? 'Live access — complete the country attestation on Coinbase Verifications.'
                  : eligibility.reason === 'check_unavailable'
                    ? 'Live access — the verification check is unavailable right now.'
                    : 'Live access — no Coinbase verification on this wallet yet.'
            )}
          </p>
        )}
        <aside className={styles.support} aria-label="Your broker and instruction input">
          <div id="hetty" className={styles.brokerNote}>
            <span>YOUR AI BROKER</span><h2>{hetty.name}.</h2><p>{hetty.approach}</p>
            <details><summary>About Hetty</summary><p>Hetty is an AI character inspired by historical finance, not a historical person or a licensed human broker. Her role is to help make trading decisions clear, not to make them for you.</p><p>Ring her below for a live voice session — she can draft, quote and record paper trades on your ticket while you watch. She cannot place real orders; this release is paper-only.</p></details>
          </div>
          <div id="on-desk"><DeskBoard desk={desk} /></div>
          <HettyCall desk={desk} onLiveChange={handleLiveChange} />
        </aside>
      </div>
      <PaperHistory desk={desk} />
      <section id="house" className={styles.house} aria-labelledby="house-title">
        <p className={styles.eyebrow}>ONE HOUSE. DISTINCT PERSPECTIVES.</p>
        <h2 id="house-title">Hetty first. A house over time.</h2>
        <p>Research and specialist judgment belong beside the trade—not in the way of it.</p>
        <details><summary>Other desks, in time</summary><ul>{HOUSE_DESKS.slice(1).map(broker => <li key={broker.id}><strong>{broker.name}</strong><span>{broker.market} · Planned</span><p>{broker.approach}</p></li>)}</ul><p>These desks are not yet available. Their markets, accounts and permissions will be explicit before they open.</p></details>
      </section>
    </main>
    <div ref={sealRef} className={styles.seal} data-drawn={sealDrawn ? 'true' : 'false'} aria-hidden="true">
      <svg width="88" height="88" viewBox="0 0 56 56" fill="none">
        <path className={styles.sealOuter} d="M28 4 50 17v22L28 52 6 39V17L28 4Z" stroke="currentColor" pathLength={1} />
        <path className={styles.sealMid} d="M28 10 44 20v16L28 46 12 36V20L28 10Z" stroke="currentColor" opacity=".45" pathLength={1} />
        <path className={styles.sealInner} d="M35 20a11 11 0 1 0 0 16M21 14v28M27 12v8m0 16v8M33 15v5m0 16v5" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
      </svg>
    </div>
    <footer className={styles.footer}><span>CLAFLIN &amp; CO. / THE BROKERAGE HOUSE</span><span>Independent thinking. Explicit decisions.</span></footer>
  </div>;
}
