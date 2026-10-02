import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appliedIsabelTicketLine,
  chooseRobinhoodInstrumentResult,
  describeIsabelDesk,
  isabelClosingLine,
  isabelForegroundGuard,
  isabelOpeningLine,
  nextIsabelInstructionDraft,
  resolveIsabelExplainTopic,
  resolveRobinhoodAlias,
  setIsabelAmountResult,
  setIsabelInstructionResult,
  spokenAmount,
} from '../lib/robinhood/voice-tools';
import type { IsabelDeskState } from '../lib/robinhood/useIsabelDesk';
import type { DeskForegroundDocument } from '../lib/desk/contracts';

const emptyState = (): IsabelDeskState => ({
  stage: 'draft',
  draft: { instrumentId: null, side: null, amount: null },
  quote: null,
  evidence: null,
  notice: null,
});

const fg = (kind: DeskForegroundDocument['kind']): DeskForegroundDocument => ({
  kind,
  quoteId: kind === 'draft' ? null : 'q1',
  recordId: kind === 'draft' ? null : 'r1',
  instrumentId: null,
  actionable: kind === 'draft' || kind === 'quotation',
  readonly: kind === 'archive' || kind === 'missing' || kind === 'receipt',
});

describe('isabel voice tools', () => {
  it('resolves spoken companies and tickers to catalogued tokens', () => {
    assert.equal(resolveRobinhoodAlias('Apple')?.symbol, 'AAPL');
    assert.equal(resolveRobinhoodAlias('nvda')?.symbol, 'NVDA');
    assert.equal(resolveRobinhoodAlias('Tesla')?.symbol, 'TSLA');
    assert.equal(resolveRobinhoodAlias('google')?.symbol, 'GOOGL');
    assert.equal(resolveRobinhoodAlias('SpaceX')?.symbol, 'SPCX');
    assert.equal(resolveRobinhoodAlias('s&p 500')?.symbol, 'SPY');
    /* Hetty and Jesse's products do not resolve on Isabel's desk. */
    assert.equal(resolveRobinhoodAlias('AAPLc'), null);
    assert.equal(resolveRobinhoodAlias('TSLAx'), null);
    assert.match(chooseRobinhoodInstrumentResult('GameStop'), /not on this desk/);
  });

  it('guards archive and missing foregrounds', () => {
    assert.match(isabelForegroundGuard(fg('missing')) ?? '', /no longer here/);
    assert.match(isabelForegroundGuard(fg('archive')) ?? '', /for reading/);
    assert.equal(isabelForegroundGuard(fg('draft')), null);
    assert.equal(isabelForegroundGuard(fg('quotation')), null);
  });

  it('clears the amount when the side flips — USDG is never token units', () => {
    const draft = { instrumentId: null, side: 'buy' as const, amount: '100' };
    const flipped = nextIsabelInstructionDraft(draft, 'sell');
    assert.equal(flipped.amountCleared, true);
    assert.equal(flipped.draft.amount, null);
    const same = nextIsabelInstructionDraft(draft, 'buy');
    assert.equal(same.amountCleared, false);
    assert.equal(same.draft.amount, '100');
    assert.match(setIsabelInstructionResult('sell', true), /old USDG spend was cleared/);
    assert.match(setIsabelAmountResult('buy', '50'), /50 USDG is on the ticket/);
    assert.match(setIsabelAmountResult('sell', '2'), /2 token units is on the ticket/);
  });

  it('opens on the ticket it finds, never on a blank line', () => {
    const state = emptyState();
    assert.match(isabelOpeningLine(state, fg('draft')), /Robinhood Chain desk — paper only/);
    state.draft = { instrumentId: 'rh:0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', side: 'buy', amount: '100' };
    assert.match(isabelOpeningLine(state, fg('draft')), /Apple buy for 100 USDG/);
    assert.match(isabelOpeningLine(state, fg('quotation')), /Lighter book, paper only/);
    assert.match(isabelOpeningLine(state, fg('archive')), /filed paper record/);
  });

  it('closes honestly: filed is filed, a draft survives the drop', () => {
    const state = emptyState();
    assert.equal(isabelClosingLine(state, fg('draft'), 'ended'), 'Nothing was filed.');
    state.draft = { instrumentId: 'rh:0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', side: 'buy', amount: '100' };
    assert.match(isabelClosingLine(state, fg('draft'), 'dropped'), /draft is still on the ticket/);
    assert.match(isabelClosingLine(state, fg('receipt'), 'ended'), /paper ledger.*No funds moved/i);
  });

  it('describes the desk without inventing numbers', () => {
    const state = emptyState();
    assert.match(describeIsabelDesk(state, fg('draft'), []), /No instrument chosen/);
    state.draft = { instrumentId: 'rh:0x322f0929c4625ed5bad873c95208d54e1c003b2d', side: 'sell', amount: '2' };
    assert.match(describeIsabelDesk(state, fg('draft'), []), /Instrument: TSLA\..*sell 2 token units/s);
    assert.match(appliedIsabelTicketLine(state, fg('draft')) ?? '', /sell 2 token units of TSLA/);
  });

  it('maps explain topics to the reviewed catalog only', () => {
    assert.equal(resolveIsabelExplainTopic('what is the three-way tape'), 'reference-difference');
    assert.equal(resolveIsabelExplainTopic('is the market open on weekends'), 'market-hours');
    assert.equal(resolveIsabelExplainTopic('is this a real trade'), 'paper-mode');
    assert.equal(resolveIsabelExplainTopic('who issues these tokens'), 'stock-token');
    assert.equal(resolveIsabelExplainTopic('who are you'), 'namesake');
    assert.equal(resolveIsabelExplainTopic('what is slippage'), null);
  });

  it('speaks amounts in read-aloud form', () => {
    assert.equal(spokenAmount('100'), '100');
    assert.equal(spokenAmount('0.029482'), '0.02948');
    assert.equal(spokenAmount('123.456'), '123.5');
  });
});
