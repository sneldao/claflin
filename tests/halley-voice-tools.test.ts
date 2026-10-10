import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appliedHalleyTicketLine,
  describeHalleyDesk,
  describeLaunchTerms,
  explainHalleyTopic,
  halleyClosingLine,
  halleyForegroundGuard,
  halleyOpeningLine,
  resolveHalleyAnchor,
  resolveHalleyCurve,
  resolveHalleyExplainTopic,
  resolveHalleyQuote,
  spokenAmount,
} from '../lib/meteora/voice-tools';
import { estimateLaunch } from '../lib/meteora/dbc';
import { halleyToolHandlers, type HalleyToolName } from '../lib/meteora/desk-tools';
import type { HalleyDesk, HalleyDeskState } from '../lib/meteora/useHalleyDesk';
import type { HalleyLaunchIntent } from '../lib/meteora/contracts';
import type { DeskForegroundDocument } from '../lib/desk/contracts';

const emptyState = (): HalleyDeskState => ({
  stage: 'draft',
  draft: { name: null, symbol: null, anchorSymbol: null, quoteSymbol: null, curve: null, supply: null, graduationQuote: null },
  estimate: null,
  notice: null,
  noticeCode: null,
});

const fg = (kind: DeskForegroundDocument['kind']): DeskForegroundDocument => ({
  kind,
  quoteId: kind === 'draft' ? null : 'q1',
  recordId: kind === 'draft' ? null : 'r1',
  instrumentId: null,
  actionable: kind === 'draft' || kind === 'quotation',
  readonly: kind === 'archive' || kind === 'missing' || kind === 'receipt',
});

const intent: HalleyLaunchIntent = {
  name: 'NVDA Tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC',
  curve: 'equity-pair', supply: '1000000', graduationQuote: '150',
};

const anchor = {
  symbol: 'NVDA', source: 'pyth-pro' as const, equityUsd: '182.50',
  pairRatio: null, quoteEquityUsd: null, observedAt: 1_900_000_000_000, status: 'observed' as const,
};

describe('halley voice tools', () => {
  it('resolves spoken anchors and quote assets to the verified set', () => {
    assert.equal(resolveHalleyAnchor('Nvidia'), 'NVDA');
    assert.equal(resolveHalleyAnchor('apple'), 'AAPL');
    assert.equal(resolveHalleyAnchor('Tesla'), 'TSLA');
    assert.equal(resolveHalleyAnchor('GameStop'), null);
    assert.equal(resolveHalleyQuote('USDC'), 'USDC');
    assert.equal(resolveHalleyQuote('dollars'), 'USDC');
    assert.equal(resolveHalleyQuote('AAPLx'), 'AAPLx');
    assert.equal(resolveHalleyQuote('the Apple stock token'), 'AAPLx');
    assert.equal(resolveHalleyQuote('DOGE'), null);
  });

  it('resolves curve names and their spoken forms', () => {
    assert.equal(resolveHalleyCurve('equity-pair'), 'equity-pair');
    assert.equal(resolveHalleyCurve('anchored'), 'equity-pair');
    assert.equal(resolveHalleyCurve('flat'), 'flat');
    assert.equal(resolveHalleyCurve('linear'), 'flat');
    assert.equal(resolveHalleyCurve('long'), 'long');
    assert.equal(resolveHalleyCurve('exponential'), 'exponential');
    assert.equal(resolveHalleyCurve('zigzag'), null);
  });

  it('guards archive and missing foregrounds', () => {
    assert.match(halleyForegroundGuard(fg('missing')) ?? '', /no longer here/);
    assert.match(halleyForegroundGuard(fg('archive')) ?? '', /for reading/);
    assert.equal(halleyForegroundGuard(fg('draft')), null);
    assert.equal(halleyForegroundGuard(fg('quotation')), null);
  });

  it('speaks the estimate as a projection — anchored, never an order', () => {
    const estimate = estimateLaunch(intent, anchor, 1_900_000_000_000);
    const line = describeLaunchTerms(estimate);
    assert.match(line, /NVDAT/);
    assert.match(line, /anchored to NVDA/);
    assert.match(line, /USDC/);
    assert.match(line, /Paper only/);
  });

  it('says plainly that a tracker token is not stock ownership', () => {
    assert.match(explainHalleyTopic('tracker-token'), /not.*claim.*stock ownership/i);
    assert.match(explainHalleyTopic('paper-mode'), /never an order|Nothing mints/i);
    assert.match(explainHalleyTopic('anchor'), /Pyth/);
    assert.match(explainHalleyTopic('graduation'), /DAMM v2/);
    assert.match(explainHalleyTopic('namesake'), /Edmond Halley \(1656–1742\)/);
  });

  it('maps spoken questions to reviewed topics', () => {
    assert.equal(resolveHalleyExplainTopic('what is the anchor'), 'anchor');
    assert.equal(resolveHalleyExplainTopic('when does it graduate'), 'graduation');
    assert.equal(resolveHalleyExplainTopic('am I buying real stock'), 'tracker-token');
    assert.equal(resolveHalleyExplainTopic('what curve shapes are there'), 'curve-shape');
    assert.equal(resolveHalleyExplainTopic('is this a real trade'), 'paper-mode');
    assert.equal(resolveHalleyExplainTopic('who are you named for'), 'namesake');
    assert.equal(resolveHalleyExplainTopic('the weather'), null);
  });

  it('opens with what is actually on the desk', () => {
    assert.match(halleyOpeningLine(emptyState(), fg('draft')), /What shall we launch/);
    assert.match(halleyOpeningLine(emptyState(), fg('archive')), /filed paper launch/);
    assert.match(halleyOpeningLine(emptyState(), fg('missing')), /no longer here/);
    const drafting = emptyState();
    drafting.draft.symbol = 'NVDAT';
    assert.match(halleyOpeningLine(drafting, fg('draft')), /NVDAT is on the slip/);
  });

  it('closes honestly — filed is in the ledger, nothing minted', () => {
    assert.match(halleyClosingLine(emptyState(), fg('draft'), 'ended'), /Nothing was filed/);
    const saved = emptyState();
    saved.stage = 'saved';
    assert.match(halleyClosingLine(saved, fg('receipt'), 'dropped'), /nothing was minted/i);
  });
});

