'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DeskInstrument } from './DeskInstrument';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { JesseTicket } from './JesseTicket';
import { JesseLedger } from './JesseLedger';
import { JesseCommandBar } from './JesseCommandBar';
import { JesseCall } from './JesseCall';
import { useJesseDesk } from '@/lib/solana/useJesseDesk';
import type { DeskPresentation } from '@/lib/solana/contracts';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { bindFilePaperCommand, parseJesseSpeech } from '@/lib/jesse/speech';
import { projectJesseToRoom } from '@/lib/room-view-projection';
import {
  parseViewQuery,
  presentationStorageKey,
  shouldPreferCompactView,
  syncViewQuery,
} from '@/lib/desk-presentation';
import type { NightDeskView } from '@/lib/night-desk-fixtures';
import { signalLine } from '@/lib/trading/line-signal';
import styles from './WorkingDesk.module.css';

const RoomPresentation = dynamic(
  () => import('./RoomPresentation').then(m => m.RoomPresentation),
  { ssr: false },
);

type Desk = ReturnType<typeof useTradingDesk>;

const HEARABLE = {
  quote: 'buy 100 USDC of AAPLx',
  correct: 'make that 50 USDC of AAPLx',
  compare: 'compare NVIDIA xStock',
  refuse: 'buy DOGE on Solana',
} as const;

/**
 * Jesse's Solana desk — one controller; Room and Compact are views only (§4.7).
 */
