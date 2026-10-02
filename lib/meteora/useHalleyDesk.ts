/**
 * Halley seated-desk session — the Meteora launch desk's document owner.
 * Same invariants as the other controller desks: one path files paper
 * (`file` on a fresh estimate under review), edits invalidate an
 * under-review estimate, a desk switch parks the session whole, and late
 * async answers die against the generation counter.
 *
 * Halley files *launch* records, not fills — a paper launch is the intent
 * and its projected curve, never a deployed mint or a position.
 *
 * Client-side: fetch ports are injected for tests; storage is browser-local.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeskDocumentSession, DeskForegroundDocument } from '../desk/contracts';
import {
  isHalleyLaunchIntent,
  type HalleyDraft,
  type HalleyLaunchEstimate,
  type HalleyLaunchIntent,
} from './contracts';
import {
  clearHalleyDraft,
  deleteHalleyPaperRecord,
  loadHalleyDraft,
  loadHalleyPaperRecords,
  saveHalleyDraft,
  saveHalleyPaperRecord,
  type HalleyPaperRecord,
} from './paper';
import { createHalleyEstimatePort } from './desk-ports';

export type HalleyStage = 'draft' | 'estimating' | 'review' | 'saved';

export interface HalleyDeskState {
  stage: HalleyStage;
  draft: HalleyDraft;
  estimate: HalleyLaunchEstimate | null;
  notice: string | null;
}

export interface HalleyDesk extends DeskDocumentSession {
  state: HalleyDeskState;
  inFlight: boolean;
  records: HalleyPaperRecord[];
  historyReady: boolean;
  storageError: string | null;
  viewedRecordId: string | null;
  foreground: DeskForegroundDocument;
  edit: (partial: Partial<HalleyDraft>) => void;
  estimate: () => void;
  file: () => boolean;
  cancel: () => void;
  openRecord: (id: string) => void;
  dismissRecord: () => void;
  removeRecord: (id: string) => void;
}

const EMPTY_DRAFT: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};

function emptyState(): HalleyDeskState {
  return { stage: 'draft', draft: { ...EMPTY_DRAFT }, estimate: null, notice: null };
}

function draftIntent(draft: HalleyDraft): HalleyLaunchIntent | null {
  const intent = {
    name: draft.name ?? '',
    symbol: draft.symbol ?? '',
    anchorSymbol: draft.anchorSymbol,
    quoteSymbol: draft.quoteSymbol ?? '',
    curve: draft.curve ?? ('equity-pair' as const),
    supply: draft.supply ?? '',
    graduationQuote: draft.graduationQuote ?? '',
  };
  return isHalleyLaunchIntent(intent) ? intent : null;
}

function halleyForeground(
  state: HalleyDeskState,
  viewedRecordId: string | null,
  records: HalleyPaperRecord[] | undefined,
): DeskForegroundDocument {
  const viewed = viewedRecordId ? records?.find(r => r.id === viewedRecordId) : undefined;
  if (viewedRecordId) {
    if (!records) return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
    if (!viewed) return { kind: 'missing', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
    if (state.stage === 'saved' && state.estimate?.id === viewedRecordId) {
      return { kind: 'receipt', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
    }
    return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
  }
  if (state.stage === 'estimating') {
    return { kind: 'pending', quoteId: null, recordId: null, instrumentId: null, actionable: false, readonly: false };
  }
  if (state.stage === 'review' && state.estimate) {
    return { kind: 'quotation', quoteId: state.estimate.id, recordId: null, instrumentId: null, actionable: true, readonly: false };
  }
  if (state.stage === 'saved' && state.estimate) {
    return { kind: 'receipt', quoteId: state.estimate.id, recordId: state.estimate.id, instrumentId: null, actionable: false, readonly: true };
  }
  return { kind: 'draft', quoteId: null, recordId: null, instrumentId: null, actionable: true, readonly: false };
}

export function useHalleyDesk(
  ports: {
    estimate?: (intent: HalleyLaunchIntent) => Promise<HalleyLaunchEstimate>;
    storage?: () => (Storage | null);
    now?: () => number;
  } = {},
): HalleyDesk {
  const estimatePort = useMemo(() => ports.estimate ?? createHalleyEstimatePort(), [ports.estimate]);
  const storageOf = useMemo(() => ports.storage ?? (() => (typeof window === 'undefined' ? null : window.localStorage)), [ports.storage]);
  const now = ports.now ?? Date.now;

  const [state, setState] = useState<HalleyDeskState>(emptyState);
  const [records, setRecords] = useState<HalleyPaperRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [viewedRecordId, setViewedRecordId] = useState<string | null>(null);
  const genRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reloadRecords = useCallback(() => {
    const storage = storageOf();
    if (!storage) { setHistoryReady(true); return; }
    try {
      setRecords(loadHalleyPaperRecords(storage));
      setStorageError(null);
    } catch {
      setStorageError('Paper records could not be read on this browser.');
    }
    setHistoryReady(true);
  }, [storageOf]);

  useEffect(() => { reloadRecords(); }, [reloadRecords]);

  useEffect(() => {
    const storage = storageOf();
    if (!storage) return;
    const draft = loadHalleyDraft(storage);
    if (Object.values(draft).some(v => v !== null)) {
      setState(current => current.stage === 'draft' && !current.draft.name ? { ...current, draft } : current);
    }
  }, [storageOf]);

  const persistDraft = useCallback((draft: HalleyDraft) => {
    const storage = storageOf();
    if (!storage) return;
    try {
      saveHalleyDraft(storage, draft);
    } catch { /* draft resume is optional — never block the desk */ }
  }, [storageOf]);

  const edit = useCallback((partial: Partial<HalleyDraft>) => {
    genRef.current += 1;
    setState(current => {
      const draft = { ...current.draft, ...partial };
      persistDraft(draft);
      /* An edit rewrites the launch instruction — an estimate bound to the
         old draft can no longer be filed under it. */
      return { stage: 'draft', draft, estimate: null, notice: null };
    });
    setViewedRecordId(null);
  }, [persistDraft]);

  const cancel = useCallback(() => {
    genRef.current += 1;
    const storage = storageOf();
    if (storage) { try { clearHalleyDraft(storage); } catch { /* optional */ } }
    setState(emptyState());
  }, [storageOf]);

  const estimate = useCallback(() => {
    const current = stateRef.current;
    const intent = draftIntent(current.draft);
    if (!intent || current.stage === 'estimating') return;
    const gen = ++genRef.current;
    setState({ stage: 'estimating', draft: current.draft, estimate: null, notice: null });
    void (async () => {
      let result: HalleyLaunchEstimate;
      try {
        result = await estimatePort(intent);
      } catch (error) {
        if (genRef.current !== gen) return;
        setState({ stage: 'draft', draft: current.draft, estimate: null,
          notice: error instanceof Error ? error.message : 'The desk could not project this curve. Please retry.' });
        return;
      }
      if (genRef.current !== gen) return;
      setState({ stage: 'review', draft: current.draft, estimate: result, notice: null });
    })();
  }, [estimatePort]);

  const file = useCallback((): boolean => {
    const current = stateRef.current;
    if (current.stage !== 'review' || !current.estimate) return false;
    const storage = storageOf();
    if (!storage) { setStorageError('Browser storage is unavailable — the record cannot be filed.'); return false; }
    try {
      const record = saveHalleyPaperRecord(storage, current.estimate, now());
      setRecords(existing => existing.some(r => r.id === record.id)
        ? existing.map(r => (r.id === record.id ? record : r))
        : [record, ...existing]);
      const draft = { ...current.draft };
      persistDraft({ ...EMPTY_DRAFT });
      setState({ stage: 'saved', draft, estimate: record.estimate, notice: null });
      setViewedRecordId(record.id);
      return true;
    } catch (error) {
      setState(latest => ({ ...latest,
        notice: error instanceof Error ? error.message : 'The record could not be filed. Review a fresh estimate.' }));
      return false;
    }
  }, [now, storageOf, persistDraft]);

  const openRecord = useCallback((id: string) => setViewedRecordId(id), []);
  const dismissRecord = useCallback(() => setViewedRecordId(null), []);
  const removeRecord = useCallback((id: string) => {
    const storage = storageOf();
    if (!storage) { setStorageError('Browser storage is unavailable.'); return; }
    try {
      deleteHalleyPaperRecord(storage, id);
      setRecords(existing => existing.filter(r => r.id !== id));
      if (viewedRecordId === id) setViewedRecordId(null);
    } catch {
      setStorageError('The paper record could not be removed.');
    }
  }, [storageOf, viewedRecordId]);

  const foreground = useMemo(
    () => halleyForeground(state, viewedRecordId, historyReady ? records : undefined),
    [state, viewedRecordId, records, historyReady],
  );

  return {
    state,
    inFlight: state.stage === 'estimating',
    records,
    historyReady,
    storageError,
    viewedRecordId,
    foreground,
    edit,
    estimate,
    file,
    cancel,
    openRecord,
    dismissRecord,
    removeRecord,
  };
}
