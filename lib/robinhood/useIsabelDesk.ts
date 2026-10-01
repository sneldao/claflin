/**
 * Isabel seated-desk session — the Robinhood Chain desk's document owner.
 *
 * Isabel has no voice line, so there is exactly one actor: the surface. A
 * plain generation-guarded async flow replaces Jesse's serialized command
 * queue — the invariants are unchanged: one path files paper (`file` on a
 * fresh estimate under review), edits invalidate an under-review estimate,
 * a desk switch parks the session whole because the hook lives above the
 * surface, and late async answers die against the generation counter.
 *
 * Client-side: fetch ports are injected for tests; storage is browser-local.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeskDocumentSession, DeskForegroundDocument } from '../desk/contracts';
import {
  isIsabelIntent,
  isRobinhoodInstrumentId,
  type IsabelDraft,
  type IsabelIntent,
  type RobinhoodInstrumentId,
  type RobinhoodPaperEstimate,
} from './contracts';
import { getRobinhoodInstrument } from './catalog';
import type { RobinhoodEvidence } from './duplex';
import {
  clearIsabelDraft,
  deleteIsabelPaperRecord,
  loadIsabelDraft,
  loadIsabelPaperRecords,
  saveIsabelDraft,
  saveIsabelPaperRecord,
  type IsabelPaperRecord,
} from './paper';
import { createIsabelEvidencePort, createIsabelQuotePort } from './desk-ports';

export type IsabelStage = 'draft' | 'quoting' | 'review' | 'saved';

export interface IsabelDeskState {
  stage: IsabelStage;
  draft: IsabelDraft;
  quote: RobinhoodPaperEstimate | null;
  /** The evidence tape fetched for the quote's instrument; null while
   *  loading or when the venue-duplex endpoint could not answer. */
  evidence: RobinhoodEvidence | null;
  notice: string | null;
}

export interface IsabelDesk extends DeskDocumentSession {
  state: IsabelDeskState;
  inFlight: boolean;
  records: IsabelPaperRecord[];
  historyReady: boolean;
  storageError: string | null;
  viewedRecordId: string | null;
  foreground: DeskForegroundDocument;
  edit: (partial: Partial<IsabelDraft>) => void;
  quote: () => void;
  file: () => boolean;
  cancel: () => void;
  openRecord: (id: string) => void;
  dismissRecord: () => void;
  removeRecord: (id: string) => void;
}

function emptyState(): IsabelDeskState {
  return {
    stage: 'draft',
    draft: { instrumentId: null, side: null, amount: null },
    quote: null,
    evidence: null,
    notice: null,
  };
}

function draftIntent(draft: IsabelDraft): IsabelIntent | null {
  if (!draft.instrumentId || !draft.side || !draft.amount) return null;
  const intent = {
    instrumentId: draft.instrumentId,
    side: draft.side,
    unit: draft.side === 'buy' ? 'USDG' : 'token',
    amount: draft.amount,
  };
  return isIsabelIntent(intent) ? intent : null;
}

