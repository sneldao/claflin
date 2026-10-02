'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useDictation } from '@/lib/dictation/useDictation';
import { DESK_CAPABILITIES, HOUSE_DESKS, type HouseDesk, type HouseDeskId } from '@/lib/house';
import { offeringForId } from '@/lib/desk/offerings';
import { PRODUCT_FACTS } from '@/lib/desk/board';
import { offeringCapabilityText, openDesksForOffering, railLabel, soleOfferingForDesk, venueLabel } from '@/lib/desk/offerings-presentation';
import { lampFor, readInstruction, turretReply, type LineLamp } from '@/lib/desk/turret';
import { LINE_IDENTITY, TURRET_COPY } from '@/lib/desk/ui-copy';
import type { MicReason } from '@/lib/funnel/events';
import foyerStyles from './HouseFoyer.module.css';

/** Keys already doing a job on these targets keep that job. */
const OWNS_SPACE = 'input, textarea, select, a, button:not([data-talk]), [contenteditable="true"]';

const LAMP_WORDS: Record<LineLamp, string | null> = {
  idle: null,
  match: TURRET_COPY.lampMatch,
  quiet: TURRET_COPY.lampQuiet,
};

export interface HouseTurretProps {
  instruction: string;
  onInstruction: (instruction: string, source: 'spoken' | 'typed') => void;
  lineDesks: readonly HouseDesk[];
  planned: readonly HouseDesk[];
  onRing: (id: HouseDeskId) => void;
  onType: (id: HouseDeskId) => void;
  deskHref: (id: HouseDeskId) => string;
  onTypeClick: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Rendered between the talk bar and the lines — the one boundary line. */
  boundary: ReactNode;
  /** An instruction settled on the line — spoken on transcript, typed after a pause. */
  onCommit?: (instruction: string, source: 'spoken' | 'typed') => void;
  onChooseOffering: (offeringId: string, deskId: HouseDeskId) => void;
  onMicUnavailable?: (reason: MicReason) => void;
}

/** A typed instruction counts once the caller stops typing for this long. */
const TYPED_SETTLE_MS = 1500;
/** Space held at least this long opens the line; a shorter tap scrolls the page. */
export const SPACE_HOLD_MS = 250;

/**
 * The house turret — one line into the house (hold to talk, or type), and a
 * lamp per desk that lights when it carries what was said. The turret never
 * rings a desk on its own and never picks between two lit lines.
 */
