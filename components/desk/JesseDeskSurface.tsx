'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DeskObjects, TapeMachine } from './BrokerageRoom';
import { TickerTape } from './TickerTape';
import { DeskRoom } from './DeskRoom';
import { JesseTicket } from './JesseTicket';
import { JesseLedger } from './JesseLedger';
import { JesseCommandBar } from './JesseCommandBar';
import { JesseCall } from './JesseCall';
import { BlotterHearables } from './BlotterHearables';
import { RoomMarketClock } from './RoomMarketClock';
import { RoomTape } from './RoomTape';
import { ReceiverShell } from './ReceiverShell';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { offeringCoversDesk, offeringForId } from '@/lib/desk/offerings';
import type { CommandResult, JesseDraft, SolanaInstrumentId } from '@/lib/solana/contracts';
import { parseJesseUtterance, type JesseSpeechParse } from '@/lib/jesse/speech';
import {
  carriedMarks,
  handMarks,
  mergeProvenance,
  type SlipProvenance,
} from '@/lib/desk/slip-provenance';
import { provenanceFromParse } from '@/lib/jesse/slip-provenance';
import { trackSuperseded, type SupersededSlip } from '@/lib/desk/superseded';
import { JESSE_VOCAB, slipOneLine } from '@/lib/desk/written-slip';
import { draftIntent } from '@/lib/jesse/draft-intent';
import { projectJesseToRoom } from '@/lib/room-view-projection';
import { useDeskPresentation } from '@/lib/desk/use-desk-presentation';
import { useLineHotkey } from '@/lib/desk/use-line-hotkey';
import { scrollToDeskTarget } from '@/lib/desk/scroll-to';
import { carriedIntentNote } from '@/lib/desk/carried-note';
import type { NightDeskView } from '@/lib/night-desk-fixtures';
import { signalLine } from '@/lib/trading/line-signal';
import { MARKET_LABELS, MODE_HINTS } from '@/lib/desk/ui-copy';
import { ModeStamp } from './ModeStamp';
import { useReferenceMarks } from '@/lib/trading/useReferenceMarks';
import type { DeskMark } from '@/lib/trading/marks-shared';
import { brokerTake } from '@/lib/desk/broker-take';
import { useMarketClock } from '@/lib/use-market-clock';
import styles from './WorkingDesk.module.css';
import ticker from './DeskTicker.module.css';

const NO_MARKS: DeskMark[] = [];

const RoomPresentation = dynamic(
  () => import('./RoomPresentation').then(m => m.RoomPresentation),
  { ssr: false },
);

type Desk = ReturnType<typeof useTradingDesk>;

const HEARABLE_LINES = [
  'buy 100 USDC of AAPLx',
  'make that 50 USDC of AAPLx',
  'compare NVIDIA xStock',
  'buy DOGE on Solana',
] as const;

/**
 * Jesse's Solana desk — one controller; Room and Compact are views only (§4.7).
 */
