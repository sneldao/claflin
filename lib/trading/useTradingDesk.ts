'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { OPEN_DESK_ID, getHouseDesk, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { parseIntent, type TradeIntent } from './domain';
import { deskReducer, estimateUsable, initialDesk, parseEstimate } from './workflow';
import { deletePaperRecord, loadPaperRecords, savePaperRecord, type PaperRecord } from './paper-records';
import { ARCHIVE_READONLY, activeRecordId, browsingArchive, canFileForeground, foregroundDocument, readPersistedDraft, watchStorageKey, writePersistedDraft } from './desk-documents';
import { DESK_INSTRUMENTS } from './catalog';
import { canReviewOnDesk, emptyDraft, switchDeskSession, type ParkedDesk } from './desk-mandate';

const WATCH_MAX = 12;

function loadWatched(storage: Storage, deskId: HouseDeskId): string[] {
  if (!isOpenDesk(deskId)) return [];
  try {
    const raw = JSON.parse(storage.getItem(watchStorageKey(deskId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const known = new Set(DESK_INSTRUMENTS.map(s => s.id));
    return raw.filter((id): id is string => typeof id === 'string' && known.has(id)).slice(0, WATCH_MAX);
  } catch { return []; }
}

function readHistory(deskId: HouseDeskId): PaperRecord[] {
  return isOpenDesk(deskId) ? loadPaperRecords(window.localStorage, deskId) : [];
}

export function useTradingDesk() {
  const [deskId, setDeskId] = useState<HouseDeskId>(OPEN_DESK_ID);
  const [state, dispatch] = useReducer(deskReducer, emptyDraft(), initialDesk);
  const [records, setRecords] = useState<PaperRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [viewedRecordId, setViewedRecordId] = useState<string | null>(null);
  const [deskReady, setDeskReady] = useState(false);
  const request = useRef<AbortController | null>(null);
  const requestGen = useRef(0);
  const saveLock = useRef(false);
  const sessions = useRef<Partial<Record<HouseDeskId, ParkedDesk>>>({});
  const deskIdRef = useRef(deskId);
  deskIdRef.current = deskId;

  const loadHistory = useCallback(() => {
    try { setRecords(readHistory(deskIdRef.current)); setHistoryReady(true); setStorageError(null); }
    catch { setHistoryReady(false); setStorageError('Your paper history could not be read. Nothing has been changed. Check browser storage before saving.'); }
  }, []);

  /* Loading initial paper history and syncing with browser storage is intentionally done in an effect;
     localStorage is not available during SSR and the storage event is an external subscription. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadHistory();
    setWatched(loadWatched(window.localStorage, OPEN_DESK_ID));
    const restored = readPersistedDraft(window.localStorage, OPEN_DESK_ID);
    if (restored) dispatch({ type: 'edit', draft: restored });
    setDeskReady(true);
    window.addEventListener('storage', loadHistory);
    return () => { request.current?.abort(); window.removeEventListener('storage', loadHistory); };
  }, [loadHistory]);
  useEffect(() => {
    if (!deskReady || !isOpenDesk(deskId)) return;
    try { writePersistedDraft(window.localStorage, state, deskId); } catch { /* draft resume is optional */ }
  }, [deskReady, deskId, state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const edit = useCallback((draft: TradeIntent) => {
    if (browsingArchive(state, viewedRecordId)) {
      setError(ARCHIVE_READONLY);
      return;
    }
    request.current?.abort();
    requestGen.current += 1;
    setError(null);
    setViewedRecordId(null);
    dispatch({ type: 'edit', draft });
  }, [state, viewedRecordId]);

  const requestQuote = useCallback(async () => {
    if (!isOpenDesk(deskId)) {
      setError('This desk is not open.');
      return;
    }
    if (browsingArchive(state, viewedRecordId)) {
      setError(ARCHIVE_READONLY);
      return;
    }
    setError(null);
    let intent: TradeIntent;
    try { intent = parseIntent(state.draft); }
    catch { setError('Choose a stock and enter an amount. Buy with USDC; sell a token quantity.'); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const requestId = crypto.randomUUID();
    const originDesk = deskId;
    const gen = ++requestGen.current;
    dispatch({ type: 'request', requestId });
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/stocks/quote?${new URLSearchParams(intent)}`, { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (requestGen.current !== gen || deskIdRef.current !== originDesk) return;
      if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message.slice(0, 240) : 'An estimate is unavailable. Please retry.');
      let result;
      try { result = parseEstimate(body); } catch { throw new Error('The estimate could not be verified. Please request a new one.'); }
      if (!estimateUsable(result, Date.now())) throw new Error('The estimate expired while loading. Please retry.');
      if (!canReviewOnDesk(result, originDesk)) throw new Error('This quotation belongs to another desk.');
      dispatch({ type: 'quoted', requestId, quote: result });
    } catch (e) {
      if (requestGen.current !== gen || deskIdRef.current !== originDesk) return;
      dispatch({ type: 'failed', requestId, message: controller.signal.aborted ? 'The request was cancelled or timed out. You can retry.' : e instanceof Error ? e.message : 'An estimate is unavailable.' });
    } finally { clearTimeout(timeout); }
  }, [deskId, state, viewedRecordId]);

  const save = useCallback(() => {
    if (saveLock.current || !historyReady) return;
    if (!canFileForeground(state, viewedRecordId) || !state.quote || !canReviewOnDesk(state.quote, deskId)) {
      setError(browsingArchive(state, viewedRecordId) ? ARCHIVE_READONLY : 'This desk cannot file that quotation.');
      return;
    }
    saveLock.current = true;
    try {
      const saved = savePaperRecord(window.localStorage, state, Date.now(), deskId);
      setRecords(previous => [saved, ...previous.filter(record => record.id !== saved.id)]);
      setViewedRecordId(saved.id);
      dispatch({ type: 'saved', quoteId: saved.id, now: saved.createdAt });
      setError(null);
    } catch { setError('Not filed. Your quotation is still here. The estimate may have expired, or browser storage may be unavailable.'); }
    finally { saveLock.current = false; }
  }, [deskId, historyReady, state, viewedRecordId]);

  const cancel = useCallback(() => {
    if (browsingArchive(state, viewedRecordId)) {
      setError(ARCHIVE_READONLY);
      return;
    }
    request.current?.abort();
    requestGen.current += 1;
    setViewedRecordId(null);
    dispatch({ type: 'cancel' });
    setError(null);
  }, [state, viewedRecordId]);

  const openRecord = useCallback((id: string) => {
    setViewedRecordId(id);
    setError(null);
  }, []);

  const dismissRecord = useCallback(() => {
    setViewedRecordId(null);
  }, []);

  const removeRecord = useCallback((id: string) => {
    try {
      deletePaperRecord(window.localStorage, id);
      if (viewedRecordId === id) setViewedRecordId(null);
      if (state.quote?.id === id) {
        request.current?.abort();
        requestGen.current += 1;
        setError(null);
        dispatch({ type: 'edit', draft: emptyDraft() });
      }
      loadHistory();
    } catch { setStorageError('This paper record could not be deleted. Check browser storage and try again.'); }
  }, [loadHistory, state.quote?.id, viewedRecordId]);

  const watch = useCallback((instrumentId: string) => {
    if (!isOpenDesk(deskId) || !DESK_INSTRUMENTS.some(s => s.id === instrumentId)) return;
    setWatched(previous => {
      const next = previous.includes(instrumentId) ? previous : [instrumentId, ...previous].slice(0, WATCH_MAX);
      try { window.localStorage.setItem(watchStorageKey(deskId), JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, [deskId]);

  const unwatch = useCallback((instrumentId: string) => {
    if (!isOpenDesk(deskId)) return;
    setWatched(previous => {
      const next = previous.filter(id => id !== instrumentId);
      try { window.localStorage.setItem(watchStorageKey(deskId), JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, [deskId]);

  const switchDesk = useCallback((id: HouseDeskId) => {
    if (id === deskId || !getHouseDesk(id)) return;
    request.current?.abort();
    requestGen.current += 1;
    if (isOpenDesk(deskId)) {
      try { writePersistedDraft(window.localStorage, state, deskId); } catch { /* draft resume is optional */ }
    }
    const { parked, entered } = switchDeskSession(
      { deskId, state, viewedRecordId, error },
      id,
      sessions.current,
      isOpenDesk(id) ? readPersistedDraft(window.localStorage, id) : null,
    );
    sessions.current = parked;
    setDeskId(entered.deskId);
    dispatch({ type: 'hydrate', state: entered.state });
    setViewedRecordId(entered.viewedRecordId);
    setError(entered.error);
    try {
      setRecords(readHistory(entered.deskId));
      setWatched(loadWatched(window.localStorage, entered.deskId));
      setHistoryReady(true);
      setStorageError(null);
    } catch {
      setHistoryReady(false);
      setStorageError('Your paper history could not be read. Nothing has been changed. Check browser storage before saving.');
    }
  }, [deskId, error, state, viewedRecordId]);

  const focusedRecordId = activeRecordId(state, viewedRecordId);
  const foreground = foregroundDocument(state, viewedRecordId);
  const activeDesk = getHouseDesk(deskId) ?? getHouseDesk(OPEN_DESK_ID)!;
  const open = isOpenDesk(deskId);

  return useMemo(
    () => ({
      deskId, activeDesk, open, switchDesk, foreground,
      state, records, historyReady, storageError, error, edit, requestQuote, save, cancel,
      loadHistory, removeRecord, watched, watch, unwatch,
      viewedRecordId, focusedRecordId, openRecord, dismissRecord,
    }),
    [deskId, activeDesk, open, switchDesk, foreground, state, records, historyReady, storageError, error, edit, requestQuote, save, cancel, loadHistory, removeRecord, watched, watch, unwatch, viewedRecordId, focusedRecordId, openRecord, dismissRecord],
  );
}
