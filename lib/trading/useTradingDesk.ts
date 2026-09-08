'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { parseIntent, type TradeIntent } from './domain';
import { deskReducer, estimateUsable, initialDesk, parseEstimate } from './workflow';
import { deletePaperRecord, loadPaperRecords, savePaperRecord, type PaperRecord } from './paper-records';
import { DESK_INSTRUMENTS } from './catalog';

const emptyDraft: TradeIntent = { instrumentId: '', side: 'buy', amount: '', unit: 'USDC' };
const WATCH_KEY = 'claflin.watched.v1';
const WATCH_MAX = 12;

function loadWatched(storage: Storage): string[] {
  try {
    const raw = JSON.parse(storage.getItem(WATCH_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const known = new Set(DESK_INSTRUMENTS.map(s => s.id));
    return raw.filter((id): id is string => typeof id === 'string' && known.has(id)).slice(0, WATCH_MAX);
  } catch { return []; }
}

export function useTradingDesk() {
  const [state, dispatch] = useReducer(deskReducer, emptyDraft, initialDesk);
  const [records, setRecords] = useState<PaperRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const saveLock = useRef(false);

  const loadHistory = useCallback(() => {
    try { setRecords(loadPaperRecords(window.localStorage)); setHistoryReady(true); setStorageError(null); }
    catch { setHistoryReady(false); setStorageError('Your paper history could not be read. Nothing has been changed. Check browser storage before saving.'); }
  }, []);

  /* Loading initial paper history and syncing with browser storage is intentionally done in an effect;
     localStorage is not available during SSR and the storage event is an external subscription. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadHistory();
    setWatched(loadWatched(window.localStorage));
    window.addEventListener('storage', loadHistory);
    return () => { request.current?.abort(); window.removeEventListener('storage', loadHistory); };
  }, [loadHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const edit = useCallback((draft: TradeIntent) => {
    request.current?.abort();
    setError(null);
    dispatch({ type: 'edit', draft });
  }, []);

  const requestQuote = useCallback(async () => {
    setError(null);
    let intent: TradeIntent;
    try { intent = parseIntent(state.draft); }
    catch { setError('Choose a stock and enter an amount. Buy with USDC; sell a token quantity.'); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const requestId = crypto.randomUUID();
    dispatch({ type: 'request', requestId });
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/stocks/quote?${new URLSearchParams(intent)}`, { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message.slice(0, 240) : 'An estimate is unavailable. Please retry.');
      let result;
      try { result = parseEstimate(body); } catch { throw new Error('The estimate could not be verified. Please request a new one.'); }
      if (!estimateUsable(result, Date.now())) throw new Error('The estimate expired while loading. Please retry.');
      dispatch({ type: 'quoted', requestId, quote: result });
    } catch (e) {
      dispatch({ type: 'failed', requestId, message: controller.signal.aborted ? 'The request was cancelled or timed out. You can retry.' : e instanceof Error ? e.message : 'An estimate is unavailable.' });
    } finally { clearTimeout(timeout); }
  }, [state.draft]);

  const save = useCallback(() => {
    if (saveLock.current || !historyReady) return;
    saveLock.current = true;
    try {
      const saved = savePaperRecord(window.localStorage, state, Date.now());
      setRecords(previous => [saved, ...previous.filter(record => record.id !== saved.id)]);
      dispatch({ type: 'saved', quoteId: saved.id, now: saved.createdAt });
      setError(null);
    } catch { setError('The paper trade was not marked complete. Your estimate may have expired, or browser storage may be unavailable. Refresh the estimate or check storage and try again.'); }
    finally { saveLock.current = false; }
  }, [historyReady, state]);

  const cancel = useCallback(() => { request.current?.abort(); dispatch({ type: 'cancel' }); setError(null); }, []);

  const removeRecord = useCallback((id: string) => {
    try {
      deletePaperRecord(window.localStorage, id);
      if (state.quote?.id === id) {
        request.current?.abort();
        setError(null);
        dispatch({ type: 'edit', draft: state.draft });
      }
      loadHistory();
    } catch { setStorageError('This paper record could not be deleted. Check browser storage and try again.'); }
  }, [loadHistory, state.draft, state.quote?.id]);

  const watch = useCallback((instrumentId: string) => {
    if (!DESK_INSTRUMENTS.some(s => s.id === instrumentId)) return;
    setWatched(previous => {
      const next = previous.includes(instrumentId) ? previous : [instrumentId, ...previous].slice(0, WATCH_MAX);
      try { window.localStorage.setItem(WATCH_KEY, JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, []);

  const unwatch = useCallback((instrumentId: string) => {
    setWatched(previous => {
      const next = previous.filter(id => id !== instrumentId);
      try { window.localStorage.setItem(WATCH_KEY, JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, []);

  // The desk object is explicitly memoized so parent re-renders don't create new references for children.
  return useMemo(
    () => ({ state, records, historyReady, storageError, error, edit, requestQuote, save, cancel, loadHistory, removeRecord, watched, watch, unwatch }),
    [state, records, historyReady, storageError, error, edit, requestQuote, save, cancel, loadHistory, removeRecord, watched, watch, unwatch],
  );
}
