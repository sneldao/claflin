'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { usePaperSync } from '@/lib/trading/usePaperSync';
import { useLiveJournal } from '@/lib/trading/useLiveJournal';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import { deskNoteOfTheDay } from '@/lib/desk-notes';
import { brokerTake } from '@/lib/desk/broker-take';
import { useMarketClock } from '@/lib/use-market-clock';
import { getBrokerMethod, PRACTICE_RETURN_PARAM, PRACTICE_RETURN_VALUE } from '@/lib/education';
import { EducationTopicTrigger } from './EducationTopic';
import { appliedTicketLine, deskNoteEducationTopic } from '@/lib/trading/voice-tools';
import { DESK_INSTRUMENTS, resolveDeskAlias } from '@/lib/trading/catalog';
import { LIVE_EXECUTION_ENABLED } from '@/lib/trading/domain';
import { rememberSlipDedication } from '@/lib/trading/desk-slips';
import { signalLine } from '@/lib/trading/line-signal';
import { LINE_FOOT, MARKET_LABELS, MODE_HINTS } from '@/lib/desk/ui-copy';
import { ModeStamp } from './ModeStamp';
import type { DeskMark } from '@/lib/trading/marks-shared';
import type { HouseDeskId } from '@/lib/house';
import type { DeskPresentation } from '@/lib/desk-presentation';
import { useDeskPresentation } from '@/lib/desk/use-desk-presentation';
import { useLineHotkey } from '@/lib/desk/use-line-hotkey';
import { scrollToDeskTarget } from '@/lib/desk/scroll-to';
import { carriedIntentNote } from '@/lib/desk/carried-note';
import { projectHettyToRoom } from '@/lib/room-view-projection';
import type { NightDeskView } from '@/lib/night-desk-fixtures';
import { TradeTicket } from './TradeTicket';
import { PaperLedger } from './PaperLedger';
import { DeskBoard } from './DeskBoard';
import { TickerTape } from './TickerTape';
import { BlotterHearables } from './BlotterHearables';
import { RoomMarketClock } from './RoomMarketClock';
import { ReceiverShell } from './ReceiverShell';
import { DeskObjects, TapeMachine } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import styles from './WorkingDesk.module.css';
import ticker from "./DeskTicker.module.css";

const NO_MARKS: DeskMark[] = [];

const HETTY_HEARABLES = [
  'buy $25 of Apple',
  'what’s moving on the tape?',
  'explain the estimate before I decide',
] as const;

const RoomPresentation = dynamic(
  () => import('./RoomPresentation').then(m => m.RoomPresentation),
  { ssr: false },
);

