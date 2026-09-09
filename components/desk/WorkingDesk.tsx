'use client';

import Link from 'next/link';
import { HOUSE } from '@/lib/house';
import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { HouseMark } from './HouseMark';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeTicket } from './TradeTicket';
import { PaperHistory } from './PaperHistory';
import { PaperLedger } from './PaperLedger';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { DeskInstrument } from './DeskInstrument';
import { BrokerageRoom, DeskObjects, TapeMachine } from './BrokerageRoom';
import { HouseDirectory } from './HouseDirectory';
import { ClosedDesk } from './ClosedDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { usePaperSync } from '@/lib/trading/usePaperSync';
import { useRoomTone } from '@/lib/desk-tone';
import { DESK_INSTRUMENTS, resolveDeskAlias } from '@/lib/trading/catalog';
import styles from './WorkingDesk.module.css';

// Three.js (~600KB) and the ElevenLabs SDK are decorative/session-only —
// lazy-loaded so the desk's first paint stays light.
function HettyDoorShell() {
  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" aria-busy="true">
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty <small>AI BROKER · BASE</small></h2>
        <span className={styles.callLine}>DIRECT LINE</span>
      </div>
      <p className={styles.callNote}>Speak your instruction. Review it on the same ticket.</p>
      <div className={styles.callActions}><button type="button" className={styles.callButton} disabled>Preparing the line…</button></div>
      <p className={styles.callFoot}>The microphone stays off until you ring.</p>
    </section>
  );
}

const HettyCall = dynamic(() => import('./HettyCall').then(m => m.HettyCall), { ssr: false, loading: HettyDoorShell });

