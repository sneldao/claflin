/**
 * Jesse's line on AssemblyAI's Voice Agent API. Same desk, same prompt and
 * same client tools as the ElevenLabs line (lib/jesse/desk-tools.ts); the
 * difference is the transport and two safeguards the protocol makes native:
 *   - progressive tool reveal: `record_paper` is only registered while a
 *     quotation is in review, re-sent via session.update on every change;
 *   - `hold` execution for filing, and tool results released only on
 *     reply.done (ToolResultQueue).
 * Paper only. Voice cannot sign, submit or reconcile.
 */
'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '@/lib/api-client';
import {
  appendCaption,
  boundedDiscussionContext,
  lastCaption,
  openingWithResume,
  summarizeDiscussion,
  type DiscussionCaption,
} from '@/lib/hetty/discussion';
import { appliedJesseTicketLine, jesseClosingLine, jesseOpeningLine } from '@/lib/jesse/voice-tools';
import { jesseToolHandlers } from '@/lib/jesse/desk-tools';
import { allowedTools, jesseSessionUpdate, jesseToolUpdate, type JesseToolName } from '@/lib/jesse/assemblyai-agent';
import { AssemblyAiVoiceSession } from '@/lib/jesse/assemblyai-session';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import type { SlipField, SlipProvenance } from '@/lib/desk/slip-provenance';
import { LINE_SIGNAL_EVENT, consumeRingOnArrival } from '@/lib/trading/line-signal';
import { LINE_FOOT } from '@/lib/desk/ui-copy';
import { BrokerLinePlate, LineCaptions } from './BrokerLine';
import { RingExample } from './RingExample';
import styles from './WorkingDesk.module.css';

type Caption = DiscussionCaption;
type Status = 'idle' | 'connecting' | 'live';

const DIAL_TIMEOUT_MS = 20_000;

