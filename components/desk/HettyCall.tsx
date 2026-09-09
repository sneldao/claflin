'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { fetchJson } from '@/lib/api-client';
import { resolveDeskAlias } from '@/lib/trading/catalog';
import { foregroundGuard, chooseInstrumentResult, setInstructionResult, setAmountResult, estimateSpokenResult, recordPaperGuard, watchTarget, describeDesk, deskNoteSpokenLine, DESK_NOTE_ALREADY_SHARED, RECORD_UNAVAILABLE_MESSAGE, deskSymbol } from '@/lib/trading/voice-tools';
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

function HettyCallInner({ desk, onLiveChange }: { desk: Desk; onLiveChange: (live: boolean) => void }) {
  const deskRef = useRef(desk);
  useEffect(() => { deskRef.current = desk; });

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
    if (side === 'buy') {
      d.edit({ instrumentId: d.state.draft.instrumentId, side: 'buy', unit: 'USDC', amount: '' });
    } else {
      d.edit({ instrumentId: d.state.draft.instrumentId, side: 'sell', unit: 'token', amount: '' });
    }
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
    if (now.state.stage === 'review' && quote && quote.id !== before) return estimateSpokenResult(quote, Date.now());
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
      ? 'Recorded — a paper trade, filed to the ledger. Nothing moved onchain.'
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
     note — Hetty never improvises an aphorism. */
  useConversationClientTool<HettyTools>('share_desk_note', async () => {
    if (deskNoteShared.current) return DESK_NOTE_ALREADY_SHARED;
    deskNoteShared.current = true;
    return deskNoteSpokenLine(deskRef.current.deskId);
  });

  const [callError, setCallError] = useState<string | null>(null);
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

  const conversation = useConversation({
    onError: (e: unknown) => setCallError(
      /notallowed|permission|denied|getusermedia/i.test(String((e as { name?: string; message?: string })?.name ?? '') + ' ' + String((e as { message?: string })?.message ?? e))
        ? 'The microphone was not allowed. Grant mic access and ring again.'
        : 'The line dropped. Ring again when you are ready.'
    ),
    onMessage: (m: { message: string; role?: string; source?: string }) => {
      const text = typeof m.message === 'string' ? m.message.trim() : '';
      if (!text) return;
      turnsRef.current.push({ role: (m.role === 'user' || m.source === 'user') ? 'user' : 'agent', text: text.slice(0, 4000), at: Date.now() });
    },
    onConversationMetadata: (m: { conversation_id?: string }) => { convIdRef.current = m?.conversation_id ?? null; },
    onConnect: () => {
      startedAtRef.current = Date.now();
      turnsRef.current = [];
      convIdRef.current = null;
      flushedRef.current = false;
      deskNoteShared.current = false;
      setCallError(null);
    },
    onDisconnect: () => { onLiveChange(false); void flushTranscript(); },
  });
  const live = conversation.status === 'connected';
  const connecting = conversation.status === 'connecting';

  useEffect(() => { onLiveChange(live); }, [live, onLiveChange]);
  useEffect(() => () => { conversation.endSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = async () => {
    setCallError(null);
    const result = await fetchJson<{ signedUrl?: string }>('/api/hetty/session', { method: 'POST', cache: 'no-store' });
    if (!result.ok) {
      const e = result.error;
      setCallError(e.retryAfterSeconds
        ? `The line is busy. Try again in about ${Math.max(1, Math.ceil(e.retryAfterSeconds / 5) * 5)} seconds.`
        : e.code === 'not_connected'
          ? 'Hetty’s line is not connected on this deployment.'
          : e.message);
      return;
    }
    if (!result.data.signedUrl) {
      setCallError('Hetty’s line is unavailable. Please try again shortly.');
      return;
    }
    try {
      conversation.startSession({ signedUrl: result.data.signedUrl });
    } catch {
      setCallError('The line could not be opened. Check the microphone permission and ring again.');
    }
  };

  return (
    <section id="hetty" className={styles.call} aria-labelledby="call-title" data-live={live ? 'true' : 'false'}>
      <div className={styles.brokerPlate}>
        <h2 id="call-title">Hetty Green <small>AI BROKER · BASE</small></h2>
        <span className={styles.callLine} data-live={live ? 'true' : 'false'}>
          <span className={styles.callDot} data-speaking={live && conversation.isSpeaking ? 'true' : 'false'} aria-hidden="true" />
          {live ? 'CONNECTED' : connecting ? 'RINGING' : 'DIRECT LINE'}
        </span>
      </div>
      <p className={styles.callNote}>
        {desk.foreground.kind === 'missing'
          ? 'That paper record is no longer in this browser. Return to the instruction.'
          : desk.foreground.kind === 'archive'
          ? 'A filed record is on the ticket. It is for reading until you return to the instruction.'
          : 'Speak your instruction. Review it on the same ticket.'}
      </p>
      <div className={styles.callActions}>
        {!live && !connecting && (
          <button type="button" className={styles.callButton} onClick={() => void ring()}>
            Ring Hetty
          </button>
        )}
        {connecting && <p className={styles.callStatus} role="status">Calling the desk…</p>}
        {live && (
          <>
            <p className={styles.callStatus} role="status">
              <span className={styles.callDot} data-speaking={conversation.isSpeaking ? 'true' : 'false'} aria-hidden="true" />
              {conversation.isSpeaking ? 'Hetty is speaking' : 'Hetty is listening'}
            </p>
            <button type="button" className={styles.callButtonSecondary} onClick={() => conversation.setMuted(!conversation.isMuted)}>
              {conversation.isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className={styles.callButtonSecondary} onClick={() => conversation.endSession()}>
              End the call
            </button>
          </>
        )}
      </div>
      {callError && <p role="alert" className={styles.callError}>{callError}</p>}
      <p className={styles.callFoot}>
        Your browser will ask for the microphone when you ring.{auth.enabled ? ' Signed in? A transcript is saved to your account for 30 days; anonymous calls store nothing.' : ''}
      </p>
    </section>
  );
}

export const HettyCall = memo(function HettyCall({ desk, onLiveChange }: { desk: Desk; onLiveChange: (live: boolean) => void }) {
  return (
    <ConversationProvider>
      <HettyCallInner desk={desk} onLiveChange={onLiveChange} />
    </ConversationProvider>
  );
});
