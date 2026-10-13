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
import type { HalleyDraft, HalleyLaunchIntent } from '../lib/meteora/contracts';
import type { DeskForegroundDocument } from '../lib/desk/contracts';

const emptyState = (): HalleyDeskState => ({
  stage: 'draft',
  draft: { name: null, symbol: null, anchorSymbol: null, quoteSymbol: null, curve: null, supply: null, graduationQuote: null },
  pencil: {},
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

  it('in live mode the readback is a projection that defers to the wallet ceremony', () => {
    const estimate = estimateLaunch(intent, anchor, 1_900_000_000_000);
    const line = describeLaunchTerms(estimate, 'live');
    assert.doesNotMatch(line, /Paper only/);
    assert.match(line, /wallet ceremony/);
    const state = emptyState();
    state.stage = 'review';
    state.estimate = estimate;
    const opening = halleyOpeningLine(state, fg('quotation'), 'live');
    assert.match(opening, /Continue to wallet review on screen/);
    assert.match(opening, /filing paper never mints/);
    assert.doesNotMatch(opening, /paper-only/i);
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
      uiReveal: null,
      reveal: () => {},
      lineWrite: null,
      refuse: () => {},
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

  it('proposes the house defaults instead of asking the caller to invent numbers', async () => {
    const named = fakeDesk({ state: { ...emptyState(), draft: { ...emptyState().draft, name: 'Basilisk', symbol: 'BASILISK' } } });
    const usdc = await handlers(named).choose_quote({ quote: 'USDC' });
    assert.match(usdc, /house defaults: a million tokens, graduating at 150 USDC/);
    assert.match(usdc, /do not ask the caller to pick numbers/);
    assert.match(usdc, /draw the curve now/);
    const pair = await handlers(named).choose_quote({ quote: 'NVDAx' });
    assert.match(pair, /anchored to NVDA/);
    assert.match(pair, /graduating at 1 NVDAx/);
    const unnamed = await handlers(fakeDesk()).name_launch({ name: 'Basilisk', symbol: 'BASILISK' });
    assert.match(unnamed, /suggest USDC as the plain choice/);
  });

  it('tags every write the line makes, so the card can answer the voice', async () => {
    const calls: { partial: Record<string, unknown>; by: unknown }[] = [];
    const desk = fakeDesk({ edit: (partial, by) => { calls.push({ partial, by }); } });
    const table = handlers(desk);
    await table.name_launch({ name: 'Basilisk', symbol: 'BASILISK' });
    await table.choose_quote({ quote: 'USDC' });
    await table.choose_anchor({ anchor: 'NVIDIA' });
    await table.choose_anchor({ anchor: 'none' });
    await table.choose_curve({ curve: 'flat' });
    await table.set_supply({ supply: '2000000' });
    await table.set_graduation({ amount: '300' });
    assert.equal(calls.length, 7);
    for (const call of calls) assert.equal(call.by, 'line', JSON.stringify(call.partial));
  });

  it('refuses unknown quotes, anchors, and curves rather than guessing', async () => {
    const refused: [keyof HalleyDraft | null, string][] = [];
    const desk = fakeDesk({ refuse: (field, note) => { refused.push([field, note]); } });
    assert.match(await handlers(desk).choose_quote({ quote: 'DOGE' }), /not a launch quote/);
    assert.match(await handlers(desk).choose_anchor({ anchor: 'GameStop' }), /not an anchor/);
    assert.match(await handlers(desk).choose_curve({ curve: 'zigzag' }), /not a curve/);
    /* Each refusal names the field the card should answer in its softer voice. */
    assert.deepEqual(refused.map(([field]) => field), ['quoteSymbol', 'anchorSymbol', 'curve']);
    assert.ok(refused.every(([, note]) => /isn’t/.test(note)), JSON.stringify(refused));
  });

  it('answers explain_concept with reviewed copy or the honest menu', async () => {
    const desk = fakeDesk();
    assert.match(await handlers(desk).explain_concept({ topic: 'the anchor' }), /Pyth mark/);
    assert.match(await handlers(desk).explain_concept({ topic: 'the weather' }), /do not have a reviewed explanation/);
  });

  it('in live mode the estimate success routes the caller to wallet review, never to filing paper', async () => {
    const estimate = estimateLaunch(intent, anchor, 1_900_000_000_000);
    const desk = fakeDesk({
      state: { ...emptyState(), draft: { ...intent } },
      estimate() {
        this.state = { ...this.state, stage: 'review', estimate };
        this.foreground = fg('quotation');
      },
    });
    const live = halleyToolHandlers({ desk: () => desk, mode: () => 'live' });
    const answer = await live.request_launch_estimate({});
    assert.match(answer, /continue to wallet review on screen/);
    assert.match(answer, /paper filing never creates the mint/);
    assert.doesNotMatch(answer, /wants to file this paper launch/);
  });

  it('in paper mode the estimate success still offers a paper filing', async () => {
    const estimate = estimateLaunch(intent, anchor, 1_900_000_000_000);
    const desk = fakeDesk({
      state: { ...emptyState(), draft: { ...intent } },
      estimate() {
        this.state = { ...this.state, stage: 'review', estimate };
        this.foreground = fg('quotation');
      },
    });
    const answer = await handlers(desk).request_launch_estimate({});
    assert.match(answer, /file this paper launch/);
  });

  it('file_paper_launch stays explicit paper-only even under the live path', async () => {
    const estimate = estimateLaunch(intent, anchor, 1_900_000_000_000);
    const state = { ...emptyState(), stage: 'review' as const, estimate };
    const desk = fakeDesk({
      state,
      foreground: fg('quotation'),
      file: () => true,
    });
    const live = halleyToolHandlers({ desk: () => desk, mode: () => 'live' });
    const answer = await live.file_paper_launch({});
    assert.match(answer, /No mint was created/);
    assert.match(answer, /not the path to a live mint/);
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
