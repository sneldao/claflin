'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { resolveDeskAlias } from '@/lib/trading/catalog';
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
    const query = String(p.query ?? '');
    const instrument = resolveDeskAlias(query);
    if (!instrument) {
      return `"${query || 'That'}" is not on this desk. Supported: NVDAc, AAPLc, METAc and GOOGLc — Coinbase-issued tokens on Base.`;
    }
    const d = deskRef.current;
    d.edit({ ...d.state.draft, instrumentId: instrument.id });
    return `${instrument.symbol} (${instrument.name}) is on the ticket.`;
  });

  useConversationClientTool<HettyTools>('set_instruction', async (p) => {
    const side = String(p.side ?? '');
    const d = deskRef.current;
    if (side === 'buy') {
      d.edit({ instrumentId: d.state.draft.instrumentId, side: 'buy', unit: 'USDC', amount: '' });
      return 'Buy set — the amount is a USDC spend.';
    }
    if (side === 'sell') {
      d.edit({ instrumentId: d.state.draft.instrumentId, side: 'sell', unit: 'token', amount: '' });
      return 'Sell set — the amount is a token quantity.';
    }
    return 'The instruction must be buy or sell.';
  });

  useConversationClientTool<HettyTools>('set_amount', async (p) => {
    const clean = String(p.amount ?? '').trim();
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(clean)) {
      return `"${clean || 'That'}" is not a usable amount — say a plain number, like 25 or 0.5.`;
    }
    const d = deskRef.current;
    d.edit({ ...d.state.draft, amount: clean });
    const unit = d.state.draft.side === 'sell' ? 'tokens' : 'USDC';
    return `${clean} ${unit} is on the ticket.`;
  });

  useConversationClientTool<HettyTools>('request_estimate', async () => {
    const d = deskRef.current;
    if (d.state.stage === 'loading') return 'An estimate is already on its way.';
    const before = d.state.quote?.id;
    await d.requestQuote();
    await waitFor(x => x.state.stage === 'review' || x.state.stage === 'draft', 4000);
    const now = deskRef.current;
    const quote = now.state.quote;
    if (now.state.stage === 'review' && quote && quote.id !== before) {
      const window_ = Math.max(0, Math.ceil((quote.expiresAt - Date.now()) / 1000));
      return `Estimate on the slip: the caller would spend ${quote.inputAmount} ${quote.inputSymbol} and receive ${quote.outputAmount} ${quote.outputSymbol}, via Aerodrome on Base. ${window_} seconds to review before it expires. It is a paper estimate — not an offer.`;
    }
    return `The estimate did not come through${now.error ? ` — ${now.error}` : ''}. Offer to adjust or retry.`;
  });

  useConversationClientTool<HettyTools>('record_paper', async () => {
    const d = deskRef.current;
    if (d.state.stage !== 'review' || !d.state.quote) return 'There is no estimate under review. Request one first.';
    if (!estimateUsable(d.state.quote, Date.now())) return 'That estimate has expired — request a fresh one before recording.';
    if (!d.historyReady) return 'Browser storage is unavailable, so nothing can be recorded right now.';
    d.save();
    await waitFor(x => x.state.stage === 'saved' || x.error !== null, 3000);
    const now = deskRef.current;
    return now.state.stage === 'saved'
      ? 'Recorded — a paper trade, in this browser only. Nothing moved onchain.'
      : `The record did not save${now.error ? ` — ${now.error}` : ''}.`;
  });

  useConversationClientTool<HettyTools>('cancel_instruction', async () => {
    deskRef.current.cancel();
    return 'The ticket is clear.';
  });

  useConversationClientTool<HettyTools>('describe_desk', async () => {
    const d = deskRef.current;
    const draft = d.state.draft;
    const parts: string[] = [];
    parts.push(draft.instrumentId ? `Instrument: ${resolveDeskAlias(draft.instrumentId)?.symbol ?? 'set'}.` : 'No instrument chosen.');
    parts.push(draft.amount ? `${draft.side} ${draft.amount} ${draft.unit}.` : 'No amount set.');
    if (d.state.stage === 'review' && d.state.quote) {
      const q = d.state.quote;
      const usable = estimateUsable(q, Date.now());
      parts.push(`Estimate under review: spend ${q.inputAmount} ${q.inputSymbol}, receive ${q.outputAmount} ${q.outputSymbol}${usable ? '' : ' — expired'}.`);
    }
    if (d.state.stage === 'saved') parts.push('The last paper trade is recorded.');
    if (d.records.length) parts.push(`${d.records.length} paper record${d.records.length === 1 ? '' : 's'} in this browser.`);
    return parts.join(' ');
  });

  const [callError, setCallError] = useState<string | null>(null);
  const auth = useDeskAuth();
  const authRef = useRef(auth);
  useEffect(() => { authRef.current = auth; });

  // Transcript capture — stored to the account only when signed in.
  // Anonymous calls leave no record, consistent with the tier model.
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
      setCallError(null);
    },
    onDisconnect: () => { onLiveChange(false); void flushTranscript(); },
  });
  const live = conversation.status === 'connected';
  const connecting = conversation.status === 'connecting';

  useEffect(() => { onLiveChange(live || connecting); }, [live, connecting, onLiveChange]);
  useEffect(() => () => { conversation.endSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = async () => {
    setCallError(null);
    try {
      const response = await fetch('/api/hetty/session', { method: 'POST', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.signedUrl) throw new Error(typeof body.message === 'string' ? body.message : 'Hetty’s line is unavailable.');
      conversation.startSession({ signedUrl: body.signedUrl });
    } catch (e) {
      setCallError(e instanceof Error ? e.message : 'Hetty’s line is unavailable.');
    }
  };

  return (
    <section className={styles.call} aria-labelledby="call-title" data-live={live ? 'true' : 'false'}>
      <p className={styles.eyebrow}>THE LINE</p>
      <h2 id="call-title" className={styles.boardTitle}>Speak with Hetty.</h2>
      <p className={styles.callNote}>
        A live voice session on this desk. Hetty can draft your instruction, request a live estimate, and — only when you say so — record a paper trade. She cannot place real orders; nothing moves onchain.
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
