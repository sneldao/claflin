'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { fetchJson } from '@/lib/api-client';
import { resolveDeskAlias } from '@/lib/trading/catalog';
import { foregroundGuard, chooseInstrumentResult, nextInstructionDraft, setInstructionResult, setAmountResult, estimateSpokenResult, recordPaperGuard, watchTarget, describeDesk, deskNoteSpokenLine, explainConceptResult, DESK_NOTE_ALREADY_SHARED, RECORD_UNAVAILABLE_MESSAGE, deskSymbol, hettyOpeningLine, hettyClosingLine, appliedTicketLine } from '@/lib/trading/voice-tools';
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
 * ConversationProvider — every ring gets a fresh socket. The closing note,
 * any error, and the discussion itself survive the remount as props and
 * shell state. Continuity between calls is carried by the ticket and the
 * surviving discussion — never by audio memory: the next opening line is
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
  explain_concept: (p: ToolParams) => ToolResult;
};

/** One side of the spoken line. Captions are furniture beside the ticket —
 *  faced across a remount they survive, because the caller's work does. */
export type Caption = { role: 'user' | 'agent'; text: string; at: number };

const CAPTION_LIMIT = 50;

/** Append-only caption store owned above the resettable voice provider, so a
 *  dropped socket never wipes the conversation. Bounded and newest-last;
 *  callers pass the previous array back in. */
export function appendCaption(previous: readonly Caption[], caption: Caption): Caption[] {
  const next = [...previous, caption];
  return next.length > CAPTION_LIMIT ? next.slice(next.length - CAPTION_LIMIT) : next;
}

/** Latest caption for a side, or null when that side has not spoken yet. */
export function lastCaption(captions: readonly Caption[], role: Caption['role']): Caption | null {
  for (let i = captions.length - 1; i >= 0; i--) {
    if (captions[i].role === role) return captions[i];
  }
  return null;
}

/** A short inspectable summary of the discussion so far — the last exchange,
 *  never authority. The ticket stays the instruction of record. */
export function summarizeDiscussion(captions: readonly Caption[]): string | null {
  const user = lastCaption(captions, 'user');
  const agent = lastCaption(captions, 'agent');
  if (!user && !agent) return null;
  const parts: string[] = [];
  if (user) parts.push(`You said: ${user.text}`);
  if (agent) parts.push(`Hetty replied: ${agent.text}`);
  return `Last exchange — ${parts.join(' ')} (${captions.length} ${captions.length === 1 ? 'line' : 'lines'} this session). The ticket holds the instruction.`;
}

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

export type TranscriptSaveState = {
  status: 'idle' | 'saving' | 'saved' | 'failed';
  attempts: number;
};