export function HouseTurret({ instruction, onInstruction, lineDesks, planned, onRing, deskHref, onTypeClick, boundary, onCommit, onChooseOffering, onMicUnavailable }: HouseTurretProps) {
  /* Ref mirrors — the foyer re-renders on every mark tick, which must not
     restart the typed-settle timer. Synced in an effect, not during render. */
  const commitRef = useRef(onCommit);
  const micRef = useRef(onMicUnavailable);
  useEffect(() => { commitRef.current = onCommit; micRef.current = onMicUnavailable; });
  const typedRef = useRef(false);
  const { state, isRecording, isTranscribing, startRecording, stopRecording } = useDictation({
    onTranscript: transcript => {
      typedRef.current = false;
      onInstruction(transcript, 'spoken');
      commitRef.current?.(transcript, 'spoken');
    },
    onMicUnavailable: reason => micRef.current?.(reason),
  });
  useEffect(() => {
    if (!typedRef.current) return;
    const handle = setTimeout(() => commitRef.current?.(instruction, 'typed'), TYPED_SETTLE_MS);
    return () => clearTimeout(handle);
  }, [instruction]);
  const [heard, setHeard] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const holding = useRef(false);
  const spaceReleased = useRef(false);
  const barRef = useRef<HTMLFormElement>(null);
  /* The handset: once the talk bar scrolls away on a phone, a thumb-reach
     copy of the same line docks at the bottom. Same recorder, same words. */
  const [barAway, setBarAway] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setBarAway(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const reading = readInstruction(instruction);
  const deskIds = lineDesks.map(desk => desk.id);
  const reply = turretReply(reading, deskIds);

  if (state.status === 'success' && state.transcript && state.transcript !== heard) {
    setHeard(state.transcript);
  }

  const begin = () => {
    if (holding.current) return;
    holding.current = true;
    setAsked(true);
    /* The mic can arrive after the caller already let go (permission prompt,
       slow device). A release with no recorder yet is honoured here, once the
       recorder exists — otherwise the line would stay "listening". */
    void startRecording().then(() => {
      if (!holding.current) void stopRecording();
    });
  };
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    void stopRecording();
  };

  /* Space is the house line while the talk bar is on screen and focus is not
     already typing or pressing something. Held = talking; released = sent.
     A quick tap is still a page scroll: the mic opens only once Space has
     been held past SPACE_HOLD_MS, and a shorter press scrolls exactly as the
     browser would. Once the talk bar has scrolled away, Space is left to the
     browser entirely — the docked handset stays a pointer/focus control. */
  const lineRef = useRef({ begin, release, barAway });
  useEffect(() => { lineRef.current = { begin, release, barAway }; });
  useEffect(() => {
    const ownsSpace = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.(OWNS_SPACE);
    let pending: ReturnType<typeof setTimeout> | null = null;
    let pressed = false;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (ownsSpace(event.target) || lineRef.current.barAway) return;
      event.preventDefault();
      if (event.repeat || pressed) return;
      pressed = true;
      pending = setTimeout(() => {
        pending = null;
        lineRef.current.begin();
      }, SPACE_HOLD_MS);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !pressed) return;
      pressed = false;
      event.preventDefault();
      if (pending) {
        /* A tap, not a hold: do what Space does on a page. */
        clearTimeout(pending);
        pending = null;
        window.scrollBy?.({ top: (event.shiftKey ? -1 : 1) * window.innerHeight * 0.85, behavior: 'auto' });
        return;
      }
      spaceReleased.current = true;
      setTimeout(() => { spaceReleased.current = false; }, 0);
      lineRef.current.release();
    };
    const blur = () => {
      pressed = false;
      if (pending) { clearTimeout(pending); pending = null; }
      lineRef.current.release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      if (pending) clearTimeout(pending);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    begin();
  };

  /* Enter on the focused talk button toggles — the keyboard path that does
     not need a held key. Pointer clicks arrive with detail > 0 and are
     already handled by down/up. */
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) return;
    /* A Space release on the focused button also activates it — the window
       handler already ended that hold. */
    if (spaceReleased.current) { spaceReleased.current = false; return; }
    if (holding.current) release();
    else begin();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reading.kind !== 'matched' || reading.matches.length !== 1) return;
    const match = reading.matches[0];
    if (match.deskIds.length === 1) onChooseOffering(match.offeringId, match.deskIds[0]);
  };

  const talkLabel = isRecording
    ? TURRET_COPY.listening
    : isTranscribing
      ? TURRET_COPY.transcribing
      : TURRET_COPY.hold;

  return (
    <div className={foyerStyles.turret}>
      <form ref={barRef} className={foyerStyles.talkBar} onSubmit={submit} data-state={state.status}>
        <button
          type="button"
          data-talk
          className={foyerStyles.talkButton}
          aria-pressed={isRecording}
          aria-describedby="turret-talk-hint"
          disabled={isTranscribing}
          onPointerDown={onPointerDown}
          onPointerUp={release}
          onPointerCancel={release}
          onClick={onClick}
        >
          <span className={foyerStyles.talkLamp} aria-hidden="true" />
          {talkLabel}
        </button>
        <label className={foyerStyles.instructionSearch}>
          <input
            value={instruction}
            onChange={event => { typedRef.current = true; onInstruction(event.target.value, 'typed'); }}
            placeholder="Try “buy Apple for 100 USDC”"
            maxLength={1000}
            autoComplete="off"
            aria-label="Instruction for the house"
          />
        </label>
      </form>

      <p id="turret-talk-hint" className={foyerStyles.talkHint}>
        {asked ? TURRET_COPY.micNote : TURRET_COPY.hint}
      </p>

      <div className={foyerStyles.turretStatus} role="status" aria-live="polite">
        {state.status === 'error' && state.error && <p className={foyerStyles.talkError}>{state.error}</p>}
        {heard && instruction === heard && <p className={foyerStyles.heard}>{TURRET_COPY.heard} “{heard}”</p>}
        {reply && <p className={foyerStyles.turretReply}>{reply}</p>}
      </div>

      {reading.kind === 'matched' && reading.matches.length > 0 && (
        <section className={foyerStyles.matches} aria-label="Matching products">
          {reading.matches.length > 1 && (
            <h2 className={foyerStyles.matchesTitle}>Choose the product you mean</h2>
          )}
          <ul className={foyerStyles.matchList}>
            {reading.matches.map(match => {
              const offering = offeringForId(match.offeringId);
              if (!offering) return null;
              const facts = PRODUCT_FACTS[offering.mandateId] ?? null;
              const desks = openDesksForOffering(offering);
              return (
                <li key={match.offeringId} className={foyerStyles.matchItem}>
                  <div className={foyerStyles.matchIdentity}>
                    <span className={foyerStyles.matchName}>{offering.name} <span className={foyerStyles.matchSymbol}>{offering.symbol}</span></span>
                    {offering.issuer && <span className={foyerStyles.matchIssuer}>{offering.issuer}</span>}
                  </div>
                  <p className={foyerStyles.matchMeta}>
                    {railLabel(offering.rail)} · {venueLabel(offering.venue)} · quoted in {offering.quoteAsset ?? 'USDC'} · {offeringCapabilityText(offering, desks.map(desk => desk.id))}
                  </p>
                  {facts && (
                    <>
                      <p className={foyerStyles.matchWhat}>{facts.what}</p>
                      <details className={foyerStyles.matchTerms}>
                        <summary>Product terms</summary>
                        <p>{facts.rights}</p>
                        <p>{facts.eligibility}</p>
                        <p><a href={facts.sourceUrl} target="_blank" rel="noreferrer">{facts.sourceLabel}</a></p>
                      </details>
                    </>
                  )}
                  <div className={foyerStyles.matchActions}>
                    {desks.map(desk => (
                      <button
                        key={desk.id}
                        type="button"
                        className={foyerStyles.matchChoose}
                        onClick={() => onChooseOffering(offering.offeringId, desk.id)}
                      >
                        Continue with {offering.symbol}{desks.length > 1 ? ` · ${desk.shortName}` : ''}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(lineDesks.length > 0 || planned.length > 0) && (() => {
        const matched = reading.kind === 'matched';
        const lines = (
          <ol className={foyerStyles.turretLines} aria-label="The house lines">
            {lineDesks.map(desk => {
              const lamp = lampFor(reading, desk.id);
              const words = LAMP_WORDS[lamp];
              const sole = soleOfferingForDesk(instruction, desk.id);
              const canAct =
                reading.kind === 'empty' ||
                (matched && sole !== null) ||
                (reading.kind === 'launch' && desk.kind === 'launch');
              /* A line is the channel the desk actually takes — voice desks
                 answer a call, typed-only desks like Isabel take the
                 instruction field. Never a fake "Talk" affordance. */
              const voice = DESK_CAPABILITIES[desk.id].voice !== null;
              return (
                <li key={desk.id} className={foyerStyles.lineKey} data-lamp={lamp}>
                  <span className={foyerStyles.keyLamp} aria-hidden="true" />
                  <span className={foyerStyles.lineNumber}>LINE {lineNumber(desk.id)}</span>
                  <div className={foyerStyles.keyIdentity}>
                    <h2 className={foyerStyles.keyName}>{desk.shortName}</h2>
                    <p className={foyerStyles.keyRail}>
                      {desk.market} · {desk.kind === 'launch' ? 'launch desk' : LINE_IDENTITY}{voice ? '' : ' · typed only'}
                      {words && <span className={foyerStyles.lampWords}> · {words}</span>}
                    </p>
                  </div>
                  {canAct && (
                    <div className={foyerStyles.keyActions}>
                      {voice && (
                        <button type="button" className={foyerStyles.keyRing} onClick={() => onRing(desk.id)}>
                          Talk with {desk.shortName}
                        </button>
                      )}
                      <a href={deskHref(desk.id)} className={foyerStyles.keyType} onClick={onTypeClick(desk.id)}>
                        {voice ? 'Type instead' : 'Type an instruction'}
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        );
        const plannedKeys = planned.length > 0 ? (
          <details className={foyerStyles.plannedLines}>
            <summary>Planned lines</summary>
            <span className={foyerStyles.plannedKeys}>
              {planned.map(desk => (
                <span key={desk.id} className={foyerStyles.plannedKey} data-lamp="planned">
                  <span className={foyerStyles.keyLamp} aria-hidden="true" />
                  <span className={foyerStyles.lineNumber}>LINE {lineNumber(desk.id)}</span>
                  <h2 className={foyerStyles.keyName}>{desk.shortName}</h2>
                  <span className={foyerStyles.keyRail}>{desk.market} · {TURRET_COPY.planned}</span>
                </span>
              ))}
            </span>
          </details>
        ) : null;
        return matched ? (
          <>
            <details className={foyerStyles.brokerLines}>
              <summary>Talk with a broker</summary>
              {lines}
            </details>
            {plannedKeys}
          </>
        ) : <>{lines}{plannedKeys}</>;
      })()}

      {boundary}

      <div className={foyerStyles.handset} data-shown={barAway || isRecording || isTranscribing} aria-hidden={!(barAway || isRecording || isTranscribing)}>
        <p className={foyerStyles.handsetStatus} aria-hidden="true">
          {reply ?? (heard && instruction === heard ? `${TURRET_COPY.heard} “${heard}”` : TURRET_COPY.handset)}
        </p>
        <button
          type="button"
          data-talk
          className={`${foyerStyles.talkButton} ${foyerStyles.handsetButton}`}
          aria-pressed={isRecording}
          tabIndex={barAway ? 0 : -1}
          disabled={isTranscribing}
          onPointerDown={onPointerDown}
          onPointerUp={release}
          onPointerCancel={release}
          onClick={onClick}
        >
          <span className={foyerStyles.talkLamp} aria-hidden="true" />
          {talkLabel}
        </button>
      </div>
    </div>
  );
}

/** Lines are numbered in house order, so a planned desk keeps its number when it opens. */
function lineNumber(id: HouseDeskId): number {
  return HOUSE_DESKS.findIndex(desk => desk.id === id) + 1;
}
