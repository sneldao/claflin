'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { usePaperSync } from '@/lib/trading/usePaperSync';
import { useLiveJournal } from '@/lib/trading/useLiveJournal';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { deskNoteOfTheDay } from '@/lib/desk-notes';
import { getBrokerMethod, PRACTICE_RETURN_PARAM, PRACTICE_RETURN_VALUE } from '@/lib/education';
import { EducationTopicTrigger } from './EducationTopic';
import { appliedTicketLine, deskNoteEducationTopic } from '@/lib/trading/voice-tools';
import { DESK_INSTRUMENTS, resolveDeskAlias } from '@/lib/trading/catalog';
import { LIVE_EXECUTION_ENABLED } from '@/lib/trading/domain';
import { rememberSlipDedication } from '@/lib/trading/desk-slips';
import { signalLine } from '@/lib/trading/line-signal';
import { MODE_HINTS } from '@/lib/desk/ui-copy';
import { ModeStamp } from './ModeStamp';
import type { DeskMark } from '@/lib/trading/marks-shared';
import type { HouseDeskId } from '@/lib/house';
import {
  loadDeskPresentation,
  parseViewQuery,
  saveDeskPresentation,
  shouldPreferCompactView,
  syncViewQuery,
  type DeskPresentation,
} from '@/lib/desk-presentation';
import { projectHettyToRoom } from '@/lib/room-view-projection';
import type { NightDeskView } from '@/lib/night-desk-fixtures';
import { TradeTicket } from './TradeTicket';
import { PaperLedger } from './PaperLedger';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { DeskInstrument } from './DeskInstrument';
import { DeskObjects, TapeMachine } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import styles from './WorkingDesk.module.css';

const NO_MARKS: DeskMark[] = [];

const RoomPresentation = dynamic(
  () => import('./RoomPresentation').then(m => m.RoomPresentation),
  { ssr: false },
);

function HettyDoorShell() {
  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" aria-busy="true">
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty Green <small>AI BROKER · BASE</small></h2>
        <span className={styles.callLine}>DIRECT LINE</span>
      </div>
      <p className={styles.callNote}>Speak your instruction. Review it on the same ticket.</p>
      <p className={styles.callHint}>Say the trade — Hetty fills the ticket and reads it back before anything is filed.</p>
      <div className={styles.callActions}><button type="button" className={styles.callButton} disabled>Preparing the line…</button></div>
      <p className={styles.callFoot}>Mic stays off until you talk — nothing is filed without your review.</p>
    </section>
  );
}

const HettyCall = dynamic(() => import('./HettyCall').then(m => m.HettyCall), { ssr: false, loading: HettyDoorShell });

function DeskNoteLine({ deskId, muted }: { deskId: HouseDeskId; muted?: boolean }) {
  const note = deskNoteOfTheDay(deskId);
  const topic = deskNoteEducationTopic(deskId);
  return (
    <p className={styles.deskNote} data-muted={muted ? 'true' : 'false'}>
      {note.term && <span className={styles.deskNoteTerm}>A word of the house — </span>}
      {note.text}
      {note.attribution && <span className={styles.deskNoteSource}> — {note.attribution}</span>}
      {topic && !muted && (
        <>
          {' '}
          <EducationTopicTrigger topic={topic} label="Read the house explanation" className={styles.deskNoteExplain} />
        </>
      )}
    </p>
  );
}

type Desk = ReturnType<typeof useTradingDesk>;

