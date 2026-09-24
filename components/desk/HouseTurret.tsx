'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useDictation } from '@/lib/dictation/useDictation';
import { HOUSE_DESKS, type HouseDesk, type HouseDeskId } from '@/lib/house';
import { soleOfferingForDesk } from '@/lib/desk/offerings-presentation';
import { lampFor, litDesks, readInstruction, turretReply, type LineLamp } from '@/lib/desk/turret';
import { LINE_IDENTITY, TURRET_COPY } from '@/lib/desk/ui-copy';
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
  onInstruction: (instruction: string) => void;
  lineDesks: readonly HouseDesk[];
  planned: readonly HouseDesk[];
  onRing: (id: HouseDeskId) => void;
  onType: (id: HouseDeskId) => void;
  deskHref: (id: HouseDeskId) => string;
  onTypeClick: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Rendered between the talk bar and the lines — the one boundary line. */
  boundary: ReactNode;
}

/**
 * The house turret — one line into the house (hold to talk, or type), and a
 * lamp per desk that lights when it carries what was said. The turret never
 * rings a desk on its own and never picks between two lit lines.
 */
export function HouseTurret({ instruction, onInstruction, lineDesks, planned, onRing, onType, deskHref, onTypeClick, boundary }: HouseTurretProps) {
  const { state, isRecording, isTranscribing, startRecording, stopRecording } = useDictation({
    onTranscript: onInstruction,
  });
  const [heard, setHeard] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const holding = useRef(false);
  const spaceReleased = useRef(false);

  const reading = readInstruction(instruction);
  const deskIds = lineDesks.map(desk => desk.id);
  const reply = turretReply(reading, deskIds);
  const lit = litDesks(reading, deskIds);

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

  /* Space is the house line anywhere it is not already typing or pressing
     something. Held = talking; released = sent. */
  useEffect(() => {
    const ownsSpace = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.(OWNS_SPACE);
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (ownsSpace(event.target)) return;
      event.preventDefault();
      begin();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !holding.current) return;
      event.preventDefault();
      spaceReleased.current = true;
      setTimeout(() => { spaceReleased.current = false; }, 0);
      release();
    };
    const blur = () => release();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });

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
    if (lit.length === 1) onType(lit[0]);
  };

  const talkLabel = isRecording
    ? TURRET_COPY.listening
    : isTranscribing
      ? TURRET_COPY.transcribing
      : TURRET_COPY.hold;

  return (
    <div className={foyerStyles.turret}>
      <form className={foyerStyles.talkBar} onSubmit={submit} data-state={state.status}>
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
            onChange={event => onInstruction(event.target.value)}
            placeholder="Try “buy Apple for 100 USDC”"
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

      {(lineDesks.length > 0 || planned.length > 0) && (
        <ol className={foyerStyles.turretLines} aria-label="The house lines">
          {lineDesks.map(desk => {
            const lamp = lampFor(reading, desk.id);
            const words = LAMP_WORDS[lamp];
            return (
              <li key={desk.id} className={foyerStyles.lineKey} data-lamp={lamp}>
                <span className={foyerStyles.keyLamp} aria-hidden="true" />
                <span className={foyerStyles.lineNumber}>LINE {lineNumber(desk.id)}</span>
                <div className={foyerStyles.keyIdentity}>
                  <h2 className={foyerStyles.keyName}>{desk.shortName}</h2>
                  <p className={foyerStyles.keyRail}>
                    {desk.market} · {LINE_IDENTITY}
                    {words && <span className={foyerStyles.lampWords}> · {words}</span>}
                  </p>
                </div>
                <div className={foyerStyles.keyActions}>
                  <button type="button" className={foyerStyles.keyRing} onClick={() => onRing(desk.id)}>
                    Ring {desk.shortName}{soleOfferingForDesk(instruction, desk.id) ? ' with this' : ''}
                  </button>
                  <a href={deskHref(desk.id)} className={foyerStyles.keyType} onClick={onTypeClick(desk.id)}>
                    Type instead
                  </a>
                </div>
              </li>
            );
          })}
          {planned.length > 0 && (
            <li className={foyerStyles.plannedKeys}>
              {planned.map(desk => (
                <span key={desk.id} className={foyerStyles.plannedKey} data-lamp="planned">
                  <span className={foyerStyles.keyLamp} aria-hidden="true" />
                  <span className={foyerStyles.lineNumber}>LINE {lineNumber(desk.id)}</span>
                  <h2 className={foyerStyles.keyName}>{desk.shortName}</h2>
                  <span className={foyerStyles.keyRail}>{desk.market} · {TURRET_COPY.planned}</span>
                </span>
              ))}
            </li>
          )}
        </ol>
      )}

      {boundary}
    </div>
  );
}

/** Lines are numbered in house order, so a planned desk keeps its number when it opens. */
function lineNumber(id: HouseDeskId): number {
  return HOUSE_DESKS.findIndex(desk => desk.id === id) + 1;
}
