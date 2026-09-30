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
function laggingDesk(outputAmount?: string, turn: { n: number } | null = { n: 0 }) {
  const session = createJesseDeskSession({
    storage: memoryStorage(),
    now: () => T0,
    ports: {
      quote: async intent => estimate({ intent, inputAmount: intent.amount, ...(outputAmount ? { outputAmount } : {}) }),
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
  const handlers = jesseToolHandlers({
    desk: () => desk,
    markLine: field => { marks.push(field); },
    ...(turn ? { userTurn: () => turn.n } : {}),
  });
  return { session, handlers, marks, turn };
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

describe('another instruction after a filing', () => {
  async function filed() {
    const desk = laggingDesk();
    await desk.handlers.choose_instrument({ query: 'Apple' });
    await desk.handlers.set_instruction({ side: 'buy' });
    await desk.handlers.set_amount({ amount: '100' });
    await desk.handlers.request_estimate({});
    await desk.handlers.record_paper({});
    assert.equal(desk.session.getSnapshot().state.stage, 'saved');
    return desk;
  }

  it('prices the same ticket again from a filed receipt', async () => {
    const { session, handlers } = await filed();
    const spoken = await handlers.request_estimate({});
    assert.equal(session.getSnapshot().state.stage, 'review');
    assert.ok(!/did not come through|cannot/i.test(spoken), spoken);
  });

  it('takes a corrected amount after a filing and reprices it', async () => {
    const { session, handlers } = await filed();
    await handlers.set_amount({ amount: '20' });
    assert.equal(session.getSnapshot().state.draft.amount, '20');
    assert.equal(session.getSnapshot().state.stage, 'draft');
    await handlers.request_estimate({});
    assert.equal(session.getSnapshot().state.stage, 'review');
  });

  it('leaves the filed record alone', async () => {
    const { session, handlers } = await filed();
    await handlers.set_amount({ amount: '20' });
    await handlers.request_estimate({});
    assert.equal(session.getSnapshot().records.length, 1);
  });
});

/** Across turns the render snapshot has caught up — record tools read it live. */
function recordsDesk(turn: { n: number } | null = { n: 0 }) {
  let quotes = 0;
  const session = createJesseDeskSession({
    storage: memoryStorage(),
    now: () => T0,
    ports: {
      quote: async intent => {
        const target = SOLANA_INSTRUMENTS.find(i => i.id === intent.instrumentId)!;
        quotes += 1;
        return estimate({
          id: `q-records-${quotes}`,
          intent,
          inputAmount: intent.amount,
          instrumentAddress: target.mint,
          instrumentName: target.name,
          outputMint: target.mint,
          outputSymbol: target.symbol,
        });
      },
      compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
    },
  });
  const desk = {
    get state() { return session.getSnapshot().state; },
    get records() { return session.getSnapshot().records; },
    get historyReady() { return session.getSnapshot().historyReady; },
    get viewedRecordId() { return session.getSnapshot().viewedRecordId; },
    get foreground() {
      const s = session.getSnapshot();
      return jesseForeground(s.state, s.viewedRecordId, s.historyReady ? s.records : undefined);
    },
    edit: session.edit, quote: session.quote, file: session.file, cancel: session.cancel,
    openRecord: session.openRecord, dismissRecord: session.dismissRecord, removeRecord: session.removeRecord,
  } as unknown as JesseDesk;
  const handlers = jesseToolHandlers({ desk: () => desk, markLine: () => {}, ...(turn ? { userTurn: () => turn.n } : {}) });
  return { session, handlers, turn };
}

async function fileOne(h: ReturnType<typeof recordsDesk>['handlers'], query: string, side: 'buy' | 'sell' = 'buy', amount = '100') {
  await h.choose_instrument({ query });
  await h.set_instruction({ side });
  await h.set_amount({ amount });
  await h.request_estimate({});
  await h.record_paper({});
}

describe('records by voice', () => {
  it('opens the matching record read-only, and goes back to the ticket', async () => {
    const { session, handlers } = recordsDesk();
    await fileOne(handlers, 'Apple');
    await handlers.set_amount({ amount: '20' });
    const said = await handlers.open_record({ query: 'the Apple buy' });
    assert.match(said, /Showing the buy/i);
    assert.equal(session.getSnapshot().viewedRecordId, session.getSnapshot().records[0].id);
    await handlers.back_to_instruction({});
    assert.equal(session.getSnapshot().viewedRecordId, null);
    assert.equal(session.getSnapshot().state.stage, 'draft');
    assert.equal(session.getSnapshot().state.draft.amount, '20', 'the instruction is as the caller left it');
  });

  it('says so, and changes nothing, when no record matches', async () => {
    const { session, handlers } = recordsDesk();
    await fileOne(handlers, 'Apple');
    const before = session.getSnapshot().viewedRecordId;
    const said = await handlers.open_record({ query: 'Tesla' });
    assert.match(said, /No filed record matches/i);
    assert.equal(session.getSnapshot().viewedRecordId, before, 'nothing was opened');
    assert.match(await recordsDesk().handlers.open_record({}), /no paper records/i);
  });
});

describe('deleting a record by voice', () => {
  it('never deletes on the first call — it names the record and asks', async () => {
    const { session, handlers } = recordsDesk();
    await fileOne(handlers, 'Apple');
    const said = await handlers.delete_record({ query: 'Apple' });
    assert.match(said, /confirm/i);
    assert.equal(session.getSnapshot().records.length, 1);
  });

  it('refuses a confirm the caller has not had a turn to give', async () => {
    const { session, handlers } = recordsDesk();
    await fileOne(handlers, 'Apple');
    await handlers.delete_record({ query: 'Apple' });
    const said = await handlers.delete_record({ confirm: true });
    assert.match(said, /has not answered/i);
    assert.equal(session.getSnapshot().records.length, 1);
  });

  it('refuses a confirm with nothing proposed', async () => {
    const { session, handlers } = recordsDesk();
    await fileOne(handlers, 'Apple');
    assert.match(await handlers.delete_record({ confirm: true }), /Nothing is waiting/i);
    assert.equal(session.getSnapshot().records.length, 1);
  });

  it('deletes exactly the proposed record after a caller turn, and returns to the ticket', async () => {
    const { session, handlers, turn } = recordsDesk();
    await fileOne(handlers, 'Apple');
    await fileOne(handlers, 'Tesla', 'buy', '50');
    assert.equal(session.getSnapshot().records.length, 2);
    await handlers.delete_record({ query: 'Tesla' });
    turn!.n += 1;
    const said = await handlers.delete_record({ confirm: true, query: 'Apple' });
    assert.match(said, /Deleted the buy/i);
    const left = session.getSnapshot().records;
    assert.equal(left.length, 1);
    assert.equal(left[0].instrumentSnapshot.symbol, 'AAPLx', 'the confirm cannot retarget a different record');
    assert.notEqual(session.getSnapshot().state.stage, 'saved');
  });

  it('forgets a proposal after one use', async () => {
    const { handlers, turn } = recordsDesk();
    await fileOne(handlers, 'Apple');
    await handlers.delete_record({});
    turn!.n += 1;
    await handlers.delete_record({ confirm: true });
    assert.match(await handlers.delete_record({ confirm: true }), /Nothing is waiting/i);
  });

  it('cannot delete by voice on a line that cannot count caller turns', async () => {
    const { session, handlers } = recordsDesk(null);
    await fileOne(handlers, 'Apple');
    assert.match(await handlers.delete_record({ query: 'Apple' }), /not available on this line/i);
    assert.match(await handlers.delete_record({ confirm: true }), /not available on this line/i);
    assert.equal(session.getSnapshot().records.length, 1);
  });
});