export function WorkingDesk() {
  const desk = useTradingDesk();
  const auth = useDeskAuth();
  usePaperSync(desk);
  const [hettyLive, setHettyLive] = useState(false);
  const handleLiveChange = useCallback((live: boolean) => setHettyLive(live), []);
  useEffect(() => { if (!desk.open) setHettyLive(false); }, [desk.open]);
  const tone = useRoomTone(hettyLive);
  const open = desk.open;
  const hasTray = open && desk.watched.length > 0;
  const hasLedger = open && (desk.records.length > 0 || Boolean(desk.storageError));

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
    if (!desk.open || !instrument?.quoteSupported) return;
    const side = params.get('side') === 'sell' ? 'sell' : 'buy';
    const amount = (params.get('amount') ?? '').trim();
    const cleanAmount = /^(0|[1-9]\d*)(\.\d+)?$/.test(amount) ? amount : '';
    desk.edit(side === 'sell'
      ? { instrumentId: instrument.id, side: 'sell', unit: 'token', amount: cleanAmount }
      : { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: cleanAmount });
    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = DESK_INSTRUMENTS.find(s => s.id === desk.state.draft.instrumentId);
  const reviewActive = desk.state.stage === 'review' || desk.state.stage === 'saved';
  const instrumentStage = hettyLive
    ? 'conversation'
    : desk.state.stage === 'review' || desk.state.stage === 'saved'
      ? 'confirmation'
      : 'arrival';
  const instrumentLabel = hettyLive
    ? 'HETTY — ON THE LINE'
    : selected
      ? `${selected.symbol.toUpperCase()} · ${desk.state.stage === 'loading' ? 'REQUESTING ESTIMATE' : desk.state.stage === 'review' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
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
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(parallax.current.raf);
    parallax.current.raf = 0;
    e.currentTarget.style.setProperty('--px', '0');
    e.currentTarget.style.setProperty('--py', '0');
  }, []);
  useEffect(() => () => cancelAnimationFrame(parallax.current.raf), []);

  return <div className={styles.workspace} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave} data-live={hettyLive ? 'true' : 'false'} data-desk-stage={desk.state.stage} data-desk={desk.deskId} data-desk-open={open ? 'true' : 'false'}>
    <div className={styles.room} aria-hidden="true">
      <div className={styles.window}>
        <i /><i /><i />
        <div className={styles.street}><b /><b /><b /><b /><b /><b /></div>
        <div className={styles.pitGlow} />
      </div>
      <BrokerageRoom />
      <div className={styles.wallPanels} />
      <div className={styles.lightShaft} />
      <div className={styles.lightPool} />
      <div className={styles.tradeLamp} />
    </div>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Claflin, the office above the pit"><HouseMark className={styles.houseMark} /><span><strong>CLAFLIN</strong><small>{HOUSE.tagline.toUpperCase()}</small></span></Link>
      <nav aria-label="Desk navigation">
        <HouseDirectory activeDeskId={desk.deskId} onVisit={desk.switchDesk} />
        {open && <a href="#instruction">Your ticket</a>}
        {open && <a href="#hetty">The line</a>}
        {hasLedger && <a href="#paper-ledger">Your record</a>}
        <button
          type="button"
          className={styles.toneToggle}
          aria-pressed={tone.enabled}
          onClick={() => tone.setEnabled(!tone.enabled)}
        >
          <span className={styles.soundBars} aria-hidden="true"><i /><i /><i /><i /></span>
          {tone.enabled ? (hettyLive ? 'Floor held' : 'Floor open') : 'Hear the floor'}
        </button>
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
      <div className={styles.mode}>
        {open
          ? <><strong>PAPER TRADING</strong><span>Real estimates. No real funds move.</span><span className={styles.modeMarket}>COINBASE TOKENIZED STOCKS · BASE</span></>
          : <><strong>PLANNED DESK</strong><span>Not open for quotation or recording.</span><span className={styles.modeMarket}>{desk.activeDesk.market.toUpperCase()} · {desk.activeDesk.name.toUpperCase()}</span></>}
      </div>
      <div className={styles.grid} data-review={open && reviewActive ? 'true' : 'false'}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        {open ? <TradeTicket desk={desk} /> : <ClosedDesk desk={desk.activeDesk} onReturn={() => desk.switchDesk('hetty')} />}
        {hasLedger && <PaperLedger desk={desk} />}
        <aside className={styles.support} aria-label={open ? 'The Base desk’s direct line' : 'A closed desk'}>
          {open && <HettyCall desk={desk} onLiveChange={handleLiveChange} />}
          <div className={styles.instrumentShell} data-stage={open ? instrumentStage : 'arrival'}>
            <div className={styles.instrument} data-stage={open ? instrumentStage : 'arrival'}><DeskInstrument eager poster="/desk-receiver.webp" stage={open ? instrumentStage : 'arrival'} label={open ? instrumentLabel : `PLANNED · ${desk.activeDesk.market.toUpperCase()}`} reviewing={open && reviewActive} /></div>
          </div>
          <div className={styles.deskInscription}>
            <span>The pit is downstairs.</span>
            <p>This desk is for deciding.</p>
          </div>
          {open && <details className={styles.aboutHetty}>
            <summary>About Hetty</summary>
            <p>Hetty is an AI character inspired by historical finance, not a historical person or a licensed human broker. She helps make a decision clear. She does not make it for you. This release is paper-only; she cannot place a real order.</p>
          </details>}
        </aside>
      </div>
      {open && <div className={styles.tickerStation}>
        <TapeMachine />
        <TickerTape onSelect={loadInstrument} disabled={desk.state.stage === 'loading'} />
      </div>}
      {hasTray && <div id="on-desk"><DeskBoard desk={desk} /></div>}
      {hasLedger && <PaperHistory desk={desk} />}
    </main>
    <footer className={styles.footer}>
      <span>YOUR INSTRUCTION. YOUR DECISION.</span>
      <div ref={sealRef} className={styles.seal} data-drawn={sealDrawn ? 'true' : 'false'} aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 56 56" fill="none">
          <path className={styles.sealOuter} d="M28 4 50 17v22L28 52 6 39V17L28 4Z" stroke="currentColor" pathLength={1} />
          <path className={styles.sealMid} d="M28 10 44 20v16L28 46 12 36V20L28 10Z" stroke="currentColor" opacity=".45" pathLength={1} />
          <path className={styles.sealInner} d="M35 20a11 11 0 1 0 0 16M21 14v28M27 12v8m0 16v8M33 15v5m0 16v5" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
        </svg>
      </div>
      <span>THE OFFICE ABOVE THE PIT</span>
    </footer>
  </div>;
}
