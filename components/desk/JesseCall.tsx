/**
 * Jesse's line — live ElevenLabs ConvAI session. Client tools execute against
 * useJesseDesk / applyJesseCommand in the caller's browser. Paper only.
 *
 * Same reliability model as HettyCall: every terminal event remounts the
 * ConversationProvider so a stale SDK lock cannot refuse the next ring.
 * Account transcript persistence stays Hetty-only (no Jesse sync schema).
 */
'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { fetchJson } from '@/lib/api-client';
import {
  appendCaption,
  boundedDiscussionContext,
  lastCaption,
  openingWithResume,
  summarizeDiscussion,
  type DiscussionCaption,
} from '@/lib/hetty/discussion';
import {
  appliedJesseTicketLine,
  chooseSolanaInstrumentResult,
  describeJesseDesk,
  explainTopicChoices,
  jesseClosingLine,
  jesseForegroundGuard,
  jesseOpeningLine,
  jesseSymbol,
  nextJesseInstructionDraft,
  resolveExplainTopic,
  resolveSolanaAlias,
  setJesseAmountResult,
  setJesseInstructionResult,
} from '@/lib/jesse/voice-tools';
import type { JesseDesk } from '@/lib/solana/useJesseDesk';
import { LINE_SIGNAL_EVENT, consumeRingOnArrival } from '@/lib/trading/line-signal';
import { BrokerLinePlate, LineCaptions } from './BrokerLine';
import styles from './WorkingDesk.module.css';

type ToolParams = Record<string, unknown>;
type ToolResult = Promise<string>;
export type Caption = DiscussionCaption;

type JesseTools = {
  choose_instrument: (p: ToolParams) => ToolResult;
  set_instruction: (p: ToolParams) => ToolResult;
  set_amount: (p: ToolParams) => ToolResult;
  request_estimate: () => ToolResult;
  compare_markets: (p: ToolParams) => ToolResult;
  record_paper: () => ToolResult;
  cancel_instruction: () => ToolResult;
  describe_desk: () => ToolResult;
  watch_mark: (p: ToolParams) => ToolResult;
  explain_concept: (p: ToolParams) => ToolResult;
};

const DIAL_TIMEOUT_MS = 20_000;

function receiverClick(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1400;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => { void ctx.close().catch(() => undefined); };
  } catch { /* silence is fine */ }
}

