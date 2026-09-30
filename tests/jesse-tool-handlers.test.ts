import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJesseDeskSession, type JesseDesk } from '../lib/solana/useJesseDesk.ts';
import { jesseForeground } from '../lib/solana/desk-documents.ts';
import { jesseToolHandlers } from '../lib/jesse/desk-tools.ts';
import { unavailableToolMessage } from '../lib/jesse/assemblyai-agent.ts';
import { spokenAmount } from '../lib/solana/controller.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import { COMPARISON_UNAVAILABLE_FIXTURE } from '../lib/solana/fixtures.ts';
import type { JesseIntent, MarketComparison, SolanaPaperEstimate } from '../lib/solana/contracts.ts';

const T0 = 1_900_000_000_000;
const instrument = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const BUY_INTENT: JesseIntent = { instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' };

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

function estimate(overrides: Partial<SolanaPaperEstimate> = {}): SolanaPaperEstimate {
  return {
    version: 2,
    id: 'q-desk-1',
    kind: 'estimate',
    mode: 'paper',
    liveExecutionEnabled: false,
    deskId: 'jesse',
    network: 'solana:mainnet',
    venue: 'jupiter',
    intent: BUY_INTENT,
    instrumentAddress: instrument.mint,
    instrumentName: instrument.name,
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    outputMint: instrument.mint,
    inputSymbol: 'USDC',
    outputSymbol: instrument.symbol,
    amountInRaw: '100000000',
    amountOutRaw: '30000',
    inputAmount: '100',
    outputAmount: '0.3',
    requestedScaledAmount: null,
    effectiveScaledAmount: '0.3009810375',
    scaling: {
      multiplier: '1.003270125',
      observedSlot: 447810700,
      observedAt: T0 - 1000,
      nextEffectiveAt: null,
    },
    router: 'metis',
    priceImpactPercent: '0',
    feeBps: 2,
    feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    slippageBps: 50,
    minOutputRaw: '29850',
    providerRequestId: 'req-desk-1',
    quotedAt: T0,
    expiresAt: T0 + 30_000,
    assumptions: 'Paper assumptions for tests.',
    ...overrides,
  };
}

/** A desk whose render snapshot never advances — the browser before React
 *  re-renders between tool calls. Methods still act on the live controller. */
function laggingDesk(outputAmount?: string) {
  const session = createJesseDeskSession({
    storage: memoryStorage(),
    now: () => T0,
    ports: {
      quote: async () => estimate(outputAmount ? { outputAmount } : {}),
      compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
    },
  });
  const frozen = session.getSnapshot();
  const desk = {
    ...frozen,
    foreground: jesseForeground(frozen.state, null, []),
    edit: session.edit,
    quote: session.quote,
    compare: session.compare,
    file: session.file,
    cancel: session.cancel,
    watch: session.watch,
  } as unknown as JesseDesk;
  const marks: string[] = [];
  const handlers = jesseToolHandlers({ desk: () => desk, markLine: field => { marks.push(field); } });
  return { session, handlers, marks };
}

describe('jesse tool handlers with a lagging snapshot', () => {
  it('keeps instrument, side and amount when tools fire in one turn', async () => {
    const { session, handlers } = laggingDesk();
    await handlers.choose_instrument({ query: 'Apple' });
    await handlers.set_instruction({ side: 'buy' });
    await handlers.set_amount({ amount: '100' });
    const draft = session.getSnapshot().state.draft;
    assert.equal(draft.instrumentId, instrument.id);
    assert.equal(draft.side, 'buy');
    assert.equal(draft.unit, 'USDC');
    assert.equal(draft.amount, '100');
  });

  it('runs tools fired together without one erasing another', async () => {
    const { session, handlers } = laggingDesk();
    await Promise.all([
      handlers.choose_instrument({ query: 'Apple' }),
      handlers.set_instruction({ side: 'buy' }),
      handlers.set_amount({ amount: '100' }),
    ]);
    const draft = session.getSnapshot().state.draft;
    assert.equal(draft.instrumentId, instrument.id);
    assert.equal(draft.side, 'buy');
    assert.equal(draft.amount, '100');
  });

  it('says what side the amount landed on', async () => {
    const { handlers } = laggingDesk();
    await handlers.set_instruction({ side: 'buy' });
    assert.equal(await handlers.set_amount({ amount: '100' }), '100 USDC is on the ticket.');
  });

  it('reports a landed quote even though the snapshot has not caught up', async () => {
    const { session, handlers } = laggingDesk();
    await handlers.choose_instrument({ query: 'Apple' });
    await handlers.set_instruction({ side: 'buy' });
    await handlers.set_amount({ amount: '100' });
    const spoken = await handlers.request_estimate({});
    assert.equal(session.getSnapshot().state.stage, 'review');
    assert.ok(!/did not come through/i.test(spoken), spoken);
  });

  it('refuses honestly when the ticket is incomplete', async () => {
    const { session, handlers } = laggingDesk();
    await handlers.choose_instrument({ query: 'Apple' });
    const spoken = await handlers.request_estimate({});
    assert.notEqual(session.getSnapshot().state.stage, 'review');
    assert.ok(spoken.length > 0);
  });
});

describe('spoken amounts', () => {
  it('rounds long token decimals to something a voice can read', () => {
    assert.equal(spokenAmount('0.0873111311615924929009'), '0.08731');
    assert.equal(spokenAmount('123.456789'), '123.5');
    assert.equal(spokenAmount('20'), '20');
    assert.equal(spokenAmount('0.5'), '0.5');
    assert.equal(spokenAmount('100.000'), '100');
  });

  it('leaves unparseable and tiny values alone rather than inventing one', () => {
    assert.equal(spokenAmount('not-a-number'), 'not-a-number');
    assert.equal(spokenAmount('0'), '0');
    assert.equal(spokenAmount('0.0000000001234'), '0.0000000001234');
  });

  it('keeps the stored estimate exact while the spoken line is short', async () => {
    const long = '0.0873111311615924929009';
    const long2 = laggingDesk(long);
    await long2.handlers.choose_instrument({ query: 'Apple' });
    await long2.handlers.set_instruction({ side: 'buy' });
    await long2.handlers.set_amount({ amount: '100' });
    const spoken = await long2.handlers.request_estimate({});
    assert.ok(!spoken.includes(long), spoken);
    assert.match(spoken, /0\.08731/);
    assert.equal(long2.session.getSnapshot().state.quote?.outputAmount, long);
  });
});

describe('unavailable tool messages', () => {
  it('does not refuse a filing that already succeeded', () => {
    const msg = unavailableToolMessage('record_paper', { kind: 'receipt' });
    assert.match(msg, /already filed/i);
    assert.ok(!/no estimate in review/i.test(msg));
  });

  it('still refuses honestly when nothing is in review', () => {
    assert.match(unavailableToolMessage('record_paper', { kind: 'draft' }), /no estimate in review/i);
    assert.match(unavailableToolMessage('watch_mark', { kind: 'pending' }), /not available/i);
  });
});