describe('halley desk tools', () => {
  function fakeDesk(overrides: Partial<HalleyDesk> = {}): HalleyDesk {
    return {
      state: emptyState(),
      inFlight: false,
      records: [],
      historyReady: true,
      storageError: null,
      viewedRecordId: null,
      foreground: fg('draft'),
      edit: () => {},
      revise: () => {},
      estimate: () => {},
      estimateUnanchored: () => {},
      file: () => false,
      cancel: () => {},
      openRecord: () => {},
      dismissRecord: () => {},
      removeRecord: () => {},
      ...overrides,
    };
  }

  const handlers = (desk: HalleyDesk) => halleyToolHandlers({ desk: () => desk });
  const names: HalleyToolName[] = [
    'name_launch', 'choose_quote', 'choose_anchor', 'choose_curve', 'set_supply',
    'set_graduation', 'request_launch_estimate', 'file_paper_launch', 'open_record',
    'back_to_instruction', 'delete_record', 'cancel_instruction', 'describe_desk', 'explain_concept',
  ];

  it('covers the full tool table — and nothing in it can sign or submit', async () => {
    const desk = fakeDesk();
    const table = handlers(desk);
    for (const name of names) assert.equal(typeof table[name], 'function', name);
    /* No tool touches an execution path — the desk does not have one. */
    assert.equal(Object.keys(table).sort().join(','), [...names].sort().join(','));
  });

  it('refuses to estimate an incomplete draft', async () => {
    const desk = fakeDesk();
    const answer = await handlers(desk).request_launch_estimate({});
    assert.match(answer, /Name the launch first/);
  });

  it('refuses to file without a review-stage estimate', async () => {
    const desk = fakeDesk();
    const answer = await handlers(desk).file_paper_launch({});
    assert.match(answer, /no estimate under review/i);
  });

  it('refuses unknown quotes, anchors, and curves rather than guessing', async () => {
    const desk = fakeDesk();
    assert.match(await handlers(desk).choose_quote({ quote: 'DOGE' }), /not a launch quote/);
    assert.match(await handlers(desk).choose_anchor({ anchor: 'GameStop' }), /not an anchor/);
    assert.match(await handlers(desk).choose_curve({ curve: 'zigzag' }), /not a curve/);
  });

  it('answers explain_concept with reviewed copy or the honest menu', async () => {
    const desk = fakeDesk();
    assert.match(await handlers(desk).explain_concept({ topic: 'the anchor' }), /Pyth mark/);
    assert.match(await handlers(desk).explain_concept({ topic: 'the weather' }), /do not have a reviewed explanation/);
  });
});

describe('halley desk readback', () => {
  it('describes the slip and the ledger together', () => {
    const state = emptyState();
    state.draft.symbol = 'NVDAT';
    state.draft.quoteSymbol = 'AAPLx';
    const readback = describeHalleyDesk(state, fg('draft'), []);
    assert.match(readback, /NVDAT/);
    assert.match(readback, /AAPLx/);
  });

  it('names the ticket line only when something is on it', () => {
    assert.equal(appliedHalleyTicketLine(emptyState(), fg('draft')), null);
    const state = emptyState();
    state.draft.symbol = 'NVDAT';
    state.draft.anchorSymbol = 'NVDA';
    assert.match(appliedHalleyTicketLine(state, fg('draft')) ?? '', /NVDAT.*NVDA/);
  });

  it('speaks amounts short enough to say aloud', () => {
    assert.equal(spokenAmount('1000000'), '1000000');
    assert.equal(spokenAmount('182.50'), '182.5');
    assert.equal(spokenAmount('0.7000001'), '0.7');
  });
});
