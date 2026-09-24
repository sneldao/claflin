'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDeskAuth } from '@/components/auth/AuthProvider';
import { OPEN_DESK_ID, getHouseDesk, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { documentEngineFor, EMPTY_DOCUMENT_SESSION, usesLegacyDeskDocuments } from '@/lib/desk/registry';
import type { DeskDocumentSession } from '@/lib/desk/contracts';
import { offeringCoversDesk, offeringForId } from '@/lib/desk/offerings';
import { clearDeskQuery, loadLastDesk, parseDeskQuery, parseEntryIntent, parseOfferingQuery, parseRecordQuery, resolveHouseEntry, saveLastDesk, syncDeskQuery, type EntryIntent } from '@/lib/house-entry';
import { useRecordUrl } from '@/lib/desk/use-record-url';
import { readRestorableDraft, writePersistedDraft } from './desk-documents';
import { emptyDraft, switchDeskSession, type ParkedDesk } from './desk-mandate';
import { initialDesk } from './workflow';
import { useJesseDesk } from '@/lib/solana/useJesseDesk';
import { useDeskEntry } from './useDeskEntry';
import { useDeskSession } from './useDeskSession';
import { useDeskDocuments } from './useDeskDocuments';

export type { HouseEntryPhase } from './useDeskEntry';

/**
 * The conductor: entry state, session identity, and document state live in
 * three hooks — this one owns the navigation contract between them (URL ⇄
 * desk, history, hydration) and composes the public desk object.
 */
export function useTradingDesk() {
  const auth = useDeskAuth();
  /* Shared request lifecycle — navigation aborts whatever a document has in
     flight, and a fresh quote request supersedes the one before it. */
  const requestRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const abortInFlight = useCallback(() => {
    requestRef.current?.abort();
    requestGenRef.current += 1;
  }, []);

  const {
    entryPhase, entryResolved, entryOfferingId, entryIntent, entryRecordId, entryGen,
    applyEntry, clearEntry, showPhase,
  } = useDeskEntry();
  const { deskId, deskIdRef, sessions, setDesk, resetSessions, parkSessions } = useDeskSession();
  /* The legacy reducer session — Hetty's document pipeline. */
  const documents = useDeskDocuments({
    deskId,
    deskIdRef,
    userId: auth.userId,
    authenticated: auth.authenticated,
    requestRef,
    requestGenRef,
    active: entryPhase === 'desk',
    resolved: entryResolved,
  });
  const {
    state, records, error, watched, viewedRecordId, focusedRecordId,
    hydrate: hydrateDocuments, restore: restoreDocuments, markHistoryReady, loadHistory,
    edit, requestQuote, save, cancel, watch, unwatch,
  } = documents;
  /* The controller session — Jesse's serialized command engine. It mounts
     once and outlives surface mounts, so a desk switch parks its work by
     keeping the session, the same contract parked reducer state gives Hetty. */
  const jesse = useJesseDesk();

  /* The active desk's document session under the shared contract — shared
     furniture (record URLs, foreground signals) reads this, never the
     engine-specific shape underneath. */
  const engine = documentEngineFor(deskId);
  const documentSession: DeskDocumentSession =
    engine === 'controller' ? jesse
    : engine === 'legacy-reducer' ? documents
    : EMPTY_DOCUMENT_SESSION;
  const sessionHistoryReady = documentSession.historyReady;
  const sessionViewedRecordId = documentSession.viewedRecordId;
  const sessionOpenRecord = documentSession.openRecord;
  const sessionDismissRecord = documentSession.dismissRecord;

  useRecordUrl(sessionViewedRecordId, deskId);

  /* The URL's record applies once per entry. The reducer engine consumes it
     inside hydrate; the controller session mounts after first paint, so it
     applies here as soon as the session is ready. */
  const appliedEntryGenRef = useRef(-1);
  useEffect(() => {
    if (engine !== 'controller' || !sessionHistoryReady) return;
    if (appliedEntryGenRef.current === entryGen) return;
    appliedEntryGenRef.current = entryGen;
    if (entryRecordId) sessionOpenRecord(entryRecordId);
    else if (sessionViewedRecordId) sessionDismissRecord();
  }, [engine, entryGen, entryRecordId, sessionHistoryReady, sessionViewedRecordId, sessionOpenRecord, sessionDismissRecord]);

  /** One hydrate crossing all three concerns: who sits where, what the URL carried, what the document holds. */
  const hydrateDesk = useCallback((id: HouseDeskId, offeringId?: string | null, intent?: EntryIntent | null, recordId?: string | null) => {
    const offering = offeringId ? offeringForId(offeringId) : null;
    const selectedInstrumentId = offering && offeringCoversDesk(offering, id) ? offering.instrumentId : null;
    setDesk(id);
    applyEntry({
      offeringId: offering && selectedInstrumentId ? offering.offeringId : null,
      intent: intent ?? null,
      recordId: recordId ?? null,
    });
    hydrateDocuments(id, selectedInstrumentId, intent ?? null, recordId ?? null);
  }, [setDesk, applyEntry, hydrateDocuments]);

  /* Entry resolution is intentionally an effect: the URL and localStorage are
     external systems unavailable during SSR. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resolved = resolveHouseEntry(
      params.get('desk'),
      window.localStorage,
      params.get('offering'),
      parseEntryIntent(params.get('side'), params.get('amount')),
      parseRecordQuery(params.get('record')),
    );
    if (resolved.kind === 'foyer') {
      clearEntry();
      showPhase('foyer');
      markHistoryReady();
      return abortInFlight;
    }
    hydrateDesk(resolved.deskId, resolved.offeringId, resolved.intent, resolved.recordId);
    if (resolved.source === 'query' || !loadLastDesk(window.localStorage)) {
      saveLastDesk(window.localStorage, resolved.deskId);
    }
    syncDeskQuery(resolved.deskId, resolved.offeringId, 'replace', resolved.intent, resolved.recordId);
    showPhase('desk');
    return abortInFlight;
  }, [hydrateDesk, clearEntry, showPhase, markHistoryReady, abortInFlight]);

  /* Back/Forward follow the address bar: `?desk=` lands on that desk, its
     absence lands on the foyer — no last-desk preference on pop, the user
     already chose where to stand. */
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const desk = parseDeskQuery(params.get('desk'));
      abortInFlight();
      if (!desk) {
        clearEntry();
        showPhase('foyer');
        return;
      }
      hydrateDesk(
        desk,
        parseOfferingQuery(params.get('offering'), desk),
        parseEntryIntent(params.get('side'), params.get('amount')),
        parseRecordQuery(params.get('record')),
      );
      saveLastDesk(window.localStorage, desk);
      showPhase('desk');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [hydrateDesk, abortInFlight, clearEntry, showPhase]);

  const enterDesk = useCallback((id: HouseDeskId, offeringId?: string | null, intent?: EntryIntent | null, recordId?: string | null) => {
    if (!getHouseDesk(id)) return;
    const offering = offeringId ? offeringForId(offeringId) : null;
    const selectedOfferingId = offering && offeringCoversDesk(offering, id) ? offering.offeringId : null;
    const selectedRecord = parseRecordQuery(recordId);
    abortInFlight();
    resetSessions();
    hydrateDesk(id, selectedOfferingId, selectedRecord ? null : intent, selectedRecord);
    saveLastDesk(window.localStorage, id);
    syncDeskQuery(id, selectedOfferingId, 'push', selectedRecord ? null : intent ?? null, selectedRecord);
    showPhase('desk');
  }, [abortInFlight, resetSessions, hydrateDesk, showPhase]);

  const leaveDesk = useCallback(() => {
    abortInFlight();
    clearEntry();
    showPhase('foyer');
    clearDeskQuery('push');
  }, [abortInFlight, clearEntry, showPhase]);

  const switchDesk = useCallback((id: HouseDeskId) => {
    if (id === deskId || !getHouseDesk(id)) return;
    if (entryPhase === 'foyer') {
      enterDesk(id);
      return;
    }
    abortInFlight();
    if (usesLegacyDeskDocuments(deskId)) {
      try { writePersistedDraft(window.localStorage, state, deskId); } catch { /* draft resume is optional */ }
    }
    let entered: ParkedDesk = { deskId: id, state: initialDesk(usesLegacyDeskDocuments(id) ? readRestorableDraft(window.localStorage, id) ?? emptyDraft() : emptyDraft()), viewedRecordId: null, error: null };
    try {
      const result = switchDeskSession(
        { deskId, state, viewedRecordId, error },
        id,
        sessions.current,
        usesLegacyDeskDocuments(id) ? readRestorableDraft(window.localStorage, id) : null,
      );
      parkSessions(result.parked);
      entered = result.entered;
    } catch { /* An unreachable guard violation must not crash the desk switch; the destination starts fresh. */ }
    setDesk(entered.deskId);
    restoreDocuments(entered.deskId, entered);
    saveLastDesk(window.localStorage, entered.deskId);
    syncDeskQuery(entered.deskId, null, 'replace', null, null);
    clearEntry();
  }, [deskId, enterDesk, entryPhase, state, viewedRecordId, error, sessions, setDesk, restoreDocuments, clearEntry, abortInFlight, parkSessions]);

  const activeDesk = getHouseDesk(deskId) ?? getHouseDesk(OPEN_DESK_ID)!;
  const open = isOpenDesk(deskId);

  return useMemo(
    () => ({
      entryPhase, enterDesk, leaveDesk, entryOfferingId, entryIntent, entryRecordId, entryGen,
      deskId, activeDesk, open, switchDesk,
      /* The active engine's session, whole and narrowed to the contract. */
      documentSession, jesse,
      /* Shared document fields resolve through the session — on any desk,
         desk.foreground is the document actually under attention. */
      foreground: documentSession.foreground,
      viewedRecordId: sessionViewedRecordId,
      historyReady: sessionHistoryReady,
      storageError: documentSession.storageError,
      openRecord: sessionOpenRecord,
      dismissRecord: sessionDismissRecord,
      removeRecord: documentSession.removeRecord,
      /* Legacy-engine surface — Hetty's pipeline fields. */
      state, records, error,
      edit, requestQuote, save, cancel,
      loadHistory, watched, watch, unwatch,
      focusedRecordId,
    }),
    [entryPhase, enterDesk, leaveDesk, entryOfferingId, entryIntent, entryRecordId, entryGen,
     deskId, activeDesk, open, switchDesk,
     documentSession, jesse, sessionViewedRecordId, sessionHistoryReady, sessionOpenRecord, sessionDismissRecord,
     state, records, error,
     edit, requestQuote, save, cancel,
     loadHistory, watched, watch, unwatch,
     focusedRecordId],
  );
}
