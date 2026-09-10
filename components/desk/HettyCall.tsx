'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { fetchJson } from '@/lib/api-client';
import { resolveDeskAlias } from '@/lib/trading/catalog';
import { foregroundGuard, chooseInstrumentResult, setInstructionResult, setAmountResult, estimateSpokenResult, recordPaperGuard, watchTarget, describeDesk, deskNoteSpokenLine, DESK_NOTE_ALREADY_SHARED, RECORD_UNAVAILABLE_MESSAGE, deskSymbol, hettyOpeningLine, hettyClosingLine, appliedTicketLine } from '@/lib/trading/voice-tools';
import { estimateUsable } from '@/lib/trading/workflow';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import styles from './WorkingDesk.module.css';

type Desk = ReturnType<typeof useTradingDesk>;
type ToolParams = Record<string, unknown>;
type ToolResult = Promise<string>;

/**
 * Hetty's line — a live ElevenLabs voice session. Her tool calls are
 * client tools: they execute against this desk in the caller's browser,
 * so the ticket visibly drafts, quotes and records as she speaks.
 *
 * Boundary: she can draft, request estimates and record paper trades.
 * She cannot sign, submit or reconcile — nothing moves onchain.
 *
 * The line is a way to work at the desk, not somewhere the client goes
 * instead of the desk: connecting is immediate and cancellable, the
 * opening names what is actually on the paper, conversation changes the
 * ticket, review is quiet, and ending reports the work — not the wire.
 *
 * Reliability model: the SDK provider's startSession silently no-ops while
 * a conversation or lock ref is still held, and a backgrounded or frozen
 * tab can kill the socket without events — a stale line then refuses every
 * future ring. So the session lifecycle is owned here, not by the parent:
 * every terminal event (disconnect, error, the dial watchdog, page hide,
 * bfcache restore) funnels through exactly one of onSessionEnded /
 * onSessionFailed, and the outer shell answers each by remounting the
 * ConversationProvider — every ring gets a fresh socket. The closing note
 * and any error survive the remount as props. Continuity between calls is
 * carried by the ticket, not by audio memory: the next opening line is
 * built from the draft on the paper.
 */

type HettyTools = {
  choose_instrument: (p: ToolParams) => ToolResult;
  set_instruction: (p: ToolParams) => ToolResult;
  set_amount: (p: ToolParams) => ToolResult;
  request_estimate: () => ToolResult;
  record_paper: () => ToolResult;
  cancel_instruction: () => ToolResult;
  describe_desk: () => ToolResult;
  watch_mark: (p: ToolParams) => ToolResult;
  share_desk_note: () => ToolResult;
};

type Caption = { role: 'user' | 'agent'; text: string; at: number };

/** A ring that has not connected within this window is treated as failed. */
const DIAL_TIMEOUT_MS = 20_000;

/* A restrained receiver click — one short transient on lift, nothing more.
   The room may sound historical; the information stays clear. No telephone
   filtering, no continuous crackle. */
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
  } catch { /* silence is an acceptable receiver */ }
}

