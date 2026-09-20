/**
 * Jesse seated-desk session — React mirror of createJesseController.
 *
 * Every mutation goes through applyJesseCommand. Field edits use `clarify`
 * (partial drafts); complete intents with quote use `draft`. Commands are
 * serialized so expected revision always matches.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CommandResult,
  DeskPresentation,
  JesseCommand,
  JesseDraft,
  JesseIntent,
  SolanaInstrumentId,
} from './contracts';
import { isJesseIntent } from './contracts';
import {
  createJesseController,
  type JesseController,
  type JesseControllerPorts,
  type JesseDeskState,
} from './controller';
import { jesseForeground, type JesseForeground } from './desk-documents';
import { createJesseComparePort, createJesseQuotePort } from './desk-ports';
import {
  deleteJessePaperRecord,
  loadJessePaperRecords,
  type JessePaperRecord,
} from './paper';
import type { PaperStorage } from '../trading/paper-records';

export type JesseInFlight = 'quote' | 'compare' | null;
export type { JesseForeground };

type ClarifyField = Extract<JesseCommand, { type: 'clarify' }>['field'];

export interface JesseDesk {
  state: JesseDeskState;
  inFlight: JesseInFlight;
  lastResult: CommandResult | null;
  records: JessePaperRecord[];
  historyReady: boolean;
  storageError: string | null;
  viewedRecordId: string | null;
  foreground: JesseForeground;
  edit: (partial: Partial<JesseDraft>, field: ClarifyField) => Promise<CommandResult>;
  quote: () => Promise<void>;
  compare: () => Promise<void>;
  file: () => Promise<CommandResult>;
  cancel: () => Promise<CommandResult>;
  watch: (id: SolanaInstrumentId) => Promise<CommandResult>;
  openRecord: (id: string) => void;
  dismissRecord: () => void;
  removeRecord: (id: string) => void;
  setPresentationMode: (mode: DeskPresentation) => { ok: boolean; spokenText: string };
  run: (command: JesseCommand) => Promise<CommandResult>;
}

function emptyDraft(): JesseDraft {
  return { instrumentId: null, side: null, unit: null, amount: null };
}

function mergeDraft(current: JesseDraft, partial: Partial<JesseDraft>, field: ClarifyField): JesseDraft {
  const next: JesseDraft = { ...current, ...partial };
  if (field === 'side' || field === 'units') {
    if (next.side === 'buy') next.unit = 'USDC';
    else if (next.side === 'sell') next.unit = 'scaled-token';
    else if (next.side === null) next.unit = null;
  }
  if (field === 'units' && partial.unit) {
    if (partial.unit === 'USDC') next.side = 'buy';
    if (partial.unit === 'scaled-token') next.side = 'sell';
  }
  return next;
}

function intentFromDraft(draft: JesseDraft): JesseIntent | null {
  const candidate = {
    instrumentId: draft.instrumentId,
    side: draft.side,
    unit: draft.unit,
    amount: draft.amount,
  };
  return isJesseIntent(candidate) ? candidate : null;
}

type Storage = PaperStorage & { removeItem(key: string): void };

const SSR_STATE: JesseDeskState = {
  revision: 0,
  sessionGeneration: 1,
  draft: emptyDraft(),
  stage: 'draft',
  quote: null,
  presentedInstrument: null,
  comparison: null,
  presentation: { mode: 'compact', focus: 'desk', objectId: null },
  watches: [],
};

/** Testable session — the React hook is a thin subscription over this. */
export function createJesseDeskSession(opts: {
  storage: Storage;
  ports: JesseControllerPorts;
  now?: () => number;
}) {
  const controller = createJesseController({
    storage: opts.storage,
    ports: opts.ports,
    now: opts.now,
  });
  controller.restore();

  let inFlight: JesseInFlight = null;
  let lastResult: CommandResult | null = null;
  let viewedRecordId: string | null = null;
  let records: JessePaperRecord[] = [];
  let historyReady = false;
  let storageError: string | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const reloadRecords = () => {
    try {
      records = loadJessePaperRecords(opts.storage);
      historyReady = true;
      storageError = null;
    } catch {
      historyReady = false;
      storageError = 'Your paper history could not be read. Nothing has been changed. Check browser storage before saving.';
    }
    notify();
  };
  reloadRecords();

  const getSnapshot = () => ({
    state: controller.getState(),
    inFlight,
    lastResult,
    records,
    historyReady,
    storageError,
    viewedRecordId,
  });

  const expected = () => {
    const s = controller.getState();
    return { deskId: 'jesse' as const, revision: s.revision, sessionGeneration: s.sessionGeneration };
  };

  const run = (command: JesseCommand): Promise<CommandResult> => {
    /* Cancel must interrupt an in-flight quote: the controller drops late
       responses when revision moves. Serializing cancel behind the quote
       await would deadlock the UI. */
    if (command.type === 'cancel') {
      return (async () => {
        if (disposed) {
          return {
            status: 'rejected' as const,
            revision: controller.getState().revision,
            quoteId: null,
            evidenceId: null,
            spokenText: 'The desk session has ended.',
          };
        }
        const result = await controller.applyJesseCommand(command, expected());
        lastResult = result;
        inFlight = null;
        notify();
        return result;
      })();
    }

    const task = queue.then(async () => {
      if (disposed) {
        return {
          status: 'rejected' as const,
          revision: controller.getState().revision,
          quoteId: null,
          evidenceId: null,
          spokenText: 'The desk session has ended.',
        };
      }
      if (command.type === 'draft' && command.quote) inFlight = 'quote';
      else if (command.type === 'compare') inFlight = 'compare';
      else inFlight = null;
      notify();
      try {
        const result = await controller.applyJesseCommand(command, expected());
        lastResult = result;
        if (command.type === 'file-paper' && result.status === 'applied' && result.quoteId) {
          viewedRecordId = result.quoteId;
          reloadRecords();
        } else {
          notify();
        }
        return result;
      } finally {
        inFlight = null;
        notify();
      }
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  };

  const edit = (partial: Partial<JesseDraft>, field: ClarifyField) => {
    const draft = mergeDraft(controller.getState().draft, partial, field);
    return run({ type: 'clarify', draft, field, question: '' });
  };

  const quote = async () => {
    const intent = intentFromDraft(controller.getState().draft);
    if (!intent) {
      return run({
        type: 'clarify',
        draft: controller.getState().draft,
        field: 'amount',
        question: 'Choose an xStock and enter an amount. Buy with USDC; sell scaled units.',
      });
    }
    return run({ type: 'draft', intent, quote: true });
  };

  const compare = async () => {
    const id = controller.getState().draft.instrumentId;
    if (!id) {
      return run({
        type: 'clarify',
        draft: controller.getState().draft,
        field: 'instrument',
        question: 'Which xStock should I compare?',
      });
    }
    return run({ type: 'compare', instrumentId: id });
  };

  const file = async () => {
    const quoteId = controller.getState().quote?.id;
    if (!quoteId) {
      return {
        status: 'rejected' as const,
        revision: controller.getState().revision,
        quoteId: null,
        evidenceId: null,
        spokenText: 'There is no estimate under review to file.',
      };
    }
    return run({ type: 'file-paper', quoteId });
  };

  const cancel = () => run({ type: 'cancel' });
  const watch = (id: SolanaInstrumentId) => run({ type: 'watch', instrumentId: id });

  const openRecord = (id: string) => {
    viewedRecordId = id;
    notify();
  };
  const dismissRecord = () => {
    viewedRecordId = null;
    notify();
  };
  const removeRecord = (id: string) => {
    try {
      deleteJessePaperRecord(opts.storage, id);
      if (viewedRecordId === id) viewedRecordId = null;
      reloadRecords();
    } catch {
      storageError = 'This paper record could not be deleted. Check browser storage and try again.';
      notify();
    }
  };

  const setPresentationMode = (mode: DeskPresentation) => {
    const outcome = controller.setPresentationMode(mode);
    notify();
    return outcome;
  };

  const dispose = () => {
    disposed = true;
    controller.endSession();
    listeners.clear();
  };

  return {
    controller: controller as JesseController,
    getSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    run,
    edit,
    quote,
    compare,
    file,
    cancel,
    watch,
    openRecord,
    dismissRecord,
    removeRecord,
    setPresentationMode,
    reloadRecords,
    dispose,
  };
}

export type JesseDeskSession = ReturnType<typeof createJesseDeskSession>;

export function useJesseDesk(ports?: Partial<JesseControllerPorts>): JesseDesk {
  const portsRef = useRef<JesseControllerPorts>({
    quote: ports?.quote ?? createJesseQuotePort(),
    compare: ports?.compare ?? createJesseComparePort(),
    formatSpoken: ports?.formatSpoken,
  });

  const [session, setSession] = useState<JesseDeskSession | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const next = createJesseDeskSession({
      storage: window.localStorage,
      ports: portsRef.current,
    });
    setSession(next);
    const unsub = next.subscribe(() => setTick(t => t + 1));
    const onPageHide = () => next.dispose();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      unsub();
      window.removeEventListener('pagehide', onPageHide);
      next.dispose();
      setSession(null);
    };
  }, []);

  const snapshot = session?.getSnapshot() ?? {
    state: SSR_STATE,
    inFlight: null as JesseInFlight,
    lastResult: null,
    records: [] as JessePaperRecord[],
    historyReady: false,
    storageError: null,
    viewedRecordId: null,
  };

  const foreground = useMemo(
    () => jesseForeground(snapshot.state, snapshot.viewedRecordId, snapshot.historyReady ? snapshot.records : undefined),
    [snapshot.state, snapshot.viewedRecordId, snapshot.historyReady, snapshot.records],
  );

  const run = useCallback(async (command: JesseCommand) => {
    if (!session) {
      return { status: 'rejected' as const, revision: 0, quoteId: null, evidenceId: null, spokenText: 'Desk not ready.' };
    }
    return session.run(command);
  }, [session]);

  const edit = useCallback((partial: Partial<JesseDraft>, field: ClarifyField) => {
    if (!session) {
      return Promise.resolve({
        status: 'rejected' as const,
        revision: 0,
        quoteId: null,
        evidenceId: null,
        spokenText: 'Desk not ready.',
      });
    }
    return session.edit(partial, field);
  }, [session]);

  const quote = useCallback(async () => {
    if (!session) return;
    await session.quote();
  }, [session]);
  const compare = useCallback(async () => {
    if (!session) return;
    await session.compare();
  }, [session]);
  const file = useCallback(async () => {
    if (!session) {
      return { status: 'rejected' as const, revision: 0, quoteId: null, evidenceId: null, spokenText: 'Desk not ready.' };
    }
    return session.file();
  }, [session]);
  const cancel = useCallback(async () => {
    if (!session) {
      return { status: 'rejected' as const, revision: 0, quoteId: null, evidenceId: null, spokenText: 'Desk not ready.' };
    }
    return session.cancel();
  }, [session]);
  const watch = useCallback(async (id: SolanaInstrumentId) => {
    if (!session) {
      return { status: 'rejected' as const, revision: 0, quoteId: null, evidenceId: null, spokenText: 'Desk not ready.' };
    }
    return session.watch(id);
  }, [session]);
  const openRecord = useCallback((id: string) => { session?.openRecord(id); }, [session]);
  const dismissRecord = useCallback(() => { session?.dismissRecord(); }, [session]);
  const removeRecord = useCallback((id: string) => { session?.removeRecord(id); }, [session]);
  const setPresentationMode = useCallback((mode: DeskPresentation) => {
    if (!session) return { ok: false, spokenText: 'Desk not ready.' };
    return session.setPresentationMode(mode);
  }, [session]);

  return {
    state: snapshot.state,
    inFlight: snapshot.inFlight,
    lastResult: snapshot.lastResult,
    records: snapshot.records,
    historyReady: snapshot.historyReady,
    storageError: snapshot.storageError,
    viewedRecordId: snapshot.viewedRecordId,
    foreground,
    edit,
    quote,
    compare,
    file,
    cancel,
    watch,
    openRecord,
    dismissRecord,
    removeRecord,
    setPresentationMode,
    run,
  };
}