function HettyCallInner({ desk, liveMode, captions, onCaption, saveState, onSaveState, onClearDiscussion, onLiveChange, onUserSpoken, onAgentSpoken, endNote, callError, onActivity, onSessionEnded, onSessionFailed }: {
  desk: Desk;
  /** The desk's paper/live boundary — Hetty must speak the same one. */
  liveMode: boolean;
  /** Discussion owned above the resettable provider — survives remounts. */
  captions: Caption[];
  onCaption: (caption: Caption) => void;
  /** Visible transcript save status — owned by the shell, survives remounts. */
  saveState: TranscriptSaveState;
  onSaveState: (state: TranscriptSaveState) => void;
  /** Deliberate reset of the surviving discussion ("Start fresh"). */
  onClearDiscussion: () => void;
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
  /* Captions live above the resettable provider — the inner callback only
     forwards; the shell owns the append so a dropped socket never wipes the
     conversation. */
  const captionsRef = useRef(captions);
  useEffect(() => { captionsRef.current = captions; });
  const onCaptionRef = useRef(onCaption);
  useEffect(() => { onCaptionRef.current = onCaption; });
  const onSaveStateRef = useRef(onSaveState);
  useEffect(() => { onSaveStateRef.current = onSaveState; });

  /* Idempotent transcript checkpointing: bounded saves during the call plus
     one terminal flush. The server is the record of what was stored — the
     saved flag moves only on an ok response with { stored: true }, never
     before the attempt. Retention cleanup never deletes a live call. */

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
    const next = nextInstructionDraft(d.state.draft, side);
    d.edit(next.draft);
    return setInstructionResult(side, next.amountCleared);
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

  /* Reviewed catalog only — same material as the screen. Hold while an
     estimate is in flight; during review, answer if the caller asks. */
  useConversationClientTool<HettyTools>('explain_concept', async (p) => {
    if (deskRef.current.state.stage === 'loading') {
      return 'Hold the explanation — an estimate is coming in. Ask again in a moment.';
    }
    return explainConceptResult(String(p.topic ?? ''));
  });

  /* Immediate, cancellable dialling. The SDK only reports `connecting`
     after startSession — this flag acknowledges the ring the moment it is
     pressed, stays cancellable through the session-URL fetch, and guards
     against a late connection opening after the client has left. */
  const [dialing, setDialing] = useState(false);
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
  /** Turns acknowledged by a successful server write — not a latch. */
  const ackTurnsRef = useRef(0);
  /** Owner at call start — mid-call account switches must not reattribute the transcript. */
  const transcriptOwnerRef = useRef<string | null>(null);
  const checkpointTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveStateRef = useRef<{ status: 'idle' | 'saving' | 'saved' | 'failed'; attempts: number }>({ status: 'idle', attempts: 0 });
  const savingRef = useRef(false);

  /** POST a snapshot of turns. Each successful save acknowledges only the
   *  turn count it sent; newer turns remain unsaved. Server revision ordering
   *  rejects older checkpoints that arrive late. */
  const postTranscript = useCallback(async (endedAt: number, turnCount: number): Promise<boolean> => {
    const conversationId = convIdRef.current;
    const turns = turnsRef.current.slice(0, turnCount);
    if (!conversationId || turns.length === 0) return false;
    const a = authRef.current;
    if (!a.authenticated || !a.userId) return false;
    if (transcriptOwnerRef.current && a.userId !== transcriptOwnerRef.current) return false;
    let token: string | null = null;
    try { token = await a.getAccessToken(); } catch { return false; }
    if (!token) return false;
    try {
      const res = await fetch('/api/hetty/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId,
          turns: turns.slice(0, 500),
          startedAt: startedAtRef.current || Date.now(),
          endedAt,
          revision: turnCount,
        }),
      });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as { stored?: unknown } | null;
      return body?.stored === true;
    } catch { return false; }
  }, []);

  /* Bounded checkpoint during the call: every 20s when there are turns newer
     than the last acknowledged snapshot. A failed checkpoint retries later. */
  const checkpointTranscript = useCallback(async () => {
    if (savingRef.current) return;
    const turnCount = turnsRef.current.length;
    if (!convIdRef.current || turnCount === 0 || turnCount <= ackTurnsRef.current) return;
    savingRef.current = true;
    saveStateRef.current = { status: 'saving', attempts: saveStateRef.current.attempts + 1 };
    onSaveStateRef.current({ ...saveStateRef.current });
    const ok = await postTranscript(Date.now(), turnCount);
    if (ok) {
      ackTurnsRef.current = Math.max(ackTurnsRef.current, turnCount);
      const caughtUp = turnsRef.current.length <= ackTurnsRef.current;
      saveStateRef.current = { status: caughtUp ? 'saved' : 'idle', attempts: saveStateRef.current.attempts };
    } else {
      saveStateRef.current = { status: 'failed', attempts: saveStateRef.current.attempts };
    }
    savingRef.current = false;
    onSaveStateRef.current({ ...saveStateRef.current });
  }, [postTranscript]);

  const flushTranscript = useCallback(async () => {
    const turnCount = turnsRef.current.length;
    if (!convIdRef.current || turnCount === 0) return;
    if (turnCount <= ackTurnsRef.current && saveStateRef.current.status === 'saved') return;
    savingRef.current = true;
    const ok = await postTranscript(Date.now(), turnCount);
    if (ok) {
      ackTurnsRef.current = Math.max(ackTurnsRef.current, turnCount);
      saveStateRef.current = { status: 'saved', attempts: saveStateRef.current.attempts };
      onSaveStateRef.current({ ...saveStateRef.current });
    } else if (saveStateRef.current.status !== 'saved') {
      saveStateRef.current = { status: 'failed', attempts: saveStateRef.current.attempts };
      onSaveStateRef.current({ ...saveStateRef.current });
    }
    savingRef.current = false;
  }, [postTranscript]);

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
      onCaptionRef.current({ role: turn.role, text: text.slice(0, 600), at: turn.at });
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
      convIdRef.current = null;
      ackTurnsRef.current = 0;
      transcriptOwnerRef.current = authRef.current.userId;
      savingRef.current = false;
      saveStateRef.current = { status: 'idle', attempts: 0 };
      onSaveStateRef.current({ status: 'idle', attempts: 0 });
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

  /* Bounded checkpoint loop: while the call is live, save every 20s when
     there is something unsaved. The terminal flush covers the rest; the
     loop is promptness for long calls, not correctness. */
  useEffect(() => {
    if (!live) {
      if (checkpointTimerRef.current) { clearInterval(checkpointTimerRef.current); checkpointTimerRef.current = null; }
      return;
    }
    if (checkpointTimerRef.current) return;
    checkpointTimerRef.current = setInterval(() => { void checkpointTranscript(); }, 20_000);
    return () => {
      if (checkpointTimerRef.current) { clearInterval(checkpointTimerRef.current); checkpointTimerRef.current = null; }
    };
  }, [live, checkpointTranscript]);

  /* Flush on the way out — but a wallet handoff is not finishing the
     discussion. When the page is merely hidden (the caller switched to
     their wallet app), checkpoint what exists and keep the captions;
     the line remounts and the work resumes. True departure (pagehide,
     bfcache restore) still ends the call deliberately. */

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
     A wallet handoff (visibility hidden) checkpoints and keeps the
     discussion; the remount returns a fresh line and the work resumes.
     True departure (pagehide, bfcache restore) ends the call deliberately:
     the remount guarantees the next ring is a fresh conversation. */
  useEffect(() => {
    const endForLeave = () => {
      if (!sessionActiveRef.current && statusRef.current === 'disconnected') return;
      hangUp();
      const d = deskRef.current;
      fireEnded(hettyClosingLine(d.state, d.foreground, 'ended'));
    };
    const onHidden = () => {
      // Wallet handoff, not a goodbye: save progress, keep the captions,
      // bring the line down through the guarded path without a closing note.
      // Reconnection never reactivates the microphone — the next ring starts muted.
      void checkpointTranscript();
      hangUp();
      if (!sessionActiveRef.current && statusRef.current === 'disconnected') return;
      sessionActiveRef.current = false;
      try { conversation.setMuted(true); } catch { /* no input to mute */ }
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
  }, [hangUp, fireEnded, checkpointTranscript, conversation, onSessionEnded]);

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
    const opening = hettyOpeningLine(d.state, d.foreground, liveModeRef.current);
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

  const lastUser = lastCaption(captions, 'user');
  const lastAgent = lastCaption(captions, 'agent');
  const discussion = summarizeDiscussion(captions);
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
          {discussion && <p className={styles.captionApplied}>{discussion}</p>}
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
          {!live && !ringing && captions.length > 0 && (
            <button type="button" className={styles.callButtonSecondary} onClick={onClearDiscussion}>
              Start fresh
            </button>
          )}
        </div>
      )}
      {!live && !ringing && endNote && <p role="status" className={styles.callEnded}>{endNote}</p>}
      {callError && <p role="alert" className={styles.callError}>{callError}</p>}
      {auth.enabled && saveState.status !== 'idle' && (
        <p role="status" className={styles.captionApplied} data-save-state={saveState.status}>
          {saveState.status === 'saving' ? 'Saving the conversation…'
            : saveState.status === 'saved' ? 'Conversation saved to your account (30 days).'
            : 'The conversation could not be saved to your account. The ticket keeps the instruction.'}
        </p>
      )}
      <p className={styles.callFoot}>
        Your browser will ask for the microphone when you ring.{auth.enabled ? ' Signed in? A transcript is saved to your account for 30 days; anonymous calls store nothing.' : ''}
      </p>
    </section>
  );
}