function JesseCallInner({
  jesse,
  take = null,
  captions,
  onCaption,
  onClearDiscussion,
  onLiveChange,
  onUserSpoken,
  onAgentSpoken,
  endNote,
  callError,
  onActivity,
  onSessionEnded,
  onSessionFailed,
}: {
  jesse: JesseDesk;
  take?: string | null;
  captions: Caption[];
  onCaption: (caption: Caption) => void;
  onClearDiscussion: () => void;
  onLiveChange: (live: boolean) => void;
  onUserSpoken?: (text: string) => void;
  onAgentSpoken?: (text: string) => void;
  endNote: string | null;
  callError: string | null;
  onActivity: () => void;
  onSessionEnded: (note: string | null) => void;
  onSessionFailed: (message: string) => void;
}) {
  const jesseRef = useRef(jesse);
  useEffect(() => { jesseRef.current = jesse; });
  const captionsRef = useRef(captions);
  useEffect(() => { captionsRef.current = captions; });
  const onCaptionRef = useRef(onCaption);
  useEffect(() => { onCaptionRef.current = onCaption; });

  const waitFor = useCallback((predicate: (d: JesseDesk) => boolean, ms: number) =>
    new Promise<boolean>(resolve => {
      const deadline = Date.now() + ms;
      const tick = () => {
        if (predicate(jesseRef.current)) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    }), []);

  useConversationClientTool<JesseTools>('choose_instrument', async (p) => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    const query = String(p.query ?? '');
    const instrument = resolveSolanaAlias(query);
    if (!instrument) return chooseSolanaInstrumentResult(query);
    await d.edit({ instrumentId: instrument.id }, 'instrument');
    return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
  });

  useConversationClientTool<JesseTools>('set_instruction', async (p) => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    const side = String(p.side ?? '');
    if (side !== 'buy' && side !== 'sell') return setJesseInstructionResult(side);
    const next = nextJesseInstructionDraft(d.state.draft, side);
    await d.edit(next.draft, 'side');
    return setJesseInstructionResult(side, next.amountCleared);
  });

  useConversationClientTool<JesseTools>('set_amount', async (p) => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    const clean = String(p.amount ?? '').trim();
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
      return `"${clean || 'That'}" is not a usable amount — say a plain number, like 100 or 0.5.`;
    }
    await d.edit({ amount: clean }, 'amount');
    return setJesseAmountResult(d.state.draft.side, clean);
  });

  useConversationClientTool<JesseTools>('request_estimate', async () => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    if (d.inFlight === 'quote' || d.state.stage === 'quoting') return 'An estimate is already on its way.';
    const before = d.state.quote?.id;
    await d.quote();
    await waitFor(x => x.state.stage === 'review' || (x.state.stage === 'draft' && x.inFlight === null), 8_000);
    const now = jesseRef.current;
    if (now.state.stage === 'review' && now.state.quote && now.state.quote.id !== before) {
      return now.lastResult?.spokenText
        ?? `Estimate on the slip: spend ${now.state.quote.inputAmount} ${now.state.quote.inputSymbol}, receive ${now.state.quote.outputAmount} ${now.state.quote.outputSymbol}, Jupiter Metis — paper only.`;
    }
    return now.lastResult?.spokenText
      ?? 'The estimate did not come through. Offer to adjust or retry.';
  });

  useConversationClientTool<JesseTools>('compare_markets', async (p) => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    const query = String(p.query ?? '').trim();
    if (query) {
      const instrument = resolveSolanaAlias(query);
      if (!instrument) return chooseSolanaInstrumentResult(query);
      await d.edit({ instrumentId: instrument.id }, 'instrument');
    }
    if (!jesseRef.current.state.draft.instrumentId) {
      return 'Which xStock should I compare — Apple, NVIDIA, or Tesla?';
    }
    await d.compare();
    await waitFor(x => x.inFlight === null, 6_000);
    return jesseRef.current.lastResult?.spokenText
      ?? 'Comparison is unavailable right now. Say so honestly; independent Jupiter quoting may still work.';
  });

  useConversationClientTool<JesseTools>('record_paper', async () => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    if (d.foreground.kind === 'receipt') return 'That instruction is already filed.';
    if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
    const result = await d.file();
    return result.spokenText;
  });

  useConversationClientTool<JesseTools>('watch_mark', async (p) => {
    const d = jesseRef.current;
    if (d.foreground.kind === 'missing') return 'That paper record is no longer here.';
    const query = String(p.query ?? '').trim();
    const instrument = query
      ? resolveSolanaAlias(query)
      : (d.state.draft.instrumentId
        ? resolveSolanaAlias(jesseSymbol(d.state.draft.instrumentId))
        : null);
    const id = instrument?.id ?? d.state.draft.instrumentId;
    if (!id) return 'No instrument to watch — name one, or put an xStock on the ticket first.';
    const result = await d.watch(id);
    return result.spokenText || `${jesseSymbol(id)} is watched on this desk.`;
  });

  useConversationClientTool<JesseTools>('cancel_instruction', async () => {
    const d = jesseRef.current;
    const refusal = jesseForegroundGuard(d.foreground);
    if (refusal) return refusal;
    const result = await d.cancel();
    return result.spokenText || 'The ticket is clear.';
  });

  useConversationClientTool<JesseTools>('describe_desk', async () => {
    const d = jesseRef.current;
    return describeJesseDesk(d.state, d.foreground, d.records);
  });

  useConversationClientTool<JesseTools>('explain_concept', async (p) => {
    if (jesseRef.current.inFlight === 'quote' || jesseRef.current.state.stage === 'quoting') {
      return 'Hold the explanation — an estimate is coming in. Ask again in a moment.';
    }
    const topic = resolveExplainTopic(String(p.topic ?? ''));
    if (!topic) {
      return `I do not have a reviewed explanation for that. I can explain: ${explainTopicChoices()}.`;
    }
    const result = await jesseRef.current.run({ type: 'explain', topic });
    return result.spokenText;
  });

  const [dialing, setDialing] = useState(false);
  const dialCancelledRef = useRef(false);
  const ringGenRef = useRef(0);
  const endedByUserRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const terminalFiredRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireEnded = useCallback((note: string | null) => {
    if (terminalFiredRef.current) return;
    terminalFiredRef.current = true;
    sessionActiveRef.current = false;
    onSessionEnded(note);
  }, [onSessionEnded]);

  const fireFailed = useCallback((message: string) => {
    if (terminalFiredRef.current) return;
    terminalFiredRef.current = true;
    sessionActiveRef.current = false;
    setDialing(false);
    onSessionFailed(message);
  }, [onSessionFailed]);

  const conversation = useConversation({
    onError: (message: unknown, context?: unknown) => {
      const haystack = [
        String((context as { name?: string } | null)?.name ?? ''),
        String((context as { message?: string } | null)?.message ?? ''),
        String((message as { message?: string } | null)?.message ?? message ?? ''),
      ].join(' ');
      const msg = /notallowed|permission|denied|getusermedia/i.test(haystack)
        ? 'The microphone was not allowed. Grant mic access and ring again.'
        : 'The line dropped. Ring again when you are ready.';
      fireFailed(msg);
    },
    onMessage: (m: { message: string; role?: string; source?: string }) => {
      const text = typeof m.message === 'string' ? m.message.trim() : '';
      if (!text) return;
      const user = m.role === 'user' || m.source === 'user';
      onCaptionRef.current({ role: user ? 'user' : 'agent', text: text.slice(0, 600), at: Date.now() });
      if (user) {
        if (text.length <= 300) onUserSpoken?.(text);
      } else if (text.length <= 600) {
        onAgentSpoken?.(text);
      }
    },
    onConnect: () => {
      if (dialCancelledRef.current) {
        hangUp();
        return;
      }
      endedByUserRef.current = false;
      onActivity();
      setDialing(false);
      receiverClick();
    },
    onDisconnect: () => {
      onLiveChange(false);
      setDialing(false);
      const d = jesseRef.current;
      const note = jesseClosingLine(d.state, d.foreground, endedByUserRef.current ? 'ended' : 'dropped');
      endedByUserRef.current = false;
      fireEnded(note);
    },
  });

  const live = conversation.status === 'connected';
  const sdkConnecting = conversation.status === 'connecting';
  const ringing = dialing || sdkConnecting;

  const statusRef = useRef(conversation.status);
  useEffect(() => { statusRef.current = conversation.status; });
  const hangUp = useCallback(() => {
    if (statusRef.current !== 'connected' && statusRef.current !== 'connecting') return;
    try { conversation.setMuted(true); } catch { /* */ }
    try { conversation.endSession(); } catch { /* */ }
  }, [conversation]);

  useEffect(() => { onLiveChange(live); }, [live, onLiveChange]);

  const hangUpRef = useRef(hangUp);
  useEffect(() => { hangUpRef.current = hangUp; });
  useEffect(() => () => {
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    hangUpRef.current();
  }, []);

  useEffect(() => {
    if (!ringing || live) return;
    const timer = setTimeout(() => {
      hangUp();
      fireFailed('The line did not answer. Check the microphone permission and ring again.');
    }, DIAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ringing, live, hangUp, fireFailed]);

  useEffect(() => {
    const endForLeave = () => {
      if (!sessionActiveRef.current && statusRef.current === 'disconnected') return;
      hangUp();
      const d = jesseRef.current;
      fireEnded(jesseClosingLine(d.state, d.foreground, 'ended'));
    };
    const onHidden = () => {
      hangUp();
      if (!sessionActiveRef.current && statusRef.current === 'disconnected') return;
      sessionActiveRef.current = false;
      try { conversation.setMuted(true); } catch { /* */ }
      onSessionEnded(null);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHidden(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) endForLeave(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', endForLeave);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', endForLeave);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [hangUp, fireEnded, conversation, onSessionEnded]);

  const cancelRing = useCallback(() => {
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    setDialing(false);
    hangUp();
    fireEnded(null);
  }, [hangUp, fireEnded]);

  const endCall = useCallback(() => {
    endedByUserRef.current = true;
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    setDialing(false);
    hangUp();
    endTimerRef.current = setTimeout(() => {
      const d = jesseRef.current;
      fireEnded(jesseClosingLine(d.state, d.foreground, 'ended'));
    }, 2000);
  }, [hangUp, fireEnded]);

  const ring = async (mode: 'fresh' | 'resume' = 'fresh') => {
    if (dialing || sdkConnecting || live) return;
    dialCancelledRef.current = false;
    endedByUserRef.current = false;
    sessionActiveRef.current = true;
    const gen = ++ringGenRef.current;
    setDialing(true);
    onActivity();
    receiverClick();
    const result = await fetchJson<{ signedUrl?: string }>('/api/desk/jesse/session', { method: 'POST', cache: 'no-store' });
    if (dialCancelledRef.current || ringGenRef.current !== gen) return;
    if (!result.ok) {
      const e = result.error;
      const msg = e.retryAfterSeconds
        ? `The line is busy. Try again in about ${Math.max(1, Math.ceil(e.retryAfterSeconds / 5) * 5)} seconds.`
        : e.code === 'not_connected'
          ? 'Jesse’s line is not connected on this deployment.'
          : e.message;
      fireFailed(msg);
      return;
    }
    if (!result.data.signedUrl) {
      fireFailed('Jesse’s line is unavailable. Please try again shortly.');
      return;
    }
    const d = jesseRef.current;
    const ticketOpening = jesseOpeningLine(d.state, d.foreground);
    const resume = mode === 'resume' && captionsRef.current.length > 0;
    const prior = resume ? boundedDiscussionContext(captionsRef.current, undefined, 'Jesse') : null;
    const opening = resume ? openingWithResume(ticketOpening, captionsRef.current) : ticketOpening;
    try {
      await (conversation.startSession as unknown as (opts: Record<string, unknown>) => unknown)({
        signedUrl: result.data.signedUrl,
        overrides: { agent: { firstMessage: opening } },
        dynamicVariables: {
          desk_foreground: d.foreground.kind,
          desk_instrument: d.state.draft.instrumentId ?? '',
          desk_stage: d.state.stage,
          desk_mode: 'paper',
          prior_discussion: prior ?? '',
          discussion_resume: resume ? 'yes' : 'no',
        },
      });
    } catch {
      if (dialCancelledRef.current || ringGenRef.current !== gen) return;
      fireFailed('The line could not be opened. Check the microphone permission and ring again.');
    }
  };

  const ringRef = useRef(ring);
  ringRef.current = ring;
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

  /* Ring-on-arrival: the foyer's "Ring Jesse" leaves a one-shot note; the
     line lifts on mount. Failure paths (unconfigured, mic refused) surface
     through the same ring() guards as a manual ring. */
  useEffect(() => {
    if (consumeRingOnArrival('jesse')) void ringRef.current('fresh');
  }, []);

  const estimating = jesse.inFlight === 'quote' || jesse.foreground.kind === 'pending';
  const inReview = jesse.foreground.kind === 'quotation';
  const speaking = live && conversation.isSpeaking;
  const statusKey = ringing ? 'connecting' : !live ? 'idle' : estimating ? 'estimating' : speaking ? 'speaking' : inReview ? 'review' : conversation.isMuted ? 'muted' : 'on';
  const statusLabel = ringing
    ? 'Connecting'
    : !live
      ? 'Direct line'
      : estimating
        ? 'Requesting estimate'
        : speaking
          ? 'Jesse speaking'
          : inReview
            ? 'For your review'
            : conversation.isMuted
              ? 'Microphone muted'
              : 'Microphone on';

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
        : 'Speak your instruction. Review it on the same ticket.';

  return (
    <section id="jesse-line" className={styles.call} aria-labelledby="jesse-call-title" data-live={live ? 'true' : 'false'} data-call={statusKey} data-state={statusKey}>
      <div className={styles.brokerPlate}>
        <h2 id="jesse-call-title">Jesse Livermore <small>The Boy Plunger · AI broker on Solana</small></h2>
        <span className={styles.callLine} data-live={live ? 'true' : 'false'}>
          <span className={styles.callDot} data-speaking={speaking ? 'true' : 'false'} aria-hidden="true" />
          {live ? 'CONNECTED' : ringing ? 'CONNECTING' : 'DIRECT LINE'}
        </span>
      </div>
      {!live && !ringing && <BrokerLinePlate deskId="jesse" take={take} />}
      <p className={styles.callNote}>{callNote}</p>
      <div className={styles.callActions}>
        {!live && !ringing && captions.length > 0 && (
          <>
            <button type="button" className={styles.callButton} onClick={() => void ring('resume')}>
              Resume with Jesse
            </button>
            <button type="button" className={styles.callButtonSecondary} onClick={() => { onClearDiscussion(); }}>
              Start fresh
            </button>
            <button type="button" className={styles.callButtonSecondary} onClick={() => { onClearDiscussion(); void ring('fresh'); }}>
              Ring fresh
            </button>
          </>
        )}
        {!live && !ringing && captions.length === 0 && (
          <button type="button" className={styles.callButton} data-cue="idle" onClick={() => void ring('fresh')}>
            Ring Jesse
          </button>
        )}
        {ringing && !live && (
          <>
            <p className={styles.callStatus} role="status">
              <span className={styles.callDot} data-speaking="false" aria-hidden="true" />
              Connecting… the ticket stays usable.
            </p>
            <button type="button" className={styles.callButtonSecondary} onClick={cancelRing}>
              Cancel
            </button>
          </>
        )}
        {live && (
          <>
            <p className={styles.callStatus} role="status" aria-live="polite">
              <span className={styles.callDot} data-speaking={speaking ? 'true' : 'false'} aria-hidden="true" />
              {statusLabel}
            </p>
            <button type="button" className={styles.callButtonSecondary} onClick={() => conversation.setMuted(!conversation.isMuted)} aria-pressed={conversation.isMuted}>
              {conversation.isMuted ? 'Microphone off' : 'Microphone on'}
            </button>
            <button type="button" className={styles.callButtonSecondary} onClick={endCall}>
              End call
            </button>
          </>
        )}
      </div>
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
        <p className={styles.callFoot}>Mic stays off until you ring. Voice fills the slip — only you can sign.</p>
      )}
    </section>
  );
}

