import { NIGHT_DESK_FIXTURES, type NightDeskAmount, type NightDeskStage, type NightDeskView } from './night-desk-fixtures';

export type NightDeskAction =
  | { type: 'begin' }
  | { type: 'compare' }
  | { type: 'quote'; amount: NightDeskAmount }
  | { type: 'keep' }
  | { type: 'cancel' }
  | { type: 'view'; view: NightDeskView }
  | { type: 'restore'; amount: NightDeskAmount }
  | { type: 'reset' }
  | { type: 'unknown' };

export interface NightDeskState {
  stage: NightDeskStage;
  view: NightDeskView;
  amount: NightDeskAmount | null;
  keptAmount: NightDeskAmount | null;
  line: string;
}

export const NIGHT_DESK_STORAGE_KEY = 'claflin.night-desk.study.v1';

const DIRECT_FIFTY_LINE = 'Fifty USDC. The example slip shows 0.245 Apple xStock units. Nothing has been placed. Take a look.';
export const KEEP_FAILED_LINE = 'This example could not be kept in this tab. Your slip is still here.';
export const LEDGER_READONLY_LINE = 'That ledger entry is read-only. Return to your instruction to keep a new slip.';
export const CLEAR_FAILED_LINE = 'This study reset, but the saved record could not be cleared in this tab.';

export const initialNightDeskState: NightDeskState = {
  stage: 'arrival',
  view: 'desk',
  amount: null,
  keptAmount: null,
  line: NIGHT_DESK_FIXTURES.lines.arrival,
};

export function canKeepNightDesk(state: NightDeskState): boolean {
  return state.amount !== null && state.view === 'review' && state.stage !== 'filed';
}

function kept(state: NightDeskState, amount: NightDeskAmount): NightDeskState {
  return { ...state, stage: 'filed', view: 'ledger', amount, keptAmount: amount, line: NIGHT_DESK_FIXTURES.lines.filed };
}

export function nightDeskReducer(state: NightDeskState, action: NightDeskAction): NightDeskState {
  switch (action.type) {
    case 'begin':
      return { ...state, stage: 'conversation', view: 'desk', line: NIGHT_DESK_FIXTURES.lines.conversation };
    case 'compare':
      return { ...state, stage: 'evidence', view: 'evidence', line: NIGHT_DESK_FIXTURES.lines.evidence };
    case 'quote': {
      if (action.amount === '100') {
        return { ...state, stage: 'quote', view: 'review', amount: '100', line: NIGHT_DESK_FIXTURES.lines.quote };
      }
      const correcting = state.amount === '100' && (state.stage === 'quote' || state.stage === 'revised');
      return {
        ...state,
        stage: correcting ? 'revised' : 'quote',
        view: 'review',
        amount: '50',
        line: correcting ? NIGHT_DESK_FIXTURES.lines.revised : DIRECT_FIFTY_LINE,
      };
    }
    case 'keep':
      if (state.stage === 'filed' && state.keptAmount !== null) return state;
      if (canKeepNightDesk(state)) return kept(state, state.amount as NightDeskAmount);
      if (state.amount !== null && state.view === 'ledger' && state.keptAmount !== null) {
        return { ...state, line: LEDGER_READONLY_LINE };
      }
      return { ...state, line: NIGHT_DESK_FIXTURES.lines.noQuote };
    case 'cancel':
      return { ...state, stage: 'conversation', view: 'desk', amount: null, line: NIGHT_DESK_FIXTURES.lines.cancelled };
    case 'view':
      return { ...state, view: action.view };
    case 'restore':
      return kept(state, action.amount);
    case 'reset':
      return { ...initialNightDeskState };
    case 'unknown':
      return { ...state, line: NIGHT_DESK_FIXTURES.lines.unsupported };
  }
}

export function parseNightDeskCommand(text: string): NightDeskAction {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  if (/^(?:show me|compare|look at) (?:apple|aapl|aaplx)$/.test(t)) return { type: 'compare' };
  if (/^(?:leave it(?: for now)?|cancel|never mind)$/.test(t)) return { type: 'cancel' };
  if (/^(?:keep|file) (?:this )?(?:example )?(?:slip|record)$/.test(t)) return { type: 'keep' };
  const quote = /^(?:quote|buy) (100|one hundred|a hundred|50|fifty) usdc (?:of )?(?:apple|aapl|aaplx)$/.exec(t);
  const correction = /^(?:actually,? )?(?:make that|make it|change to) (100|one hundred|a hundred|50|fifty) usdc$/.exec(t);
  const match = quote ?? correction;
  if (match) return { type: 'quote', amount: match[1] === '50' || match[1] === 'fifty' ? '50' : '100' };
  return { type: 'unknown' };
}