export function JesseDeskSurface({ desk }: { desk: Desk }) {
  const jesse = desk.jesse;
  const [spoken, setSpoken] = useState<string | null>(null);
  const [heardNote, setHeardNote] = useState<string | null>(null);
  const [jesseLive, setJesseLive] = useState(false);
  const offeringApplied = useRef<string | null>(null);

  /* Slip provenance: where each written value came from. Marks render only
     while the slip still holds the value they were recorded for. */
  const [provenance, setProvenance] = useState<SlipProvenance>({});
  const [superseded, setSuperseded] = useState<SupersededSlip[]>([]);

  const marks = useReferenceMarks('jesse');
  const clock = useMarketClock();
  const deskMarks = marks.result?.marks ?? NO_MARKS;
  /* Lamp channel: the shared scene warms while the tape is fresh. */
  const tapeAt = marks.result?.asOf ?? null;
  const tapeState = marks.failed || marks.stale ? 'stale' : tapeAt !== null ? 'fresh' : undefined;
  const take = brokerTake('jesse', deskMarks, clock);
  const selectedMark = deskMarks.find(mark => mark.instrumentId === jesse.state.draft.instrumentId) ?? null;

  const presentationMode = jesse.state.presentation.mode;
  const roomView = presentationMode === 'room';
  const draftEmpty = !jesse.state.draft.instrumentId
    && !jesse.state.draft.side
    && !jesse.state.draft.amount
    && jesse.foreground.kind === 'draft'
    && jesse.state.stage === 'draft';
  /* Room: the line owns attention whenever the slip is not under review —
     a filled draft still reads as a desk you ring, not a DEX form. */
  const reviewActive = jesse.foreground.kind === 'quotation'
    || jesse.foreground.kind === 'receipt'
    || jesse.foreground.kind === 'archive';
  const lineLed = roomView && !reviewActive && jesse.foreground.kind !== 'missing';
  const blankSlip = lineLed && draftEmpty && !jesseLive;
  /* Under review the room stays a room — the slip leads, on the desk. */
  const slipLed = roomView && reviewActive;

  const draftFieldsEmpty = !jesse.state.draft.instrumentId
    && !jesse.state.draft.side
    && !jesse.state.draft.amount;

  /* A fully empty slip carries no provenance. */
  useEffect(() => {
    if (draftFieldsEmpty) {
      setProvenance(prev => (Object.keys(prev).length > 0 ? {} : prev));
    }
  }, [draftFieldsEmpty]);

  /* Fresh estimates strike the old price through on the same slip. */
  const prevSlipRef = useRef<{ quote: typeof jesse.state.quote; stage: typeof jesse.state.stage }>({
    quote: jesse.state.quote,
    stage: jesse.state.stage,
  });
  useEffect(() => {
    const before = prevSlipRef.current;
    prevSlipRef.current = { quote: jesse.state.quote, stage: jesse.state.stage };
    setSuperseded(prev => trackSuperseded(prev, {
      quoteId: before.quote?.id ?? null,
      line: before.quote ? slipOneLine(before.quote, JESSE_VOCAB) : null,
      stage: before.stage,
    }, {
      quoteId: jesse.state.quote?.id ?? null,
      stage: jesse.state.stage,
      draftEmpty: draftFieldsEmpty,
    }, Date.now()));
  }, [jesse.state.quote, jesse.state.stage, draftFieldsEmpty]);

  const recordParsed = useCallback((parse: JesseSpeechParse, result: CommandResult, priorDraft: JesseDraft) => {
    if (result.status === 'stale') return;
    if (parse.command?.type !== 'draft' && parse.command?.type !== 'clarify') return;
    setProvenance(prev => mergeProvenance(prev, provenanceFromParse(parse, priorDraft)));
  }, []);

  const onLineApplied = useCallback((partial: SlipProvenance) => {
    setProvenance(prev => mergeProvenance(prev, partial));
  }, []);

  const handEdit = useCallback((partial: Partial<JesseDraft>, field: 'instrument' | 'side' | 'amount' | 'units') => {
    setProvenance(prev => mergeProvenance(prev, handMarks(partial, field)));
    return jesse.edit(partial, field);
  }, [jesse]);

  /* Inline slip edits: a complete intent on a quoted slip re-prices exactly
     like the spoken "make that 50"; otherwise it's a plain draft edit. */
  const slipEdit = useCallback((partial: Partial<JesseDraft>, field: 'instrument' | 'side' | 'amount' | 'units') => {
    setProvenance(prev => mergeProvenance(prev, handMarks(partial, field)));
    const intent = draftIntent({ ...jesse.state.draft, ...partial });
    if (jesse.foreground.kind === 'quotation' && intent) {
      void jesse.run({ type: 'draft', intent, quote: true });
      return;
    }
    void jesse.edit(partial, field);
  }, [jesse]);

  const setMode = useDeskPresentation('jesse', mode => { jesse.setPresentationMode(mode); }, jesse.historyReady);

  const entryOffering = desk.entryOfferingId ? offeringForId(desk.entryOfferingId) : null;
  const entryInstrumentId = entryOffering
    && offeringCoversDesk(entryOffering, 'jesse')
    && SOLANA_INSTRUMENTS.some(instrument => instrument.id === entryOffering.instrumentId)
    ? entryOffering.instrumentId as SolanaInstrumentId
    : null;
  const entryIntent = desk.entryIntent;

  useEffect(() => {
    const key = `${entryInstrumentId ?? ''}|${entryIntent?.side ?? ''}|${entryIntent?.amount ?? ''}`;
    if (key === '||') {
      offeringApplied.current = null;
      return;
    }
    if (!jesse.historyReady || offeringApplied.current === key) return;
    offeringApplied.current = key;
    const partial: Partial<JesseDraft> = {};
    if (entryInstrumentId && jesse.state.draft.instrumentId !== entryInstrumentId) partial.instrumentId = entryInstrumentId;
    if (entryIntent?.side) partial.side = entryIntent.side;
    if (entryIntent?.amount) partial.amount = entryIntent.amount;
    if (Object.keys(partial).length === 0) return;
    setProvenance(prev => mergeProvenance(prev, carriedMarks(partial)));
    void jesse.edit(partial, partial.side ? 'side' : partial.amount ? 'amount' : 'instrument');
  }, [entryInstrumentId, entryIntent, jesse]);

  const carriedNote = carriedIntentNote(entryIntent, jesse.state.draft);
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
          ? `${selected.symbol} · ${jesse.foreground.kind === 'pending' || jesse.inFlight === 'quote' ? 'REQUESTING ESTIMATE' : jesse.foreground.kind === 'quotation' ? 'ESTIMATE ON THE SLIP' : 'SOLANA DESK'}`
          : 'JESSE · SOLANA DESK';

  const roomProjection = useMemo(() => projectJesseToRoom({
    stage: jesse.state.stage,
    presentation: jesse.state.presentation,
    foreground: jesse.foreground,
    hasComparison: Boolean(jesse.state.comparison),
    inFlight: jesse.inFlight,
  }), [jesse.state.stage, jesse.state.presentation, jesse.foreground, jesse.state.comparison, jesse.inFlight]);

  useLineHotkey();

  const sayToDesk = useCallback(async (phrase: string) => {
    setSpoken(phrase);
    setHeardNote(null);
    const priorDraft = jesse.state.draft;
    const parsed = parseJesseUtterance(phrase, priorDraft, jesse.state.quote?.id ?? null);
    if (!parsed.command) {
      setHeardNote('I didn’t catch a supported xStock instruction. Try “buy 100 USDC of AAPLx”.');
      signalLine();
      return;
    }
    const result = await jesse.run(parsed.command);
    recordParsed(parsed, result, priorDraft);
    setHeardNote(result.spokenText);
    scrollToDeskTarget('instruction');
  }, [jesse, recordParsed]);

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
      scrollToDeskTarget('instruction');
      return;
    }
    if (view === 'ledger') {
      void jesse.run({ type: 'focus', target: 'record', objectId: null });
      scrollToDeskTarget('paper-ledger');
      return;
    }
    void jesse.run({ type: 'focus', target: 'desk', objectId: null });
  };

  const blotter = (
    <BlotterHearables
      lines={HEARABLE_LINES}
      onSay={line => { void sayToDesk(line); }}
      note={heardNote ? <p className={styles.callNote} role="status">{heardNote}</p> : null}
    />
  );

  const lead: ReactNode = !roomView && draftEmpty ? (
    <div className={styles.introduction} id="introduction-lead">
      <p className={styles.eyebrow}>JESSE LIVERMORE · SOLANA</p>
      <h1>Before you trade, <span>read the tape.</span></h1>
      <p>Say the trade. Jesse writes the slip.</p>
      {blotter}
    </div>
  ) : null;

  const work = (
    <>
      <ModeStamp
        live={false}
        presentation={presentationMode}
        hint={MODE_HINTS.jessePaper}
        market={MARKET_LABELS.jesse}
      >
        {!roomView && (
          <div className={styles.presentationToggle} role="group" aria-label="Desk presentation">
            <button type="button" className={styles.presentationButton} aria-pressed={false} onClick={() => setMode('room')}>Room</button>
            <button type="button" className={styles.presentationButton} aria-pressed={true} onClick={() => setMode('compact')}>Compact</button>
          </div>
        )}
      </ModeStamp>
      {roomView && <RoomMarketClock clock={clock} />}
      {roomView && !reviewActive && (
        <RoomTape
          marks={deskMarks}
          stale={marks.stale}
          failed={marks.failed}
          asOf={marks.result?.asOf}
          clock={clock}
          take={take}
          brokerName="Jesse"
          priceLabel="on Solana"
          missingSecondLeg="no comparable reference"
          onSelect={id => {
            handEdit({ instrumentId: id as SolanaInstrumentId }, 'instrument');
            scrollToDeskTarget('instruction');
          }}
        />
      )}
      {lead}
      <div
        className={styles.grid}
        data-review={reviewActive ? 'true' : 'false'}
        data-ledger="true"
        data-foreground={jesse.foreground.kind}
        data-live={jesseLive ? 'true' : 'false'}
        data-presentation={presentationMode}
        data-line-first={lineLed ? 'true' : undefined}
        data-slip-led={slipLed ? 'true' : undefined}
      >
        {!roomView && (
          <>
            <div className={styles.deskSurface} aria-hidden="true">
              <span>CLAFLIN &amp; CO. · SOLANA</span>
            </div>
            <DeskObjects />
          </>
        )}
        <aside className={styles.support} aria-label="Jesse’s desk">
          <JesseCall jesse={jesse} take={roomView ? null : take} compactPlate={roomView} onLiveChange={setJesseLive} onUserSpoken={setSpoken} onLineApplied={onLineApplied} />
          {blankSlip && blotter}
          {roomView ? (
            <details className={styles.typeInstead}>
              <summary>Type instead</summary>
              <JesseCommandBar jesse={jesse} onHeard={setSpoken} onParsed={recordParsed} />
            </details>
          ) : (
            <JesseCommandBar jesse={jesse} onHeard={setSpoken} onParsed={recordParsed} />
          )}
          <ReceiverShell
            stage={instrumentStage}
            label={instrumentLabel}
            reviewing={reviewActive}
            brokerName="Jesse"
            lineTargetId="jesse-line"
            live={jesseLive}
            hideCue={roomView}
          />
          <div className={styles.deskInscription}>
            <span>The tape runs all night.</span>
            <p>The house keeps the record.</p>
          </div>
        </aside>
        <JesseTicket
          jesse={jesse}
          spokenLine={spoken}
          carriedNote={carriedNote}
          mark={selectedMark}
          blankSlip={blankSlip}
          quietEvidence={roomView}
          roomView={roomView}
          provenance={provenance}
          superseded={superseded}
          onSlipEdit={slipEdit}
          handEdit={handEdit}
        />
        <JesseLedger jesse={jesse} />
      </div>
      {!roomView && (
        <div className={ticker.tickerStation}>
          <TapeMachine />
          <TickerTape
            marks={deskMarks}
            failed={marks.failed}
            stale={marks.stale}
            asOf={marks.result?.asOf}
            onSelect={id => {
              handEdit({ instrumentId: id as SolanaInstrumentId }, 'instrument');
              scrollToDeskTarget('instruction', { focusId: 'amount' });
            }}
            disabled={jesse.inFlight === 'quote'}
          />
        </div>
      )}
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
        onLeaveDesk={desk.leaveDesk}
        tape={tapeState}
        tapeAt={tapeAt}
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
      onLeaveDesk={desk.leaveDesk}
      tape={tapeState}
      tapeAt={tapeAt}
    >
      {work}
    </DeskRoom>
  );
}
