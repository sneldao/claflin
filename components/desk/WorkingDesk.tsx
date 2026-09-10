'use client';

import Link from 'next/link';
import { HOUSE } from '@/lib/house';
import type { HouseDeskId } from '@/lib/house';
import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { HouseMark } from './HouseMark';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeTicket } from './TradeTicket';
import { PaperLedger } from './PaperLedger';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { DeskInstrument } from './DeskInstrument';
import { BrokerageRoom, DeskObjects, TapeMachine } from './BrokerageRoom';
import { HouseDirectory } from './HouseDirectory';
import { ClosedDesk } from './ClosedDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { usePaperSync } from '@/lib/trading/usePaperSync';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { useRoomTone } from '@/lib/desk-tone';
import { deskNoteOfTheDay } from '@/lib/desk-notes';
import { getBrokerMethod } from '@/lib/education';
import { appliedTicketLine } from '@/lib/trading/voice-tools';
import { DESK_INSTRUMENTS, resolveDeskAlias } from '@/lib/trading/catalog';
import { LIVE_EXECUTION_ENABLED } from '@/lib/trading/domain';
import type { DeskMark } from '@/lib/trading/marks-shared';
import styles from './WorkingDesk.module.css';

/* Stable empty reference: `marks.result?.marks ?? []` inline would mint a new
   array every render and defeat the memo on TickerTape/DeskBoard. */
const NO_MARKS: DeskMark[] = [];

// Three.js (~600KB) and the ElevenLabs SDK are decorative/session-only —
// lazy-loaded so the desk's first paint stays light.
function HettyDoorShell() {
  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" aria-busy="true">
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty Green <small>AI BROKER · BASE</small></h2>
        <span className={styles.callLine}>DIRECT LINE</span>
      </div>
      <p className={styles.callNote}>Speak your instruction. Review it on the same ticket.</p>
      <div className={styles.callActions}><button type="button" className={styles.callButton} disabled>Preparing the line…</button></div>
      <p className={styles.callFoot}>The microphone stays off until you ring.</p>
    </section>
  );
}

const HettyCall = dynamic(() => import('./HettyCall').then(m => m.HettyCall), { ssr: false, loading: HettyDoorShell });

/** A quiet line from the era — one note of the day, never an instruction to trade. */
function DeskNoteLine({ deskId, muted }: { deskId: HouseDeskId; muted?: boolean }) {
  const note = deskNoteOfTheDay(deskId);
  return (
    <p className={styles.deskNote} data-muted={muted ? 'true' : 'false'}>
      {note.term && <span className={styles.deskNoteTerm}>A word of the house — </span>}
      {note.text}
      {note.attribution && <span className={styles.deskNoteSource}> — {note.attribution}</span>}
    </p>
  );
}