/* The outer shell owns the session lifecycle: every terminal event remounts
   the ConversationProvider (fresh socket, fresh locks), while the closing
   note, any error, and the discussion itself persist across the remount —
   the line can break; the caller's work does not. */
export const HettyCall = memo(function HettyCall({ desk, liveMode, onLiveChange, onUserSpoken, onAgentSpoken }: { desk: Desk; liveMode: boolean; onLiveChange: (live: boolean) => void; onUserSpoken?: (text: string) => void; onAgentSpoken?: (text: string) => void }) {
  const [sessionKey, setSessionKey] = useState(0);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [saveState, setSaveState] = useState<TranscriptSaveState>({ status: 'idle', attempts: 0 });
  const handleCaption = useCallback((caption: Caption) => {
    setCaptions(previous => appendCaption(previous, caption));
  }, []);
  const handleSaveState = useCallback((state: TranscriptSaveState) => { setSaveState(state); }, []);
  /* The discussion is the caller's work: it survives across rings and
     remounts. A fresh call begins a fresh save/attempt counter, but keeps
     what was already said so the caller can resume the thread. "Start fresh"
     is the deliberate way to clear it. */
  const handleActivity = useCallback(() => { setEndNote(null); setCallError(null); setSaveState({ status: 'idle', attempts: 0 }); }, []);
  const clearDiscussion = useCallback(() => setCaptions([]), []);
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
        captions={captions}
        onCaption={handleCaption}
        saveState={saveState}
        onSaveState={handleSaveState}
        onClearDiscussion={clearDiscussion}
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