export function HettyDeskSurface({ desk }: { desk: Desk }) {
  const auth = useDeskAuth();
  const { importAnonymousRecords, anonymousCount, importStatus } = usePaperSync(desk);
  const liveJournal = useLiveJournal(desk.deskId);
  const [hettyLive, setHettyLive] = useState(false);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [hettySaid, setHettySaid] = useState<string | null>(null);
  const [practiceReturn, setPracticeReturn] = useState(false);
  const [presentation, setPresentation] = useState<DeskPresentation>('compact');
  const viewQueryApplied = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(PRACTICE_RETURN_PARAM) !== PRACTICE_RETURN_VALUE) return;
    setPracticeReturn(true);
    params.delete(PRACTICE_RETURN_PARAM);
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || '#instruction'}`;
    window.history.replaceState({}, '', next);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQuery = parseViewQuery(new URLSearchParams(window.location.search).get('view'));
    if (!viewQueryApplied.current && fromQuery) {
      viewQueryApplied.current = true;
      setPresentation(fromQuery);
      saveDeskPresentation(window.localStorage, 'hetty', fromQuery);
      syncViewQuery(fromQuery);
      return;
    }
    const stored = loadDeskPresentation(window.localStorage, 'hetty', {
      preferCompactWhenUnset: shouldPreferCompactView(),
    });
    setPresentation(stored);
    syncViewQuery(stored);
  }, []);
  const handleLiveChange = useCallback((live: boolean) => { setHettyLive(live); if (!live) { setSpoken(null); setHettySaid(null); } }, []);
  const [liveMode, setLiveMode] = useState(LIVE_EXECUTION_ENABLED);
  useEffect(() => { if (!desk.open) setHettyLive(false); }, [desk.open]);
  const handleUserSpoken = useCallback((text: string) => {
    setSpoken(text);
    rememberSlipDedication('user', text);
  }, []);
  const handleAgentSpoken = useCallback((text: string) => {
    setHettySaid(text);
    rememberSlipDedication('agent', text);
  }, []);
  const marks = useReferenceMarks(desk.deskId);
  const hettyMethod = getBrokerMethod('hetty');
  const foreground = desk.foreground;
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [roomFocus, setRoomFocus] = useState<{ foreground: typeof foreground.kind; view: NightDeskView } | null>(null);
  const roomView = presentation === 'room';

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
    if (desk.state.draft.side === 'sell') {
      desk.edit({ instrumentId, side: 'sell', unit: 'token', amount: '' });
    } else {
      desk.edit({ instrumentId, side: 'buy', unit: 'USDC', amount: '' });
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    document.getElementById('amount')?.focus({ preventScroll: true });
  };

  const sayToDesk = useCallback((phrase: string) => {
    if (phrase === 'buy $25 of Apple') {
      const apple = resolveDeskAlias('apple');
      if (apple?.quoteSupported) {
        desk.edit({ instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '25' });
        handleUserSpoken(phrase);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }
    }
    signalLine();
  }, [desk, handleUserSpoken]);

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

  const setMode = useCallback((mode: DeskPresentation) => {
    setPresentation(mode);
    if (mode === 'compact') setRoomFocus(null);
    if (typeof window !== 'undefined') saveDeskPresentation(window.localStorage, 'hetty', mode);
    syncViewQuery(mode);
  }, []);

  const roomProjection = useMemo(() => projectHettyToRoom({
    stage: desk.state.stage,
    foregroundKind: foreground.kind,
    reviewing: reviewActive,
  }), [desk.state.stage, foreground.kind, reviewActive]);
  const roomSceneView = roomProjection.view === 'desk' && roomFocus?.foreground === foreground.kind
    ? roomFocus.view
    : roomProjection.view;

  const onRoomView = (view: NightDeskView) => {
    setRoomFocus({ foreground: foreground.kind, view });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (view === 'review') {
      document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior });
      return;
    }
    if (view === 'ledger') {
      document.getElementById('paper-ledger')?.scrollIntoView({ block: 'start', behavior });
      return;
    }
    if (view === 'evidence') {
      document.getElementById('on-desk')?.scrollIntoView({ block: 'start', behavior });
    }
  };

  const work = (
    <>
      <ModeStamp
        live={liveMode}
        presentation={presentation}
        hint={liveMode ? MODE_HINTS.hettyLive : MODE_HINTS.hettyPaper}
        market="COINBASE TOKENIZED STOCKS · BASE"
      >
        {liveMode && (
          <span>{auth.walletAddress ? `Wallet ${auth.walletAddress.slice(0, 6)}…${auth.walletAddress.slice(-4)} · Base` : 'Sign in and link a wallet to trade.'}</span>
        )}
        {sharedLoaded && <span role="status">Shared instruction loaded.</span>}
        {practiceReturn && <span role="status">Back from practice — instruction unchanged.</span>}
        {!roomView && (
          <div className={styles.presentationToggle} role="group" aria-label="Desk presentation">
            <button type="button" className={styles.presentationButton} aria-pressed={false} onClick={() => setMode('room')}>Room</button>
            <button type="button" className={styles.presentationButton} aria-pressed={true} onClick={() => setMode('compact')}>Compact</button>
          </div>
        )}
      </ModeStamp>
      {desk.state.stage === 'draft' && !desk.state.draft.instrumentId && (
        <div className={styles.introduction} id="introduction">
          <p className={styles.eyebrow}>THE OFFICE ABOVE THE PIT</p>
          <h1>The desk <span>hears you.</span></h1>
          <p>No forms to learn. Say the trade — Hetty writes the slip, reads it back, and waits.</p>
          <div className={styles.voiceSay} role="group" aria-label="Things you can say — tap one and the desk hears it">
            <span className={styles.voiceSayLead}>Say it — or tap it</span>
            <button type="button" onClick={() => sayToDesk('buy $25 of Apple')}>“buy $25 of Apple”</button>
            <button type="button" onClick={() => sayToDesk('what’s moving on the tape?')}>“what’s moving on the tape?”</button>
            <button type="button" onClick={() => sayToDesk('explain the estimate before I decide')}>“explain the estimate before I decide”</button>
          </div>
        </div>
      )}
      <div className={styles.grid} data-review={reviewActive ? 'true' : 'false'} data-ledger="true" data-foreground={foreground.kind} data-live={hettyLive ? 'true' : 'false'} data-presentation={presentation}>
        {!roomView && (
          <>
            <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
            <DeskObjects />
          </>
        )}
        <TradeTicket desk={desk} liveMode={liveMode} onLiveModeChange={setLiveMode} spokenLine={spoken} hettyLine={hettyLive ? hettySaid : null} live={hettyLive} applied={hettyLive ? appliedTicketLine(desk.state, desk.foreground) : null} educationHandoff={practiceReturn} onLiveJournalChange={liveJournal.reload} />
        <PaperLedger desk={desk} liveEntries={liveJournal.entries} liveReady={liveJournal.ready} liveReconciling={liveJournal.reconciling} />
        <aside className={styles.support} aria-label="The Base desk’s direct line">
          <HettyCall desk={desk} liveMode={liveMode} onLiveChange={handleLiveChange} onUserSpoken={handleUserSpoken} onAgentSpoken={handleAgentSpoken} />
          {!roomView && (
            <div className={styles.instrumentShell} data-stage={instrumentStage}>
              <div className={styles.instrument} data-stage={instrumentStage}>
                <DeskInstrument eager poster="/desk-receiver.webp" stage={instrumentStage} label={instrumentLabel} reviewing={reviewActive} brokerName="Hetty" lineTargetId="hetty" />
              </div>
              {!hettyLive && (
                <p className={styles.receiverCue}>
                  Lift the receiver — or press <kbd>H</kbd>. Speak first; the form is only how the desk writes it down.
                </p>
              )}
            </div>
          )}
          <div className={styles.deskInscription}>
            <span>The pit is downstairs.</span>
            <p>This desk is for deciding.</p>
            <DeskNoteLine deskId={desk.deskId} muted={hettyLive} />
          </div>
          <details className={styles.aboutHetty}>
            <summary>About Hetty Green</summary>
            <div className={styles.popoverPanel}>
              <p>Hetty Green is an AI character inspired by the historical financier, not the person herself or a licensed human broker. She helps make a decision clear. She does not make it for you. {LIVE_EXECUTION_ENABLED ? 'She cannot sign or execute — the Execute button on your slip is yours alone.' : 'This release is paper-only; she cannot place a real order.'}</p>
              <p><strong>How she examines a question — {hettyMethod.lens}.</strong> Educational perspective only.</p>
              <ul>
                {hettyMethod.questions.map(question => <li key={question}>{question}</li>)}
              </ul>
              <p>{hettyMethod.boundary}</p>
            </div>
          </details>
        </aside>
      </div>
      {!roomView && (
        <>
          <div className={styles.tickerStation}>
            <TapeMachine />
            <TickerTape marks={marks.result?.marks ?? NO_MARKS} failed={marks.failed} stale={marks.stale} asOf={marks.result?.asOf} onSelect={loadInstrument} disabled={desk.state.stage === 'quoting'} />
          </div>
          <div id="on-desk"><DeskBoard desk={desk} marks={marks.result?.marks ?? NO_MARKS} stale={marks.stale} asOf={marks.result?.asOf} /></div>
        </>
      )}
      {roomView && (
        <div id="on-desk" className={styles.roomViewBoard}>
          <DeskBoard desk={desk} marks={marks.result?.marks ?? NO_MARKS} stale={marks.stale} asOf={marks.result?.asOf} />
        </div>
      )}
    </>
  );

  if (roomView) {
    return (
      <RoomPresentation
        desk={desk.activeDesk}
        stage={roomProjection.stage}
        view={roomSceneView}
        onView={onRoomView}
        presentation={presentation}
        onPresentation={setMode}
        onSwitchDesk={desk.switchDesk}
        onLeaveDesk={desk.leaveDesk}
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
      lineLive={hettyLive}
      deskStage={desk.state.stage}
      onSwitchDesk={desk.switchDesk}
      showPaperImport
      anonymousCount={anonymousCount}
      importStatus={importStatus}
      onImportAnonymous={() => { void importAnonymousRecords(); }}
      onLeaveDesk={desk.leaveDesk}
    >
      {work}
    </DeskRoom>
  );
}