export function WorkingDesk() {
  const desk = useTradingDesk();
  const auth = useDeskAuth();
  const { importAnonymousRecords, anonymousCount } = usePaperSync(desk);
  const [hettyLive, setHettyLive] = useState(false);
  // Both sides of the line, captioned on the blotter: the caller's words and
  // Hetty's replies. Cleared when the line drops — the ticket returns to
  // being the caller's own surface.
  const [spoken, setSpoken] = useState<string | null>(null);
  const [hettySaid, setHettySaid] = useState<string | null>(null);
  /* The line owns its own lifecycle: HettyCall remounts its conversation
     after every terminal event and keeps its notes through the remount.
     The desk only mirrors whether a call is live, and clears the captions
     when it ends — the ticket returns to being the caller's own surface. */
  const handleLiveChange = useCallback((live: boolean) => { setHettyLive(live); if (!live) { setSpoken(null); setHettySaid(null); } }, []);
  /* Paper or live: one desk-level mode so the banner, the ticket and the
     voice line all speak the same boundary. Live exists only behind the
     release gate; the caller switches it on the slip. */
  const [liveMode, setLiveMode] = useState(LIVE_EXECUTION_ENABLED);
  useEffect(() => { if (!desk.open) setHettyLive(false); }, [desk.open]);
  const handleUserSpoken = useCallback((text: string) => setSpoken(text), []);
  const handleAgentSpoken = useCallback((text: string) => setHettySaid(text), []);
  const tone = useRoomTone(hettyLive);
  // One reference-marks fetch for the whole desk: the tape displays it, the
  // working tray compares against it — a single honest reading of the room.
  const marks = useReferenceMarks(desk.deskId);
  const open = desk.open;
  const hettyMethod = getBrokerMethod('hetty');
  const foreground = desk.foreground;
  /* Shells stay: an empty ledger is a ruled slip, an empty tray is a pinboard
     suggestion — failure and arrival share one place each. */
  const hasTray = open;
  const hasLedger = open;
  const [sharedLoaded, setSharedLoaded] = useState(false);

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
  // Announced once, so a shared arrival never reads as silence.
  /* The shared arrival flag is intentionally synchronized in this mount effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
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
    setSharedLoaded(true);
    document.getElementById('instruction')?.scrollIntoView({ block: 'start' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */
  /* When Hetty's estimate lands mid-call, the slip comes to the caller — the
     room watches the receiver, but the decision happens on the paper. */
  const prevForegroundRef = useRef(foreground.kind);
  useEffect(() => {
    const prev = prevForegroundRef.current;
    prevForegroundRef.current = foreground.kind;
    if (!hettyLive || foreground.kind !== 'quotation' || prev === 'quotation') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [hettyLive, foreground.kind]);
  const selected = DESK_INSTRUMENTS.find(s => s.id === (foreground.instrumentId ?? ''));
  const reviewActive = foreground.kind === 'quotation' || foreground.kind === 'receipt' || foreground.kind === 'archive';
  const instrumentStage = hettyLive
    ? 'conversation'
    : reviewActive
      ? 'confirmation'
      : 'arrival';
  const instrumentLabel = hettyLive
    ? 'HETTY — ON THE LINE'
    : foreground.kind === 'missing'
      ? 'RECORD UNAVAILABLE'
      : foreground.kind === 'archive'
      ? 'FILED RECORD · READ ONLY'
      : selected
        ? `${selected.symbol.toUpperCase()} · ${foreground.kind === 'pending' ? 'REQUESTING ESTIMATE' : foreground.kind === 'quotation' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
        : 'PAPER TRADING / NO LIVE ORDERS';

  const loadInstrument = (instrumentId: string) => {
    /* Tape loads the mark, not a stale figure: keep the side, clear the
       amount so the next quantity lands in the right unit. */
    if (desk.state.draft.side === 'sell') {
      desk.edit({ instrumentId, side: 'sell', unit: 'token', amount: '' });
    } else {
      desk.edit({ instrumentId, side: 'buy', unit: 'USDC', amount: '' });
    }
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
            {anonymousCount > 0 && (
              <button type="button" className={styles.authLink} onClick={importAnonymousRecords} title={`Import ${anonymousCount} paper ${anonymousCount === 1 ? 'record' : 'records'} left on this browser before you signed in`}>
                Import {anonymousCount} paper {anonymousCount === 1 ? 'record' : 'records'}
              </button>
            )}
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
          ? liveMode
            ? <><strong data-live="true">LIVE EXECUTION</strong><span>Real tokens and real USDC will move.{auth.walletAddress ? ` Wallet ${auth.walletAddress.slice(0, 6)}…${auth.walletAddress.slice(-4)} · Base` : ' Sign in and link a wallet to trade.'}</span>{sharedLoaded && <span role="status">Shared instruction loaded.</span>}<span className={styles.modeMarket}>COINBASE TOKENIZED STOCKS · BASE</span></>
            : <><strong>PAPER TRADING</strong><span>Real estimates. No real funds move.{LIVE_EXECUTION_ENABLED ? ' Live execution can be switched on at the slip.' : ''}</span>{sharedLoaded && <span role="status">Shared instruction loaded.</span>}<span className={styles.modeMarket}>COINBASE TOKENIZED STOCKS · BASE</span></>
          : <><strong>PLANNED DESK</strong><span>Not open for quotation or recording.</span><span className={styles.modeMarket}>{desk.activeDesk.market.toUpperCase()} · {desk.activeDesk.name.toUpperCase()}</span></>}
      </div>
      <div className={styles.grid} data-review={open && reviewActive ? 'true' : 'false'} data-ledger={hasLedger ? 'true' : 'false'} data-foreground={open ? foreground.kind : undefined} data-live={hettyLive ? 'true' : 'false'}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        {open ? <TradeTicket desk={desk} liveMode={liveMode} onLiveModeChange={setLiveMode} spokenLine={spoken} hettyLine={hettyLive ? hettySaid : null} live={hettyLive} applied={hettyLive ? appliedTicketLine(desk.state, desk.foreground) : null} /> : <ClosedDesk desk={desk.activeDesk} onReturn={() => desk.switchDesk('hetty')} />}
        {hasLedger && <PaperLedger desk={desk} />}
        <aside className={styles.support} aria-label={open ? 'The Base desk’s direct line' : 'A closed desk'}>
          {open && <HettyCall desk={desk} liveMode={liveMode} onLiveChange={handleLiveChange} onUserSpoken={handleUserSpoken} onAgentSpoken={handleAgentSpoken} />}
          <div className={styles.instrumentShell} data-stage={open ? instrumentStage : 'arrival'}>
            <div className={styles.instrument} data-stage={open ? instrumentStage : 'arrival'}><DeskInstrument eager poster="/desk-receiver.webp" stage={open ? instrumentStage : 'arrival'} label={open ? instrumentLabel : `PLANNED · ${desk.activeDesk.market.toUpperCase()}`} reviewing={open && reviewActive} /></div>
          </div>
          <div className={styles.deskInscription}>
            <span>The pit is downstairs.</span>
            <p>This desk is for deciding.</p>
            <DeskNoteLine deskId={desk.deskId} muted={!open || hettyLive} />
          </div>
          {open && <details className={styles.aboutHetty}>
            <summary>About Hetty Green</summary>
            <div className={styles.popoverPanel}>
              <p>Hetty Green is an AI character inspired by the historical financier, not the person herself or a licensed human broker. She helps make a decision clear. She does not make it for you. {LIVE_EXECUTION_ENABLED ? 'She cannot sign or execute — the Execute button on your slip is yours alone.' : 'This release is paper-only; she cannot place a real order.'}</p>
              <p><strong>How she examines a question — {hettyMethod.lens}.</strong> Educational perspective only.</p>
              <ul>
                {hettyMethod.questions.map(question => <li key={question}>{question}</li>)}
              </ul>
              <p>{hettyMethod.boundary}</p>
            </div>
          </details>}
        </aside>
      </div>
      {open && <div className={styles.tickerStation}>
        <TapeMachine />
        <TickerTape marks={marks.result?.marks ?? NO_MARKS} failed={marks.failed} stale={marks.stale} asOf={marks.result?.asOf} onSelect={loadInstrument} disabled={desk.state.stage === 'loading'} />
      </div>}
      {hasTray && <div id="on-desk"><DeskBoard desk={desk} marks={marks.result?.marks ?? NO_MARKS} stale={marks.stale} asOf={marks.result?.asOf} /></div>}
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