function isabelForeground(
  state: IsabelDeskState,
  viewedRecordId: string | null,
  records: IsabelPaperRecord[] | undefined,
): DeskForegroundDocument {
  const viewed = viewedRecordId ? records?.find(r => r.id === viewedRecordId) : undefined;
  const instrumentId = viewed?.quote.intent.instrumentId
    ?? state.quote?.intent.instrumentId
    ?? state.draft.instrumentId
    ?? null;
  if (viewedRecordId) {
    if (!records) return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
    if (!viewed) return { kind: 'missing', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId: null, actionable: false, readonly: true };
    if (state.stage === 'saved' && state.quote?.id === viewedRecordId) {
      return { kind: 'receipt', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
    }
    return { kind: 'archive', quoteId: viewedRecordId, recordId: viewedRecordId, instrumentId, actionable: false, readonly: true };
  }
  if (state.stage === 'quoting') {
    return { kind: 'pending', quoteId: null, recordId: null, instrumentId, actionable: false, readonly: false };
  }
  if (state.stage === 'review' && state.quote) {
    return { kind: 'quotation', quoteId: state.quote.id, recordId: null, instrumentId, actionable: true, readonly: false };
  }
  if (state.stage === 'saved' && state.quote) {
    return { kind: 'receipt', quoteId: state.quote.id, recordId: state.quote.id, instrumentId, actionable: false, readonly: true };
  }
  return { kind: 'draft', quoteId: null, recordId: null, instrumentId, actionable: true, readonly: false };
}

export function useIsabelDesk(
  ports: {
    quote?: (intent: IsabelIntent) => Promise<RobinhoodPaperEstimate>;
    evidence?: (instrumentId: RobinhoodInstrumentId) => Promise<RobinhoodEvidence | null>;
    storage?: () => (Storage | null);
    now?: () => number;
  } = {},
): IsabelDesk {
  const quotePort = useMemo(() => ports.quote ?? createIsabelQuotePort(), [ports.quote]);
  const evidencePort = useMemo(() => ports.evidence ?? createIsabelEvidencePort(), [ports.evidence]);
  const storageOf = useMemo(() => ports.storage ?? (() => (typeof window === 'undefined' ? null : window.localStorage)), [ports.storage]);
  const now = ports.now ?? Date.now;

  const [state, setState] = useState<IsabelDeskState>(emptyState);
  const [records, setRecords] = useState<IsabelPaperRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [viewedRecordId, setViewedRecordId] = useState<string | null>(null);
  /* Generation guard: a newer command, a cancel, or a session restart kills
     a late quote/evidence response. */
  const genRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reloadRecords = useCallback(() => {
    const storage = storageOf();
    if (!storage) { setHistoryReady(true); return; }
    try {
      setRecords(loadIsabelPaperRecords(storage));
      setStorageError(null);
    } catch {
      setStorageError('Paper records could not be read on this browser.');
    }
    setHistoryReady(true);
  }, [storageOf]);

  useEffect(() => { reloadRecords(); }, [reloadRecords]);

  /* Restore the draft checkpoint once, on mount. */
  useEffect(() => {
    const storage = storageOf();
    if (!storage) return;
    const draft = loadIsabelDraft(storage);
    if (draft.instrumentId || draft.side || draft.amount) {
      setState(current => current.stage === 'draft' && !current.draft.instrumentId
        ? { ...current, draft }
        : current);
    }
  }, [storageOf]);

  const persistDraft = useCallback((draft: IsabelDraft) => {
    const storage = storageOf();
    if (!storage) return;
    try {
      saveIsabelDraft(storage, draft);
    } catch { /* draft resume is optional — never block the desk */ }
  }, [storageOf]);

  const edit = useCallback((partial: Partial<IsabelDraft>) => {
    genRef.current += 1;
    setState(current => {
      const draft = { ...current.draft, ...partial };
      persistDraft(draft);
      /* An edit rewrites the instruction — an estimate bound to the old one
         can no longer be filed under it. */
      return { stage: 'draft', draft, quote: null, evidence: null, notice: null };
    });
    setViewedRecordId(null);
  }, [persistDraft]);

  const cancel = useCallback(() => {
    genRef.current += 1;
    const storage = storageOf();
    if (storage) { try { clearIsabelDraft(storage); } catch { /* optional */ } }
    setState(emptyState());
  }, [storageOf]);

  const quote = useCallback(() => {
    const current = stateRef.current;
    const intent = draftIntent(current.draft);
    if (!intent || current.stage === 'quoting') return;
    const gen = ++genRef.current;
    setState({ stage: 'quoting', draft: current.draft, quote: null, evidence: null, notice: null });
    void (async () => {
      let estimate: RobinhoodPaperEstimate;
      try {
        estimate = await quotePort(intent);
      } catch (error) {
        if (genRef.current !== gen) return;
        setState({ stage: 'draft', draft: current.draft, quote: null, evidence: null,
          notice: error instanceof Error ? error.message : 'The venue could not provide a verified estimate. Please retry.' });
        return;
      }
      if (genRef.current !== gen) return;
      setState({ stage: 'review', draft: current.draft, quote: estimate, evidence: null, notice: null });
      /* The evidence tape follows the quote; its absence is a leg, not a
         failure. */
      void evidencePort(intent.instrumentId).then(evidence => {
        if (genRef.current !== gen) return;
        setState(latest => latest.stage === 'review' && latest.quote?.id === estimate.id
          ? { ...latest, evidence }
          : latest);
      });
    })();
  }, [quotePort, evidencePort]);

  const file = useCallback((): boolean => {
    const current = stateRef.current;
    if (current.stage !== 'review' || !current.quote) return false;
    const storage = storageOf();
    if (!storage) { setStorageError('Browser storage is unavailable — the record cannot be filed.'); return false; }
    let instrument;
    try {
      instrument = getRobinhoodInstrument(current.quote.intent.instrumentId);
    } catch {
      setStorageError('The instrument on this estimate is no longer in the catalog.');
      return false;
    }
    try {
      const record = saveIsabelPaperRecord(storage, {
        quote: current.quote,
        instrument,
        evidence: current.evidence,
      }, now());
      setRecords(existing => existing.some(r => r.id === record.id)
        ? existing.map(r => (r.id === record.id ? record : r))
        : [record, ...existing]);
      const draft = { ...current.draft };
      persistDraft({ instrumentId: null, side: null, amount: null });
      setState({ stage: 'saved', draft, quote: record.quote, evidence: record.evidence, notice: null });
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
      deleteIsabelPaperRecord(storage, id);
      setRecords(existing => existing.filter(r => r.id !== id));
      if (viewedRecordId === id) setViewedRecordId(null);
    } catch {
      setStorageError('The paper record could not be removed.');
    }
  }, [storageOf, viewedRecordId]);

  const foreground = useMemo(
    () => isabelForeground(state, viewedRecordId, historyReady ? records : undefined),
    [state, viewedRecordId, records, historyReady],
  );

  return {
    state,
    inFlight: state.stage === 'quoting',
    records,
    historyReady,
    storageError,
    viewedRecordId,
    foreground,
    edit,
    quote,
    file,
    cancel,
    openRecord,
    dismissRecord,
    removeRecord,
  };
}