/**
 * Outer shell owns captions / notes so remounting ConversationProvider never
 * wipes the discussion or closing line.
 */
export const JesseCall = memo(function JesseCall({
  jesse,
  take = null,
  onLiveChange,
  onUserSpoken,
  onAgentSpoken,
}: {
  jesse: JesseDesk;
  take?: string | null;
  onLiveChange?: (live: boolean) => void;
  onUserSpoken?: (text: string) => void;
  onAgentSpoken?: (text: string) => void;
}) {
  const [sessionKey, setSessionKey] = useState(0);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const handleLiveChange = useCallback((next: boolean) => {
    setLive(next);
    onLiveChange?.(next);
  }, [onLiveChange]);

  const remount = useCallback(() => {
    setSessionKey(k => k + 1);
  }, []);

  return (
    <ConversationProvider key={sessionKey}>
      <JesseCallInner
        jesse={jesse}
        take={take}
        captions={captions}
        onCaption={(c) => setCaptions(prev => appendCaption(prev, c))}
        onClearDiscussion={() => { setCaptions([]); setEndNote(null); setCallError(null); }}
        onLiveChange={handleLiveChange}
        onUserSpoken={onUserSpoken}
        onAgentSpoken={onAgentSpoken}
        endNote={endNote}
        callError={callError}
        onActivity={() => { setCallError(null); if (!live) setEndNote(null); }}
        onSessionEnded={(note) => {
          handleLiveChange(false);
          if (note) setEndNote(note);
          remount();
        }}
        onSessionFailed={(message) => {
          handleLiveChange(false);
          setCallError(message);
          remount();
        }}
      />
    </ConversationProvider>
  );
});
