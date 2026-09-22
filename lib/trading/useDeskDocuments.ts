'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from 'react';
import type { HouseDeskId } from '@/lib/house';
import type { EntryIntent } from '@/lib/house-entry';
import { usesLegacyDeskDocuments } from '@/lib/desk/registry';
import { fetchJson } from '../api-client';
import { parseIntent, type TradeIntent } from './domain';
import { deskReducer, estimateUsable, initialDesk, parseEstimate } from './workflow';
import { deletePaperRecord, loadPaperRecords, PAPER_OWNER_ANONYMOUS, recordVisibleToAccount, savePaperRecord, type PaperRecord } from './paper-records';
import { mintFirstPaperSlip } from './desk-slips';
import { canFileForeground, instructionLockMessage, instructionLocked, readRestorableDraft, watchStorageKey, writePersistedDraft } from './desk-documents';
import { DESK_INSTRUMENTS } from './catalog';
import { canReviewOnDesk, emptyDraft, type ParkedDesk } from './desk-mandate';

const WATCH_MAX = 12;
const HISTORY_ERROR = 'Your paper history could not be read. Nothing has been changed. Check browser storage before saving.';

function loadWatched(storage: Storage, deskId: HouseDeskId): string[] {
  if (!usesLegacyDeskDocuments(deskId)) return [];
  try {
    const raw = JSON.parse(storage.getItem(watchStorageKey(deskId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const known = new Set(DESK_INSTRUMENTS.map(s => s.id));
    return raw.filter((id): id is string => typeof id === 'string' && known.has(id)).slice(0, WATCH_MAX);
  } catch { return []; }
}

function readHistory(deskId: HouseDeskId, userId: string | null): PaperRecord[] {
  const all = usesLegacyDeskDocuments(deskId) ? loadPaperRecords(window.localStorage, deskId) : [];
  return all.filter(record => recordVisibleToAccount(record, userId));
}

/**
 * The working document: the draft under the ticket, the paper ledger behind
 * it, the watched marks beside it, and the in-flight estimate request. Entry
 * context (which desk, which record the URL asked for) is applied by the
 * composer through hydrate/restore; everything here is document state.
 */
export function useDeskDocuments({
  deskId,
  deskIdRef,
  userId,
  authenticated,
  requestRef,
  requestGenRef,
  active,
  resolved,
}: {
  deskId: HouseDeskId;
  deskIdRef: MutableRefObject<HouseDeskId>;
  userId: string | null;
  authenticated: boolean;
  requestRef: MutableRefObject<AbortController | null>;
  requestGenRef: MutableRefObject<number>;
  /** true while the entry phase is 'desk' — gates the storage subscription. */
  active: boolean;
  /** true once the initial entry has resolved — gates draft persistence. */
  resolved: boolean;
}) {
  const [state, dispatch] = useReducer(deskReducer, emptyDraft(), initialDesk);
  const [records, setRecords] = useState<PaperRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [viewedRecordId, setViewedRecordId] = useState<string | null>(null);
  const saveLock = useRef(false);
  const userIdRef = useRef(userId);
  /* Ref mirror for async callbacks — synced in an effect, not during render. */
  useEffect(() => { userIdRef.current = userId; });

  const reloadDeskData = useCallback((id: HouseDeskId) => {
    try {
      setRecords(readHistory(id, userIdRef.current));
      setWatched(loadWatched(window.localStorage, id));
      setHistoryReady(true);
      setStorageError(null);
    } catch {
      setHistoryReady(false);
      setStorageError(HISTORY_ERROR);
    }
  }, []);

  const loadHistory = useCallback(() => {
    reloadDeskData(deskIdRef.current);
  }, [deskIdRef, reloadDeskData]);

  const markHistoryReady = useCallback(() => {
    setHistoryReady(true);
  }, []);

  /** Fresh desk, fresh document — persisted draft restored, entry intent carried in. */
  const hydrate = useCallback((id: HouseDeskId, instrumentId: string | null, intent: EntryIntent | null, recordId: string | null) => {
    const persisted = usesLegacyDeskDocuments(id) ? readRestorableDraft(window.localStorage, id) ?? emptyDraft() : emptyDraft();
    let draft = instrumentId && usesLegacyDeskDocuments(id)
      ? { ...persisted, instrumentId }
      : persisted;
    if (usesLegacyDeskDocuments(id) && intent) {
      /* Carry the foyer's instruction onto the ticket — offering picks the
         instrument, the instruction's side and amount come with it. */
      if (intent.side === 'sell') draft = { ...draft, side: 'sell', unit: 'token' };
      else if (intent.side === 'buy') draft = { ...draft, side: 'buy', unit: 'USDC' };
      if (intent.amount) draft = { ...draft, amount: intent.amount };
    }
    dispatch({ type: 'hydrate', state: initialDesk(draft) });
    setViewedRecordId(recordId);
    setError(null);
    reloadDeskData(id);
  }, [reloadDeskData]);

  /** Swap in a parked (or fresh) desk document after a switch. */
  const restore = useCallback((id: HouseDeskId, parked: ParkedDesk) => {
    dispatch({ type: 'hydrate', state: parked.state });
    setViewedRecordId(parked.viewedRecordId);
    setError(parked.error);
    reloadDeskData(id);
  }, [reloadDeskData]);

  /* Loading initial paper history and syncing with browser storage is intentionally done in an effect;
     localStorage is not available during SSR and the storage event is an external subscription. */
  useEffect(() => {
    if (!active) return;
    loadHistory();
    window.addEventListener('storage', loadHistory);
    return () => window.removeEventListener('storage', loadHistory);
  }, [userId, active, loadHistory]);

  useEffect(() => {
    if (!resolved || !active || !usesLegacyDeskDocuments(deskId)) return;
    try { writePersistedDraft(window.localStorage, state, deskId); } catch { /* draft resume is optional */ }
  }, [resolved, active, deskId, state]);

  const knownRecords = historyReady ? records : undefined;

  const edit = useCallback((draft: TradeIntent) => {
    if (instructionLocked(state, viewedRecordId, knownRecords)) {
      setError(instructionLockMessage(state, viewedRecordId, knownRecords));
      return;
    }
    requestRef.current?.abort();
    requestGenRef.current += 1;
    setError(null);
    setViewedRecordId(null);
    dispatch({ type: 'edit', draft });
  }, [knownRecords, state, viewedRecordId, requestRef, requestGenRef]);

  const requestQuote = useCallback(async () => {
    if (!usesLegacyDeskDocuments(deskId)) {
      setError('This desk is not open.');
      return;
    }
    if (instructionLocked(state, viewedRecordId, knownRecords)) {
      setError(instructionLockMessage(state, viewedRecordId, knownRecords));
      return;
    }
    setError(null);
    let intent: TradeIntent;
    try { intent = parseIntent(state.draft); }
    catch { setError('Choose a stock and enter an amount. Buy with USDC; sell a token quantity.'); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestId = crypto.randomUUID();
    const originDesk = deskId;
    const gen = ++requestGenRef.current;
    dispatch({ type: 'request', requestId });
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetchJson<unknown>(`/api/desk/${deskId}/quote?${new URLSearchParams(intent)}`, { signal: controller.signal, cache: 'no-store' });
      if (requestGenRef.current !== gen || deskIdRef.current !== originDesk) return;
      if (!response.ok) throw new Error(response.error.message);
      let result;
      try { result = parseEstimate(response.data); } catch { throw new Error('The estimate could not be verified. Please request a new one.'); }
      if (!estimateUsable(result, Date.now())) throw new Error('The estimate expired while loading. Please retry.');
      if (!canReviewOnDesk(result, originDesk)) throw new Error('This quotation belongs to another desk.');
      dispatch({ type: 'quoted', requestId, quote: result });
    } catch (e) {
      if (requestGenRef.current !== gen || deskIdRef.current !== originDesk) return;
      dispatch({ type: 'failed', requestId, message: controller.signal.aborted ? 'The request was cancelled or timed out. You can retry.' : e instanceof Error ? e.message : 'An estimate is unavailable.' });
    } finally { clearTimeout(timeout); }
  }, [deskId, deskIdRef, knownRecords, state, viewedRecordId, requestRef, requestGenRef]);

  const save = useCallback(() => {
    if (saveLock.current || !historyReady) return;
    if (!canFileForeground(state, viewedRecordId, knownRecords) || !state.quote || !canReviewOnDesk(state.quote, deskId)) {
      setError(instructionLocked(state, viewedRecordId, knownRecords)
        ? instructionLockMessage(state, viewedRecordId, knownRecords)
        : 'This desk cannot file that quotation.');
      return;
    }
    saveLock.current = true;
    try {
      const owner = authenticated && userId ? userId : PAPER_OWNER_ANONYMOUS;
      const saved = savePaperRecord(window.localStorage, state, Date.now(), deskId, owner);
      try { mintFirstPaperSlip(window.localStorage, saved); } catch { /* keepsake must not block filing */ }
      setRecords(previous => [saved, ...previous.filter(record => record.id !== saved.id)]);
      setViewedRecordId(saved.id);
      dispatch({ type: 'saved', quoteId: saved.id, now: saved.createdAt });
      setError(null);
    } catch { setError('Not filed. Your quotation is still here. The estimate may have expired, or browser storage may be unavailable.'); }
    finally { saveLock.current = false; }
  }, [authenticated, userId, deskId, historyReady, knownRecords, state, viewedRecordId]);

  const cancel = useCallback(() => {
    if (instructionLocked(state, viewedRecordId, knownRecords)) {
      setError(instructionLockMessage(state, viewedRecordId, knownRecords));
      return;
    }
    requestRef.current?.abort();
    requestGenRef.current += 1;
    setViewedRecordId(null);
    dispatch({ type: 'cancel' });
    setError(null);
  }, [knownRecords, state, viewedRecordId, requestRef, requestGenRef]);

  const openRecord = useCallback((id: string) => {
    setViewedRecordId(id);
    setError(null);
  }, []);

  const dismissRecord = useCallback(() => {
    const gone = viewedRecordId && !records.find(record => record.id === viewedRecordId);
    if (gone && state.quote?.id === viewedRecordId) {
      requestRef.current?.abort();
      requestGenRef.current += 1;
      setError(null);
      dispatch({ type: 'edit', draft: emptyDraft() });
    }
    setViewedRecordId(null);
  }, [records, state.quote?.id, viewedRecordId, requestRef, requestGenRef]);

  const removeRecord = useCallback((id: string) => {
    try {
      deletePaperRecord(window.localStorage, id);
      if (viewedRecordId === id) setViewedRecordId(null);
      if (state.quote?.id === id) {
        requestRef.current?.abort();
        requestGenRef.current += 1;
        setError(null);
        dispatch({ type: 'edit', draft: emptyDraft() });
      }
      loadHistory();
    } catch { setStorageError('This paper record could not be deleted. Check browser storage and try again.'); }
  }, [loadHistory, state.quote?.id, viewedRecordId, requestRef, requestGenRef]);

  const watch = useCallback((instrumentId: string) => {
    if (!usesLegacyDeskDocuments(deskId) || !DESK_INSTRUMENTS.some(s => s.id === instrumentId)) return;
    setWatched(previous => {
      const next = previous.includes(instrumentId) ? previous : [instrumentId, ...previous].slice(0, WATCH_MAX);
      try { window.localStorage.setItem(watchStorageKey(deskId), JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, [deskId]);

  const unwatch = useCallback((instrumentId: string) => {
    if (!usesLegacyDeskDocuments(deskId)) return;
    setWatched(previous => {
      const next = previous.filter(id => id !== instrumentId);
      try { window.localStorage.setItem(watchStorageKey(deskId), JSON.stringify(next)); } catch { /* watching is optional */ }
      return next;
    });
  }, [deskId]);

  return useMemo(() => ({
    state, records, historyReady, storageError, error, watched, viewedRecordId, knownRecords,
    hydrate, restore, markHistoryReady, loadHistory,
    edit, requestQuote, save, cancel, openRecord, dismissRecord, removeRecord, watch, unwatch,
  }), [state, records, historyReady, storageError, error, watched, viewedRecordId, knownRecords, hydrate, restore, markHistoryReady, loadHistory, edit, requestQuote, save, cancel, openRecord, dismissRecord, removeRecord, watch, unwatch]);
}
