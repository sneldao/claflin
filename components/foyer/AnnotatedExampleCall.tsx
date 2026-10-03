'use client';

import { useEffect, useRef, useState } from 'react';
import { CURRENT_EXAMPLE_CALL, EXAMPLE_CALL_CRITERIA, EXAMPLE_CALL_LABEL, type ExampleCall, type ExampleCallState } from '@/lib/foyer/example-call';
import foyerStyles from '@/components/desk/HouseFoyer.module.css';

/**
 * The example call — Foyer Line §4.3.
 *
 * Muted with captions by default. One tap to hear (or read the captions).
 * The label `EXAMPLE CALL · recorded <date>` is always visible. Prices on
 * the slip carry the same source label and freshness rules as the live
 * wire — they are never styled like tape marks.
 *
 * Until a recording is accepted, the section renders the criteria, not a
 * fake. The criteria are the bar the first accepted recording will clear.
 */
export function AnnotatedExampleCall({ state = CURRENT_EXAMPLE_CALL }: { state?: ExampleCallState }) {
  return state.kind === 'accepted'
    ? <AcceptedExampleCall call={state.call} />
    : <ExampleCallEmpty state={state} />;
}

function AcceptedExampleCall({ call }: { call: ExampleCall }) {
  const [showCaptions, setShowCaptions] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const recordedDate = new Date(call.recordedAt);
  const dateLabel = recordedDate.toISOString().slice(0, 10);

  const onPlay = () => {
    setAudioUnlocked(true);
    if (audioRef.current) {
      void audioRef.current.play().catch(() => {
        // Browser autoplay refused; captions stay on as the default.
      });
    }
  };

  // Drive caption timing from the audio element's timeupdate when audio
  // is unlocked. The transcript is the source of truth; audio is optional.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUnlocked) return;
    const onTime = () => {
      const t = audio.currentTime;
      let idx = -1;
      call.transcript.forEach((turn, index) => {
        if (turn.startSeconds !== undefined && turn.startSeconds <= t) idx = index;
      });
      setActiveTurn(idx);
    };
    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [audioUnlocked, call.transcript]);

  return (
    <section
      id="house-example"
      className={foyerStyles.exampleCall}
      aria-labelledby="example-call-title"
      data-state="accepted"
    >
      <p className={foyerStyles.exampleCallKicker}>
        {EXAMPLE_CALL_LABEL} · recorded {dateLabel} · prices on the slip are from that call
      </p>
      <h2 id="example-call-title" className={foyerStyles.exampleCallTitle}>
        A real call, not a script.
      </h2>

      <div className={foyerStyles.exampleCallGrid}>
        <div className={foyerStyles.exampleCallTranscript} aria-live="polite">
          <ol>
            {call.transcript.map((turn, i) => (
              <li
                key={i}
                data-speaker={turn.speaker}
                data-active={i === activeTurn ? 'true' : undefined}
                className={foyerStyles.exampleCallTurn}
              >
                <span className={foyerStyles.exampleCallSpeaker}>
                  {turn.speaker === 'caller' ? 'YOU' : 'BROKER'}
                </span>
                <span className={foyerStyles.exampleCallText}>{turn.text}</span>
              </li>
            ))}
          </ol>
          <div className={foyerStyles.exampleCallControls}>
            {call.audioSrc ? <button
              type="button"
              onClick={onPlay}
              className={foyerStyles.exampleCallPlay}
              aria-label="Play the recorded call"
            >
              ▶ Play the recording
            </button> : <span>Transcript only · no audio recording attached</span>}
            <label className={foyerStyles.exampleCallCaptions}>
              <input
                type="checkbox"
                checked={showCaptions}
                onChange={e => setShowCaptions(e.target.checked)}
              />
              Captions
            </label>
          </div>
          {call.intent && (
            <p className={foyerStyles.exampleCallIntent}>
              Intent: {call.intent.side ?? '?'} {call.intent.amount ?? '?'} {call.slip.quoteAsset} of {call.slip.symbol}
            </p>
          )}
        </div>

        <aside className={foyerStyles.exampleCallSlip} aria-label="The slip from this call">
          <p className={foyerStyles.exampleCallSlipKicker}>SLIP · {dateLabel}</p>
          <dl>
            <div><dt>Symbol</dt><dd>{call.slip.symbol}</dd></div>
            <div><dt>Side</dt><dd>BUY</dd></div>
            <div><dt>Amount</dt><dd>{call.slip.amount} {call.slip.quoteAsset}</dd></div>
            <div><dt>Fill</dt><dd>{call.slip.fill}</dd></div>
            <div><dt>Venue</dt><dd>{call.slip.venue}</dd></div>
            <div><dt>Quoted</dt><dd>{new Date(call.slip.quotedAt).toISOString().slice(11, 19)} UTC</dd></div>
            <div><dt>Expires</dt><dd>{new Date(call.slip.expiresAt).toISOString().slice(11, 19)} UTC</dd></div>
            <div><dt>Mode</dt><dd>{call.slip.mode.toUpperCase()}</dd></div>
          </dl>
          <p className={foyerStyles.exampleCallSlipCaveat}>
            Prices are from this call. The desk’s live quote is fresh on the slip when you ask.
          </p>
        </aside>
      </div>

      {showCaptions && (
        <p className={foyerStyles.exampleCallCaption} aria-hidden="true">
          Captions on.
        </p>
      )}

      {call.audioSrc && <audio ref={audioRef} src={call.audioSrc} preload="none" aria-hidden="true" />}
    </section>
  );
}

/**
 * The empty state — rendered when no accepted recording exists. The
 * section never fakes a transcript, never invents prices, and never
 * presents a fixture as a live call. It shows the bar a future
 * recording will need to clear.
 */
function ExampleCallEmpty({ state }: { state: { kind: 'pending' | 'rejected'; reason: string; recordedAt: number | null; reviewedBy: string | null } }) {
  return (
    <section
      id="house-example"
      className={foyerStyles.exampleCall}
      aria-labelledby="example-call-title"
      data-state={state.kind}
    >
      <p className={foyerStyles.exampleCallKicker}>
        {EXAMPLE_CALL_LABEL} · no accepted recording yet
      </p>
      <h2 id="example-call-title" className={foyerStyles.exampleCallTitle}>
        A real call will land here.
      </h2>
      <p className={foyerStyles.exampleCallReason}>{state.reason}</p>
      <p className={foyerStyles.exampleCallCriteriaLabel}>
        What an accepted recording will need:
      </p>
      <ul className={foyerStyles.exampleCallCriteria}>
        {EXAMPLE_CALL_CRITERIA.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}