export function JesseDeskSurface({ desk }: { desk: Desk }) {
  const jesse = useJesseDesk();
  const [spoken, setSpoken] = useState<string | null>(null);
  const [heardNote, setHeardNote] = useState<string | null>(null);
  const [jesseLive, setJesseLive] = useState(false);
  const viewQueryApplied = useRef(false);

  const presentationMode = jesse.state.presentation.mode;
  const roomView = presentationMode === 'room';

  useEffect(() => {
    if (viewQueryApplied.current) return;
    if (typeof window === 'undefined') return;
    const fromQuery = parseViewQuery(new URLSearchParams(window.location.search).get('view'));
    if (fromQuery) {
      viewQueryApplied.current = true;
      jesse.setPresentationMode(fromQuery);
      syncViewQuery(fromQuery);
      return;
    }
    const stored = window.localStorage.getItem(presentationStorageKey('jesse'));
    if (!stored && shouldPreferCompactView()) {
      viewQueryApplied.current = true;
      jesse.setPresentationMode('compact');
      syncViewQuery('compact');
      return;
    }
    viewQueryApplied.current = true;
    syncViewQuery(presentationMode);
  }, [jesse, presentationMode]);

  const reviewActive = jesse.foreground.kind === 'quotation'
    || jesse.foreground.kind === 'receipt'
    || jesse.foreground.kind === 'archive';
  const instrumentStage = jesseLive
    ? (jesse.inFlight === 'quote' ? 'conversation' : reviewActive ? 'confirmation' : 'conversation')
    : jesse.inFlight === 'quote'
      ? 'conversation'
      : reviewActive
        ? 'confirmation'
        : 'arrival';
  const selected = SOLANA_INSTRUMENTS.find(s => s.id === jesse.state.draft.instrumentId);
  const instrumentLabel = jesse.foreground.kind === 'missing'
    ? 'RECORD UNAVAILABLE'
    : jesse.foreground.kind === 'archive'
      ? 'FILED RECORD · READ ONLY'
      : jesseLive
        ? (selected ? `${selected.symbol} · ON THE LINE` : 'JESSE · ON THE LINE')
        : selected
          ? `${selected.symbol} · ${jesse.foreground.kind === 'pending' || jesse.inFlight === 'quote' ? 'REQUESTING ESTIMATE' : jesse.foreground.kind === 'quotation' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
          : 'JESSE · SOLANA PAPER';

  const roomProjection = useMemo(() => projectJesseToRoom({
    stage: jesse.state.stage,
    presentation: jesse.state.presentation,
    foreground: jesse.foreground,
    hasComparison: Boolean(jesse.state.comparison),
    inFlight: jesse.inFlight,
  }), [jesse.state.stage, jesse.state.presentation, jesse.foreground, jesse.state.comparison, jesse.inFlight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'h' && e.key !== 'H') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      signalLine();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sayToDesk = useCallback(async (phrase: string) => {
    setSpoken(phrase);
    setHeardNote(null);
    let parsed = parseJesseSpeech(phrase, jesse.state.draft);
    parsed = bindFilePaperCommand(parsed, jesse.state.quote?.id ?? null);
    if (!parsed.command) {
      setHeardNote('I didn’t catch a supported xStock instruction. Try “buy 100 USDC of AAPLx”.');
      signalLine();
      return;
    }
    const result = await jesse.run(parsed.command);
    setHeardNote(result.spokenText);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [jesse]);

  const setMode = (mode: DeskPresentation) => {
    jesse.setPresentationMode(mode);
    syncViewQuery(mode);
  };

  const onRoomView = (view: NightDeskView) => {
    if (view === 'evidence') {
      const existing = jesse.state.comparison;
      if (existing) {
        void jesse.run({ type: 'focus', target: 'evidence', objectId: existing.id });
        return;
      }
      void jesse.compare().then(() => {
        void jesse.run({ type: 'focus', target: 'evidence', objectId: null });
      });
      return;
    }
    if (view === 'review') {
      void jesse.run({ type: 'focus', target: 'instruction', objectId: jesse.state.quote?.id ?? null });
      document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (view === 'ledger') {
      void jesse.run({ type: 'focus', target: 'record', objectId: null });
      document.getElementById('paper-ledger')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    void jesse.run({ type: 'focus', target: 'desk', objectId: null });
  };

  const navExtras = (
    <>
      <a href="#instruction">Your ticket</a>
      <a href="#jesse-line">The line</a>
      <a href="#paper-ledger">Your record</a>
      <a href="#prestocks-title">PreStocks</a>
    </>
  );

  const lead: ReactNode = jesse.state.stage === 'draft' && !jesse.state.draft.instrumentId ? (
    <div className={styles.introduction} id="introduction-lead">
      <p className={styles.eyebrow}>JESSE LIVERMORE · SOLANA</p>
      <h1>Before you trade, <span>read the tape.</span></h1>
      <p>
        Ring the desk. Speak an xStock instruction — Backed Token-2022 mints on Solana, quoted through Jupiter.
        Room and Compact are the same work; only the layout changes.
      </p>
      <div className={styles.voiceSay} role="group" aria-label="Things you can say — tap one and the desk hears it">
        <span className={styles.voiceSayLead}>Say it — or tap it</span>
        <button type="button" onClick={() => { void sayToDesk(HEARABLE.quote); }}>“{HEARABLE.quote}”</button>
        <button type="button" onClick={() => { void sayToDesk(HEARABLE.correct); }}>“{HEARABLE.correct}”</button>
        <button type="button" onClick={() => { void sayToDesk(HEARABLE.compare); }}>“{HEARABLE.compare}”</button>
        <button type="button" onClick={() => { void sayToDesk(HEARABLE.refuse); }}>“{HEARABLE.refuse}”</button>
      </div>
      {heardNote && <p className={styles.callNote} role="status">{heardNote}</p>}
    </div>
  ) : null;

  const work = (
    <>
      <div className={styles.mode} data-presentation={presentationMode}>
        <strong>PAPER TRADING</strong>
        <span>Real Jupiter estimates, no real funds move. Kept in this browser.</span>
        {!roomView && (
          <div className={styles.presentationToggle} role="group" aria-label="Desk presentation">
            <button type="button" className={styles.presentationButton} aria-pressed={false} onClick={() => setMode('room')}>Room</button>
            <button type="button" className={styles.presentationButton} aria-pressed={true} onClick={() => setMode('compact')}>Compact</button>
          </div>
        )}
        <span className={styles.modeMarket}>XSTOCKS · SOLANA · JUPITER</span>
      </div>
      {lead}
      <div
        className={styles.grid}
        data-review={reviewActive ? 'true' : 'false'}
        data-ledger="true"
        data-foreground={jesse.foreground.kind}
        data-live={jesseLive ? 'true' : 'false'}
        data-presentation={presentationMode}
      >
        {!roomView && (
          <>
            <div className={styles.deskSurface} aria-hidden="true">
              <span>CLAFLIN &amp; CO. · SOLANA</span>
            </div>
            <DeskObjects />
          </>
        )}
        <JesseTicket jesse={jesse} spokenLine={spoken} />
        <JesseLedger jesse={jesse} />
        <aside className={styles.support} aria-label="Jesse’s desk">
          <JesseCall jesse={jesse} onLiveChange={setJesseLive} onUserSpoken={setSpoken} />
          <JesseCommandBar jesse={jesse} onHeard={setSpoken} />
          {!roomView && (
            <div className={styles.instrumentShell} data-stage={instrumentStage}>
              <div className={styles.instrument} data-stage={instrumentStage}>
                <DeskInstrument eager poster="/desk-receiver.webp" stage={instrumentStage} label={instrumentLabel} reviewing={reviewActive} />
              </div>
              {!jesseLive && (
                <p className={styles.receiverCue}>
                  Lift the receiver — or press <kbd>H</kbd>. Speak first; the form is only how the desk writes it down.
                </p>
              )}
            </div>
          )}
          <div className={styles.deskInscription}>
            <span>The pit is downstairs.</span>
            <p>This desk is for deciding.</p>
          </div>
        </aside>
      </div>
    </>
  );

  if (roomView) {
    return (
      <RoomPresentation
        desk={desk.activeDesk}
        stage={roomProjection.stage}
        view={roomProjection.view}
        onView={onRoomView}
        presentation={presentationMode}
        onPresentation={setMode}
        onSwitchDesk={desk.switchDesk}
        navExtras={navExtras}
      >
        {work}
      </RoomPresentation>
    );
  }

  return (
    <DeskRoom
      deskId={desk.deskId}
      activeDesk={desk.activeDesk}
      open
      lineLive={jesseLive}
      deskStage={jesse.state.stage}
      onSwitchDesk={desk.switchDesk}
      navExtras={navExtras}
    >
      {work}
    </DeskRoom>
  );
}