function HettyCallInner({ desk, liveMode, onLiveChange, onUserSpoken, onAgentSpoken, endNote, callError, onActivity, onSessionEnded, onSessionFailed }: {
  desk: Desk;
  /** The desk's paper/live boundary — Hetty must speak the same one. */
  liveMode: boolean;
  onLiveChange: (live: boolean) => void;
  onUserSpoken?: (text: string) => void;
  onAgentSpoken?: (text: string) => void;
  /* Notes are owned by the outer shell so they survive session remounts. */
  endNote: string | null;
  callError: string | null;
  onActivity: () => void;
  onSessionEnded: (note: string | null) => void;
  onSessionFailed: (message: string) => void;
}) {
  const deskRef = useRef(desk);
  useEffect(() => { deskRef.current = desk; });
  const liveModeRef = useRef(liveMode);
  useEffect(() => { liveModeRef.current = liveMode; });

  const waitFor = useCallback((predicate: (d: Desk) => boolean, ms: number) =>
    new Promise<boolean>(resolve => {
      const deadline = Date.now() + ms;
      const tick = () => {
        if (predicate(deskRef.current)) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    }), []);

  useConversationClientTool<HettyTools>('choose_instrument', async (p) => {
    const d = deskRef.current;
    const refusal = foregroundGuard(d.foreground);
    if (refusal) return refusal;
    const query = String(p.query ?? '');
    const instrument = resolveDeskAlias(query);
    if (!instrument) return chooseInstrumentResult(query);
    d.edit({ ...d.state.draft, instrumentId: instrument.id });
    return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
  });

  useConversationClientTool<HettyTools>('set_instruction', async (p) => {
    const d = deskRef.current;
    const refusal = foregroundGuard(d.foreground);
    if (refusal) return refusal;
    const side = String(p.side ?? '');
    if (side !== 'buy' && side !== 'sell') return setInstructionResult(side);
    d.edit(side === 'buy'
      ? { ...d.state.draft, side: 'buy', unit: 'USDC' }
      : { ...d.state.draft, side: 'sell', unit: 'token' });
    return setInstructionResult(side);
  });

  useConversationClientTool<HettyTools>('set_amount', async (p) => {
    const d = deskRef.current;
    const refusal = foregroundGuard(d.foreground);
    if (refusal) return refusal;
    const clean = String(p.amount ?? '').trim();
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
      return `"${clean || 'That'}" is not a usable amount — say a plain number, like 25 or 0.5.`;
    }
    d.edit({ ...d.state.draft, amount: clean });
    return setAmountResult(d.state.draft.side, clean);
  });

  useConversationClientTool<HettyTools>('request_estimate', async () => {
    const d = deskRef.current;
    const refusal = foregroundGuard(d.foreground);
    if (refusal) return refusal;
    if (d.state.stage === 'loading') return 'An estimate is already on its way.';
    const before = d.state.quote?.id;
    await d.requestQuote();
    await waitFor(x => x.state.stage === 'review' || x.state.stage === 'draft', 4000);
    const now = deskRef.current;
    const quote = now.state.quote;
    if (now.state.stage === 'review' && quote && quote.id !== before) return estimateSpokenResult(quote, Date.now(), liveModeRef.current);
    return `The estimate did not come through${now.error ? ` — ${now.error}` : ''}. Offer to adjust or retry.`;
  });

  useConversationClientTool<HettyTools>('record_paper', async () => {
    const d = deskRef.current;
    const refusal = recordPaperGuard(d.state, d.foreground, d.historyReady, Date.now());
    if (refusal) return refusal;
    d.save();
    await waitFor(x => x.state.stage === 'saved' || x.error !== null, 3000);
    const now = deskRef.current;
    return now.state.stage === 'saved'
      ? liveModeRef.current
        ? 'Recorded as a paper trade, filed to the ledger — nothing moved onchain. For the real trade, the Execute button on the slip is the caller’s alone.'
        : 'Recorded — a paper trade, filed to the ledger. Nothing moved onchain.'
      : `The record did not save${now.error ? ` — ${now.error}` : ''}.`;
  });

  useConversationClientTool<HettyTools>('watch_mark', async (p) => {
    const d = deskRef.current;
    if (d.foreground.kind === 'missing') return RECORD_UNAVAILABLE_MESSAGE;
    const query = String(p.query ?? '').trim();
    const instrumentId = watchTarget(d.foreground, query);
    if (!instrumentId) return 'No instrument to watch — name one, or put a stock on the ticket first.';
    d.watch(instrumentId);
    return `${deskSymbol(instrumentId)} is watched on this desk — it will be in the tray next visit.`;
  });

  useConversationClientTool<HettyTools>('cancel_instruction', async () => {
    const d = deskRef.current;
    const refusal = foregroundGuard(d.foreground);
    if (refusal) return refusal;
    d.cancel();
    return 'The ticket is clear.';
  });

  useConversationClientTool<HettyTools>('describe_desk', async () => {
    const d = deskRef.current;
    return describeDesk(d.state, d.foreground, d.records, d.watched);
  });

  /* The note of the day is furniture, not document state: it is speakable on
     any foreground, but once per call, and the line is exactly the desk
     note — Hetty never improvises an aphorism. Never during review. */
  useConversationClientTool<HettyTools>('share_desk_note', async () => {
    if (deskNoteShared.current) return DESK_NOTE_ALREADY_SHARED;
    deskNoteShared.current = true;
    return deskNoteSpokenLine(deskRef.current.deskId);
  });

  /* Immediate, cancellable dialling. The SDK only reports `connecting`
     after startSession — this flag acknowledges the ring the moment it is
     pressed, stays cancellable through the session-URL fetch, and guards
     against a late connection opening after the client has left. */
  const [dialing, setDialing] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const dialCancelledRef = useRef(false);
  const ringGenRef = useRef(0);
  const endedByUserRef = useRef(false);
  /* True from ring() until a terminal callback fires — the page-lifecycle
     handlers use it to tell a live session apart from an idle provider. */
  const sessionActiveRef = useRef(false);
  /* One terminal callback per mount: onError and onDisconnect often arrive
     together, and only the first may decide how the session is reported. */
  const terminalFiredRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = useDeskAuth();
  const authRef = useRef(auth);
  useEffect(() => { authRef.current = auth; });

  // Transcript capture — stored to the account only when signed in.
  // Anonymous calls leave no record, consistent with the tier model.
  const deskNoteShared = useRef(false);
  const turnsRef = useRef<Array<{ role: 'user' | 'agent'; text: string; at: number }>>([]);
  const convIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const flushedRef = useRef(false);

  const flushTranscript = useCallback(async () => {
    if (flushedRef.current || !convIdRef.current || turnsRef.current.length === 0) return;
    flushedRef.current = true;
    const a = authRef.current;
    if (!a.authenticated) return;
    try {
      const token = await a.getAccessToken();
      if (!token) return;
      await fetch('/api/hetty/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId: convIdRef.current,
          turns: turnsRef.current.slice(0, 500),
          startedAt: startedAtRef.current || Date.now(),
          endedAt: Date.now(),
        }),
      });
    } catch { /* transcript loss is not a desk error */ }
  }, []);

  /* The two terminal paths. Each fires at most once per mount, flushes the
     transcript, and hands the outer shell what it needs to remount the
     provider while keeping the note on screen. */
  const fireEnded = useCallback((note: string | null) => {
    if (terminalFiredRef.current) return;
    terminalFiredRef.current = true;
    sessionActiveRef.current = false;
    void flushTranscript();
    onSessionEnded(note);
  }, [flushTranscript, onSessionEnded]);

  const fireFailed = useCallback((message: string) => {
    if (terminalFiredRef.current) return;
    terminalFiredRef.current = true;
    sessionActiveRef.current = false;
    setDialing(false);
    void flushTranscript();
    onSessionFailed(message);
  }, [flushTranscript, onSessionFailed]);

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
      const turn = { role: user ? 'user' as const : 'agent' as const, text: text.slice(0, 4000), at: Date.now() };
      turnsRef.current.push(turn);
      setCaptions(prev => [...prev.slice(-19), { role: turn.role, text: text.slice(0, 600), at: turn.at }]);
      // Two sides of the same exchange: what the caller said, what Hetty
      // actually replied. The ticket carries the caller's words for noisy
      // rooms; the line carries both, because a recognised utterance is not
      // proof an instruction was resolved.
      if (user) {
        if (text.length <= 300) onUserSpoken?.(text);
      } else {
        if (text.length <= 600) onAgentSpoken?.(text);
      }
    },
    onConversationMetadata: (m: { conversation_id?: string }) => { convIdRef.current = m?.conversation_id ?? null; },
    onConnect: () => {
      // A late connection must never open after the client has left.
      if (dialCancelledRef.current) {
        hangUp();
        return;
      }
      startedAtRef.current = Date.now();
      turnsRef.current = [];
      setCaptions([]);
      convIdRef.current = null;
      flushedRef.current = false;
      deskNoteShared.current = false;
      endedByUserRef.current = false;
      onActivity();
      setDialing(false);
      receiverClick();
    },
    onDisconnect: () => {
      onLiveChange(false);
      setDialing(false);
      const d = deskRef.current;
      /* By the time a disconnect arrives, an error (if any) has already
         claimed the terminal slot — so this only runs for clean hangups
         and genuinely dropped lines. */
      const note = hettyClosingLine(d.state, d.foreground, endedByUserRef.current ? 'ended' : 'dropped');
      endedByUserRef.current = false;
      fireEnded(note);
    },
  });
  const live = conversation.status === 'connected';
  const sdkConnecting = conversation.status === 'connecting';
  const ringing = dialing || sdkConnecting;

  /* The single way the line comes down. Mute first so the audio pipeline
     stops feeding the socket, then endSession — guarded by the latest
     status so a dead provider is never asked to close again. (Mic chunks
     already in flight can still hit a closing socket and log the SDK's
     "already in CLOSING or CLOSED state" error; muting shrinks that window,
     it cannot remove it — the SDK's sendMessage has no readyState guard.) */
  const statusRef = useRef(conversation.status);
  useEffect(() => { statusRef.current = conversation.status; });
  const hangUp = useCallback(() => {
    if (statusRef.current !== 'connected' && statusRef.current !== 'connecting') return;
    try { conversation.setMuted(true); } catch { /* no input to mute */ }
    try { conversation.endSession(); } catch { /* already closed */ }
  }, [conversation]);

  useEffect(() => { onLiveChange(live); }, [live, onLiveChange]);

  /* Unmount: cancel any in-flight ring and bring the line down through the
     same guarded path. The provider's own unmount cleanup also ends the
     session, so this is promptness, not correctness. */
  const hangUpRef = useRef(hangUp);
  useEffect(() => { hangUpRef.current = hangUp; });
  useEffect(() => () => {
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    hangUpRef.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* A ring that never connects must not be a dead end: if the line is
     still dialling when the watchdog fires, bring it down and say so —
     the remount returns the desk to ringable. */
  useEffect(() => {
    if (!ringing || live) return;
    const timer = setTimeout(() => {
      hangUp();
      fireFailed('The line did not answer. Check the microphone permission and ring again.');
    }, DIAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ringing, live, hangUp, fireFailed]);

  /* A hidden or frozen tab kills the socket silently, and the SDK can keep
     believing it is connected — the next ring then dies on the stale line.
     End the call deliberately on the way out, and after a bfcache restore:
     the remount guarantees the next ring is a fresh conversation. */
  useEffect(() => {
    const endForLeave = () => {
      if (!sessionActiveRef.current && statusRef.current === 'disconnected') return;
      hangUp();
      const d = deskRef.current;
      fireEnded(hettyClosingLine(d.state, d.foreground, 'ended'));
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') endForLeave(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) endForLeave(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', endForLeave);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', endForLeave);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [hangUp, fireEnded]);

  const cancelRing = useCallback(() => {
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    setDialing(false);
    hangUp();
    /* A pending startSession can leave the provider's lock held until it
       settles — remount instead of trusting it. */
    fireEnded(null);
  }, [hangUp, fireEnded]);

  const endCall = useCallback(() => {
    endedByUserRef.current = true;
    dialCancelledRef.current = true;
    ringGenRef.current += 1;
    setDialing(false);
    hangUp();
    /* If the socket is already silently dead no disconnect event may come
       back — land the closing note ourselves rather than hang the UI. */
    endTimerRef.current = setTimeout(() => {
      const d = deskRef.current;
      fireEnded(hettyClosingLine(d.state, d.foreground, 'ended'));
    }, 2000);
  }, [hangUp, fireEnded]);

  const ring = async () => {
    if (dialing || sdkConnecting || live) return;
    dialCancelledRef.current = false;
    endedByUserRef.current = false;
    sessionActiveRef.current = true;
    const gen = ++ringGenRef.current;
    // Acknowledge immediately — before the session-URL request — so the
    // client never wonders whether the ring was heard. The ticket stays
    // usable throughout; no artificial ringing delay.
    setDialing(true);
    onActivity();
    receiverClick();
    const result = await fetchJson<{ signedUrl?: string }>('/api/hetty/session', { method: 'POST', cache: 'no-store' });
    if (dialCancelledRef.current || ringGenRef.current !== gen) return;
    if (!result.ok) {
      const e = result.error;
      const msg = e.retryAfterSeconds
        ? `The line is busy. Try again in about ${Math.max(1, Math.ceil(e.retryAfterSeconds / 5) * 5)} seconds.`
        : e.code === 'not_connected'
          ? 'Hetty’s line is not connected on this deployment.'
          : e.message;
      fireFailed(msg);
      return;
    }
    if (!result.data.signedUrl) {
      fireFailed('Hetty’s line is unavailable. Please try again shortly.');
      return;
    }
    // The opening already knows the foreground: recognition before
    // interrogation. Recomputed here — the ticket stayed usable while the
    // line connected, so the desk may have moved since the ring.
    const d = deskRef.current;
    const opening = hettyOpeningLine(d.state, d.foreground);
    try {
      await (conversation.startSession as unknown as (opts: Record<string, unknown>) => unknown)({
        signedUrl: result.data.signedUrl,
        overrides: { agent: { firstMessage: opening } },
        dynamicVariables: {
          desk_foreground: d.foreground.kind,
          desk_instrument: d.foreground.instrumentId ?? '',
          desk_stage: d.state.stage,
          desk_mode: liveModeRef.current ? 'live' : 'paper',
        },
      });
    } catch {
      if (dialCancelledRef.current || ringGenRef.current !== gen) return;
      fireFailed('The line could not be opened. Check the microphone permission and ring again.');
    }
  };

  /* Truthful line states — only what real SDK or desk events support.
     Not speaking does not mean listening, especially muted or waiting. */
  const estimating = desk.state.stage === 'loading' || desk.foreground.kind === 'pending';
  const inReview = desk.foreground.kind === 'quotation';
  const speaking = live && conversation.isSpeaking;
  const statusKey = ringing ? 'connecting' : !live ? 'idle' : estimating ? 'estimating' : speaking ? 'speaking' : inReview ? 'review' : conversation.isMuted ? 'muted' : 'on';
  const statusLabel = ringing
    ? 'Connecting'
    : !live
      ? 'Direct line'
      : estimating
        ? 'Requesting estimate'
        : speaking
          ? 'Hetty speaking'
          : inReview
            ? 'For your review'
            : conversation.isMuted
              ? 'Microphone muted'
              : 'Microphone on';

  const lastUser = [...captions].reverse().find(c => c.role === 'user') ?? null;
  const lastAgent = [...captions].reverse().find(c => c.role === 'agent') ?? null;
  const applied = live || captions.length > 0 ? appliedTicketLine(desk.state, desk.foreground) : null;

  const callNote = desk.foreground.kind === 'missing'
    ? 'That paper record is no longer in this browser. Return to the instruction.'
    : desk.foreground.kind === 'archive'
      ? 'A filed record is on the ticket. It is for reading until you return to the instruction.'
      : live && inReview
        ? 'The quotation is on the slip. Take your time — Hetty will hold the line.'
        : 'Speak your instruction. Review it on the same ticket.';

  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" data-live={live ? 'true' : 'false'} data-state={statusKey}>
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty Green <small>AI BROKER · BASE</small></h2>
        <span className={styles.callLine} data-live={live ? 'true' : 'false'}>
          <span className={styles.callDot} data-speaking={speaking ? 'true' : 'false'} aria-hidden="true" />
          {live ? 'CONNECTED' : ringing ? 'CONNECTING' : 'DIRECT LINE'}
        </span>
      </div>
      <p className={styles.callNote}>{callNote}</p>
      <div className={styles.callActions}>
        {!live && !ringing && (
          <button type="button" className={styles.callButton} onClick={() => void ring()}>
            {desk.state.draft.instrumentId ? 'Ring Hetty with this instruction' : 'Ring Hetty'}
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
          {lastUser && <p className={styles.captionLine}><span>You said.</span> {lastUser.text}</p>}
          {lastAgent && <p className={styles.captionLine} data-voice="hetty"><span>Hetty replied.</span> {lastAgent.text}</p>}
          {applied && <p className={styles.captionApplied}>{applied}</p>}
          {captions.length > 2 && (
            <details className={styles.captionHistory}>
              <summary>Conversation ({captions.length})</summary>
              <ol>
                {captions.map((c, i) => (
                  <li key={`${c.at}-${i}`} data-voice={c.role}>
                    <span>{c.role === 'user' ? 'You' : 'Hetty'}.</span> {c.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      {!live && !ringing && endNote && <p role="status" className={styles.callEnded}>{endNote}</p>}
      {callError && <p role="alert" className={styles.callError}>{callError}</p>}
      <p className={styles.callFoot}>
        Your browser will ask for the microphone when you ring.{auth.enabled ? ' Signed in? A transcript is saved to your account for 30 days; anonymous calls store nothing.' : ''}
      </p>
    </section>
  );
}

/* The outer shell owns the session lifecycle: every terminal event remounts
   the ConversationProvider (fresh socket, fresh locks), while the closing
   note and any error persist across the remount as props. */
export const HettyCall = memo(function HettyCall({ desk, liveMode, onLiveChange, onUserSpoken, onAgentSpoken }: { desk: Desk; liveMode: boolean; onLiveChange: (live: boolean) => void; onUserSpoken?: (text: string) => void; onAgentSpoken?: (text: string) => void }) {
  const [sessionKey, setSessionKey] = useState(0);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const handleActivity = useCallback(() => { setEndNote(null); setCallError(null); }, []);
  const handleEnded = useCallback((note: string | null) => {
    setCallError(null);
    setEndNote(note);
    setSessionKey(k => k + 1);
  }, []);
  const handleFailed = useCallback((message: string) => {
    setEndNote(null);
    setCallError(message);
    setSessionKey(k => k + 1);
  }, []);
  return (
    <ConversationProvider key={sessionKey}>
      <HettyCallInner
        desk={desk}
        liveMode={liveMode}
        onLiveChange={onLiveChange}
        onUserSpoken={onUserSpoken}
        onAgentSpoken={onAgentSpoken}
        endNote={endNote}
        callError={callError}
        onActivity={handleActivity}
        onSessionEnded={handleEnded}
        onSessionFailed={handleFailed}
      />
    </ConversationProvider>
  );
});
