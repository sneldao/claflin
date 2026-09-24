import type { PaperRecord } from './paper-records';

export const LIVE_OUTCOME_STATUSES = ['submitted', 'pending', 'filled', 'failed', 'unknown'] as const;
export type LiveOutcomeStatus = (typeof LIVE_OUTCOME_STATUSES)[number];

export type PaperEvidence = {
  kind: 'paper-record';
  status: 'filed';
  mode: 'paper';
  isSubmission: false;
  isFill: false;
  isPosition: false;
  label: 'Filed paper record';
};

export type LiveEvidence = {
  kind: 'live-execution';
  status: LiveOutcomeStatus;
  mode: 'live';
  isSubmission: boolean;
  isFill: boolean;
  isPosition: false;
  label: string;
};

const LIVE_LABELS: Record<LiveOutcomeStatus, string> = {
  submitted: 'Submitted — not yet a fill',
  pending: 'Pending at the venue',
  filled: 'Filled — reconcile the position',
  failed: 'Failed — not filled',
  unknown: 'Unknown — do not assume a fill',
};

/** A paper file is never a live submission, fill, or position. */
export function paperEvidence(_record?: Pick<PaperRecord, 'mode'>): PaperEvidence {
  return {
    kind: 'paper-record',
    status: 'filed',
    mode: 'paper',
    isSubmission: false,
    isFill: false,
    isPosition: false,
    label: 'Filed paper record',
  };
}

export function liveEvidence(status: LiveOutcomeStatus): LiveEvidence {
  return {
    kind: 'live-execution',
    status,
    mode: 'live',
    isSubmission: status === 'submitted' || status === 'pending' || status === 'filled',
    isFill: status === 'filled',
    isPosition: false,
    label: LIVE_LABELS[status],
  };
}

export function isPaperSuccess(evidence: PaperEvidence | LiveEvidence): boolean {
  return evidence.kind === 'paper-record' && evidence.status === 'filed';
}

export type OutcomePlace = 'hetty-browser' | 'hetty-account' | 'jesse-browser';

const PLACE_LINES: Record<OutcomePlace, string> = {
  'hetty-browser': 'Kept in this browser.',
  'hetty-account': 'Kept in this browser, and copied to your sign-in.',
  'jesse-browser': 'Kept in this browser. Jesse’s book does not leave it.',
};

/** The filed sentence is the heading. Place says where that sentence lives. */
export function paperOutcomeCopy(input?: { sentence?: string | null; place?: OutcomePlace }) {
  const sentence = input?.sentence?.replace(/\s+/g, ' ').trim();
  return {
    heading: sentence ? sentence : 'Paper recorded.',
    acknowledgement: 'Filed. Paper only. Nothing moved.',
    place: PLACE_LINES[input?.place ?? 'hetty-browser'],
    boundary: 'This is not a fill, a submission, or a position.',
    stamp: 'PAPER · FILED',
  } as const;
}

/** Move focus to the ledger title so a fresh filing can be read back. */
export function focusLedgerTitle(): void {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('ledger-title');
  if (!(title instanceof HTMLElement)) return;
  title.tabIndex = -1;
  title.focus();
}