function HettyDoorShell() {
  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" aria-busy="true">
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty Green <small>The Witch of Wall Street · AI broker on Base</small></h2>
        <span className={styles.callLine}>DIRECT LINE</span>
      </div>
      <p className={styles.callNote}>Speak your instruction. Review it on the same ticket.</p>
      <div className={styles.callActions}><button type="button" className={styles.callButton} disabled>Preparing the line…</button></div>
      <p className={styles.callFoot}>{LINE_FOOT}</p>
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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(PRACTICE_RETURN_PARAM) !== PRACTICE_RETURN_VALUE) return;
    setPracticeReturn(true);
    params.delete(PRACTICE_RETURN_PARAM);
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || '#instruction'}`;
    window.history.replaceState({}, '', next);
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
  const clock = useMarketClock();
  const take = brokerTake('hetty', marks.result?.marks ?? NO_MARKS, clock);
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
    /* Consume only the shared-instruction params — ?desk=/?view= stay honest. */
    const url = new URL(window.location.href);
    for (const key of ['intent', 'side', 'amount']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.toString());
    const instrument = resolveDeskAlias(raw);
    if (!desk.open || !instrument?.quoteSupported) return;
    const side = params.get('side') === 'sell' ? 'sell' : 'buy';
    const amount = (params.get('amount') ?? '').trim();
    const cleanAmount = /^(0|[1-9]\d*)(\.\d+)?$/.test(amount) ? amount : '';
    desk.edit(side === 'sell'
      ? { instrumentId: instrument.id, side: 'sell', unit: 'token', amount: cleanAmount }
      : { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: cleanAmount });
    setSharedLoaded(true);
    scrollToDeskTarget('instruction');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const prevForegroundRef = useRef(foreground.kind);
  useEffect(() => {
    const prev = prevForegroundRef.current;
    prevForegroundRef.current = foreground.kind;
    if (!hettyLive || foreground.kind !== 'quotation' || prev === 'quotation') return;
    scrollToDeskTarget('instruction');
  }, [hettyLive, foreground.kind]);

  /* ?record= rides the same URL contract as ?desk= — the conductor syncs
     the active session's record into the bar for every engine. */

  const carriedNote = carriedIntentNote(desk.entryIntent, desk.state.draft);
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
    scrollToDeskTarget('instruction', { focusId: 'amount' });
  };

  const sayToDesk = useCallback((phrase: string) => {
    if (phrase === 'buy $25 of Apple') {
      const apple = resolveDeskAlias('apple');
      if (apple?.quoteSupported) {
        desk.edit({ instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '25' });
        handleUserSpoken(phrase);
        scrollToDeskTarget('instruction');
        return;
      }
    }
    signalLine();
  }, [desk, handleUserSpoken]);

  useLineHotkey();

  const applyPresentation = useDeskPresentation('hetty', setPresentation);
  const setMode = useCallback((mode: DeskPresentation) => {
    if (mode === 'compact') setRoomFocus(null);
    applyPresentation(mode);
  }, [applyPresentation]);

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
    if (view === 'review') {
      scrollToDeskTarget('instruction');
      return;
    }
    if (view === 'ledger') {
      scrollToDeskTarget('paper-ledger');
      return;
    }
    if (view === 'evidence') {
      scrollToDeskTarget('on-desk');
    }
  };

  const draftEmpty = desk.state.stage === 'draft' && !desk.state.draft.instrumentId;
  const lineFirst = roomView && draftEmpty && !hettyLive;

  const work = (
    <>
      <ModeStamp
        live={liveMode}
        presentation={presentation}
        hint={liveMode ? MODE_HINTS.hettyLive : MODE_HINTS.hettyPaper}
        market={MARKET_LABELS.hetty}
      >
        {liveMode && (
          <span>{auth.walletAddress ? `Wallet ${auth.walletAddress.slice(0, 6)}…${auth.walletAddress.slice(-4)}` : 'Link a wallet to trade live.'}</span>
        )}
        {sharedLoaded && <span role="status">Shared instruction loaded.</span>}
        {practiceReturn && <span role="status">Back from practice.</span>}
        {!roomView && (
          <div className={styles.presentationToggle} role="group" aria-label="Desk presentation">
            <button type="button" className={styles.presentationButton} aria-pressed={false} onClick={() => setMode('room')}>Room</button>
            <button type="button" className={styles.presentationButton} aria-pressed={true} onClick={() => setMode('compact')}>Compact</button>
          </div>
        )}
      </ModeStamp>
      {roomView && <RoomMarketClock clock={clock} />}
      {!roomView && draftEmpty && (
        <div className={styles.introduction} id="introduction">
          <p className={styles.eyebrow}>THE OFFICE ABOVE THE PIT</p>
          <h1>The desk <span>hears you.</span></h1>
          <p>Say the trade. Hetty writes the slip.</p>
          <BlotterHearables lines={HETTY_HEARABLES} onSay={sayToDesk} />
        </div>
      )}
      <div
        className={styles.grid}
        data-review={reviewActive ? 'true' : 'false'}
        data-ledger="true"
        data-foreground={foreground.kind}
        data-live={hettyLive ? 'true' : 'false'}
        data-presentation={presentation}
        data-line-first={lineFirst ? 'true' : undefined}
      >
        {!roomView && (
          <>
            <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
            <DeskObjects />
          </>
        )}
        <aside className={styles.support} aria-label="The Base desk’s direct line">
          <HettyCall desk={desk} liveMode={liveMode} take={take} onLiveChange={handleLiveChange} onUserSpoken={handleUserSpoken} onAgentSpoken={handleAgentSpoken} />
          {lineFirst && <BlotterHearables lines={HETTY_HEARABLES} onSay={sayToDesk} />}
          <ReceiverShell
            stage={instrumentStage}
            label={instrumentLabel}
            reviewing={reviewActive}
            brokerName="Hetty"
            lineTargetId="hetty"
            live={hettyLive}
          />
          <div className={styles.deskInscription}>
            <span>The tape runs all night.</span>
            <p>The house keeps the record.</p>
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
        <TradeTicket
          desk={desk}
          liveMode={liveMode}
          onLiveModeChange={setLiveMode}
          spokenLine={spoken}
          hettyLine={hettyLive ? hettySaid : null}
          live={hettyLive}
          applied={hettyLive ? appliedTicketLine(desk.state, desk.foreground) : null}
          educationHandoff={practiceReturn}
          onLiveJournalChange={liveJournal.reload}
          carriedNote={carriedNote}
          blankSlip={lineFirst}
        />
        <PaperLedger desk={desk} liveEntries={liveJournal.entries} liveReady={liveJournal.ready} liveReconciling={liveJournal.reconciling} />
      </div>
      {!roomView && (
        <>
          <div className={ticker.tickerStation}>
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