export const JesseCallAssemblyAI = memo(function JesseCallAssemblyAI({
  jesse,
  take = null,
  compactPlate = false,
  onLiveChange,
  onUserSpoken,
  onAgentSpoken,
  onLineApplied,
}: {
  jesse: JesseDesk;
  take?: string | null;
  compactPlate?: boolean;
  onLiveChange?: (live: boolean) => void;
  onUserSpoken?: (text: string) => void;
  onAgentSpoken?: (text: string) => void;
  onLineApplied?: (partial: SlipProvenance) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hearing, setHearing] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const jesseRef = useRef(jesse);
  useEffect(() => { jesseRef.current = jesse; });
  const captionsRef = useRef(captions);
  useEffect(() => { captionsRef.current = captions; });
  const sessionRef = useRef<AssemblyAiVoiceSession | null>(null);
  const genRef = useRef(0);
  const callbacks = useRef({ onLiveChange, onUserSpoken, onAgentSpoken, onLineApplied });
  useEffect(() => { callbacks.current = { onLiveChange, onUserSpoken, onAgentSpoken, onLineApplied }; });

  const live = status === 'live';
  const ringing = status === 'connecting';
  useEffect(() => { callbacks.current.onLiveChange?.(live); }, [live]);

  const markLine = useCallback((field: SlipField, value: string) => {
    callbacks.current.onLineApplied?.({
      [field]: { kind: 'line', lastCaller: lastCaption(captionsRef.current, 'user')?.text ?? null, value },
    });
  }, []);
  const handlers = useMemo(() => jesseToolHandlers({ desk: () => jesseRef.current, markLine }), [markLine]);

  const addCaption = useCallback((caption: Caption) => setCaptions(prev => appendCaption(prev, caption)), []);

  /* Progressive reveal: whenever the document kind changes mid-call, the
     agent's tool list is replaced to match it. */
  const foregroundKind = jesse.foreground.kind;
  useEffect(() => {
    if (live) sessionRef.current?.update(jesseToolUpdate({ kind: foregroundKind }));
  }, [live, foregroundKind]);

  const finish = useCallback((note: string | null, error: string | null = null) => {
    sessionRef.current = null;
    setStatus('idle');
    setSpeaking(false);
    setHearing(null);
    setMuted(false);
    if (note) setEndNote(note);
    if (error) setCallError(error);
  }, []);

  const hangUp = useCallback(() => {
    genRef.current += 1;
    const session = sessionRef.current;
    if (!session) return;
    session.end();
  }, []);

  const ring = useCallback(async (mode: 'fresh' | 'resume' = 'fresh') => {
    if (sessionRef.current || status !== 'idle') return;
    const gen = ++genRef.current;
    setStatus('connecting');
    setCallError(null);
    setEndNote(null);

    const token = await fetchJson<{ token?: string }>('/api/desk/jesse/voice-agent/token', { method: 'POST', cache: 'no-store' });
    if (genRef.current !== gen) return;
    if (!token.ok || !token.data.token) {
      const e = token.ok ? null : token.error;
      finish(null, e?.retryAfterSeconds
        ? `The line is busy. Try again in about ${Math.max(1, Math.ceil(e.retryAfterSeconds / 5) * 5)} seconds.`
        : e?.message ?? 'Jesse’s line is unavailable. Please try again shortly.');
      return;
    }

    const d = jesseRef.current;
    const resume = mode === 'resume' && captionsRef.current.length > 0;
    const ticketOpening = jesseOpeningLine(d.state, d.foreground);
    const greeting = resume ? openingWithResume(ticketOpening, captionsRef.current) : ticketOpening;
    const firstUpdate = jesseSessionUpdate({
      greeting,
      foreground: d.foreground,
      instrument: d.state.draft.instrumentId ?? '',
      stage: d.state.stage,
      priorDiscussion: resume ? boundedDiscussionContext(captionsRef.current, undefined, 'Jesse') : null,
    });

    const session = new AssemblyAiVoiceSession({
      onReady: () => { if (genRef.current === gen) setStatus('live'); },
      onSpeaking: value => setSpeaking(value),
      onUserTranscript: (text, final) => {
        const clean = text.trim();
        if (!final) { setHearing(clean || null); return; }
        setHearing(null);
        if (!clean) return;
        addCaption({ role: 'user', text: clean.slice(0, 600), at: Date.now() });
        if (clean.length <= 300) callbacks.current.onUserSpoken?.(clean);
      },
      onAgentTranscript: text => {
        const clean = text.trim();
        if (!clean) return;
        addCaption({ role: 'agent', text: clean.slice(0, 600), at: Date.now() });
        callbacks.current.onAgentSpoken?.(clean.slice(0, 600));
      },
      onToolCall: async (name, args) => {
        const allowed = allowedTools(jesseRef.current.foreground);
        if (!allowed.has(name as JesseToolName)) {
          /* The reveal is re-sent on every change, but a call can race it.
             Refuse here too — the browser is the last word, not the model. */
          return name === 'record_paper'
            ? 'There is no estimate in review to file. Offer to price the ticket first.'
            : `${name.replace(/_/g, ' ')} is not available for what is on the desk right now.`;
        }
        return handlers[name as JesseToolName](args);
      },
      onEnded: reason => {
        const now = jesseRef.current;
        finish(jesseClosingLine(now.state, now.foreground, reason));
      },
      onError: message => {
        session.end();
        finish(null, message);
      },
    });
    sessionRef.current = session;
    try {
      await session.start(token.data.token, firstUpdate);
    } catch (err) {
      session.end();
      const raw = err instanceof Error ? `${err.name} ${err.message}` : '';
      finish(null, /notallowed|permission|denied/i.test(raw)
        ? 'The microphone was not allowed. Grant mic access and ring again.'
        : err instanceof Error && err.message.startsWith('This browser')
          ? err.message
          : 'The line could not be opened. Check the microphone permission and ring again.');
    }
  }, [status, finish, addCaption, handlers]);

  const cancelRing = useCallback(() => { hangUp(); finish(null); }, [hangUp, finish]);
  const endCall = useCallback(() => {
    hangUp();
    const d = jesseRef.current;
    finish(jesseClosingLine(d.state, d.foreground, 'ended'));
  }, [hangUp, finish]);

  /* A connection that never answers is ended honestly, not left spinning. */
  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => {
      hangUp();
      finish(null, 'The line did not answer. Check the microphone permission and ring again.');
    }, DIAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ringing, hangUp, finish]);

  /* Leaving the page ends the session (and its billing) immediately. */
  useEffect(() => {
    const leave = () => sessionRef.current?.end();
    const onVisibility = () => { if (document.visibilityState === 'hidden') leave(); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', onVisibility);
      leave();
    };
  }, []);

  const ringRef = useRef(ring);
  useEffect(() => { ringRef.current = ring; });
  useEffect(() => {
    const onSignal = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'toggle') return;
      if (live) endCall();
      else if (ringing) cancelRing();
      else void ringRef.current('fresh');
    };
    window.addEventListener(LINE_SIGNAL_EVENT, onSignal);
    return () => window.removeEventListener(LINE_SIGNAL_EVENT, onSignal);
  }, [live, ringing, endCall, cancelRing]);

  useEffect(() => {
    if (consumeRingOnArrival('jesse')) void ringRef.current('fresh');
  }, []);

  const toggleMute = () => {
    const next = !muted;
    sessionRef.current?.setMuted(next);
    setMuted(next);
  };

  const estimating = jesse.inFlight === 'quote' || jesse.foreground.kind === 'pending';
  const inReview = jesse.foreground.kind === 'quotation';
  const statusKey = ringing ? 'connecting' : !live ? 'idle' : estimating ? 'estimating' : speaking ? 'speaking' : inReview ? 'review' : muted ? 'muted' : 'on';
  const statusLabel = ringing ? 'Connecting'
    : !live ? 'Direct line'
      : estimating ? 'Requesting estimate'
        : speaking ? 'Jesse speaking'
          : inReview ? 'For your review'
            : muted ? 'Microphone muted' : 'Microphone on';

  const lastUser = lastCaption(captions, 'user');
  const lastAgent = lastCaption(captions, 'agent');
  const discussion = summarizeDiscussion(captions, 'Jesse');
  const applied = live || captions.length > 0 ? appliedJesseTicketLine(jesse.state, jesse.foreground) : null;
  const callNote = jesse.foreground.kind === 'missing'
    ? 'That paper record is no longer in this browser. Return to the instruction.'
    : jesse.foreground.kind === 'archive'
      ? 'A filed record is on the ticket. It is for reading until you return to the instruction.'
      : live && inReview
        ? 'The quotation is on the slip. Take your time — Jesse will hold the line.'
        : null;

  return (
    <section id="jesse-line" className={styles.call} aria-labelledby="jesse-call-title" data-live={live ? 'true' : 'false'} data-call={statusKey} data-state={statusKey} data-provider="assemblyai">
      <div className={styles.brokerPlate}>
        <h2 id="jesse-call-title" className={compactPlate ? styles.srOnly : undefined}>Jesse Livermore <small>The Boy Plunger · AI broker on Solana</small></h2>
        <span className={styles.callLine} data-live={live ? 'true' : 'false'}>
          <span className={styles.callDot} data-speaking={speaking ? 'true' : 'false'} aria-hidden="true" />
          {live ? 'CONNECTED' : ringing ? 'CONNECTING' : 'DIRECT LINE'}
        </span>
      </div>
      {!live && !ringing && <BrokerLinePlate deskId="jesse" take={take} compact={compactPlate} />}
      {callNote && <p className={styles.callNote}>{callNote}</p>}
      <div className={styles.callActions}>
        {!live && !ringing && captions.length > 0 && (
          <>
            <button type="button" className={styles.callButton} onClick={() => void ring('resume')}>Resume with Jesse</button>
            <button type="button" className={styles.callButtonSecondary} onClick={() => { setCaptions([]); setEndNote(null); setCallError(null); }}>Start fresh</button>
            <button type="button" className={styles.callButtonSecondary} onClick={() => { setCaptions([]); void ring('fresh'); }}>Ring fresh</button>
          </>
        )}
        {!live && !ringing && captions.length === 0 && (
          <>
            <button type="button" className={styles.callButton} data-cue="idle" aria-label={compactPlate ? 'Ring Jesse' : undefined} onClick={() => void ring('fresh')}>
              <span className={styles.ringLamp} aria-hidden="true" />
              {compactPlate ? 'Ring' : 'Ring Jesse'}
            </button>
            {compactPlate && <RingExample deskId="jesse" />}
          </>
        )}
        {ringing && (
          <>
            <p className={styles.callStatus} role="status">
              <span className={styles.callDot} data-speaking="false" aria-hidden="true" />
              Connecting… the ticket stays usable.
            </p>
            <button type="button" className={styles.callButtonSecondary} onClick={cancelRing}>Cancel</button>
          </>
        )}
        {live && (
          <>
            <p className={styles.callStatus} role="status" aria-live="polite">
              <span className={styles.callDot} data-speaking={speaking ? 'true' : 'false'} aria-hidden="true" />
              {statusLabel}
            </p>
            <button type="button" className={styles.callButtonSecondary} onClick={toggleMute} aria-pressed={muted}>
              {muted ? 'Microphone off' : 'Microphone on'}
            </button>
            <button type="button" className={styles.callButtonSecondary} onClick={endCall}>End call</button>
          </>
        )}
      </div>
      {live && hearing && (
        <p className={styles.callNote} aria-live="off" data-hearing="true">
          <span aria-hidden="true">Hearing… </span>{hearing}
        </p>
      )}
      {(live || captions.length > 0) && (lastUser || lastAgent || applied) && (
        <div className={styles.callCaptions} aria-live="polite">
          <LineCaptions captions={captions} brokerName="Jesse" applied={applied} discussion={discussion} />
          {captions.length > 4 && (
            <details className={styles.captionHistory}>
              <summary>Conversation ({captions.length})</summary>
              <ol>
                {captions.map((c, i) => (
                  <li key={`${c.at}-${i}`} data-voice={c.role}>
                    <span>{c.role === 'user' ? 'You' : 'Jesse'}.</span> {c.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      {endNote && !live && !ringing && <p className={styles.callFoot} role="status">{endNote}</p>}
      {callError && <p className={styles.callError} role="alert">{callError}</p>}
      {!live && !ringing && !endNote && !callError && (
        <p className={styles.callFoot}>{LINE_FOOT} Press <kbd>H</kbd> to lift the line. <span className={styles.srOnly}>Voice by AssemblyAI.</span></p>
      )}
      {(live || ringing) && <p className={styles.callFoot} data-provider-credit="true">Voice agent: AssemblyAI · Universal-3 Pro</p>}
    </section>
  );
});
