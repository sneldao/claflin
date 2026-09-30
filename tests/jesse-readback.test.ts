import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJesseDeskSession, type JesseDesk } from '../lib/solana/useJesseDesk';
import { jesseForeground } from '../lib/solana/desk-documents';
import { jesseToolHandlers } from '../lib/jesse/desk-tools';
import { AssemblyAiVoiceSession, VOICE_DEBUG_WINDOW_KEY } from '../lib/jesse/assemblyai-session';
import { jesseSessionUpdate } from '../lib/jesse/assemblyai-agent';
import {
  amountToWords,
  createQuoteReadback,
  quoteReadbackUtterance,
  type ReadbackOutcome,
  type SpeechSynthLike,
  type SpeechUtteranceLike,
} from '../lib/jesse/quote-readback';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { COMPARISON_UNAVAILABLE_FIXTURE } from '../lib/solana/fixtures';
import type { JesseIntent, MarketComparison, SolanaPaperEstimate } from '../lib/solana/contracts';
import type { QuoteReadback } from '../lib/desk/contracts';

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
    id: 'q-readback-1',
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
    outputAmount: '0.029931597948943828883109',
    requestedScaledAmount: null,
    effectiveScaledAmount: '0.0300294919',
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
    providerRequestId: 'req-readback-1',
    quotedAt: T0,
    expiresAt: T0 + 30_000,
    assumptions: 'Paper assumptions for tests.',
    ...overrides,
  };
}

function voiceDesk(outcome: ReadbackOutcome = 'completed', outputAmount?: string) {
  const session = createJesseDeskSession({
    storage: memoryStorage(),
    now: () => T0,
    ports: {
      quote: async intent => estimate({ intent, inputAmount: intent.amount, ...(outputAmount ? { outputAmount } : {}) }),
      compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
    },
  });
  const desk = {
    get state() { return session.getSnapshot().state; },
    get records() { return session.getSnapshot().records; },
    get historyReady() { return session.getSnapshot().historyReady; },
    get viewedRecordId() { return session.getSnapshot().viewedRecordId; },
    get inFlight() { return session.getSnapshot().inFlight; },
    getCurrentState: session.getCurrentState,
    get foreground() {
      const s = session.getSnapshot();
      return jesseForeground(s.state, s.viewedRecordId, s.historyReady ? s.records : undefined);
    },
    edit: session.edit, quote: session.quote, file: session.file, cancel: session.cancel,
    compare: session.compare, watch: session.watch,
    openRecord: session.openRecord, dismissRecord: session.dismissRecord, removeRecord: session.removeRecord,
  } as unknown as JesseDesk;
  const readbacks: QuoteReadback[] = [];
  const handlers = jesseToolHandlers({
    desk: () => desk,
    markLine: () => {},
    onQuoteReadback: async payload => { readbacks.push(payload); return outcome; },
  });
  return { session, handlers, readbacks };
}

async function quotedDesk(outcome: ReadbackOutcome = 'completed', outputAmount?: string) {
  const d = voiceDesk(outcome, outputAmount);
  await d.handlers.choose_instrument({ query: 'Apple' });
  await d.handlers.set_instruction({ side: 'buy' });
  await d.handlers.set_amount({ amount: '100' });
  return d;
}

describe('quote readback — deterministic words', () => {
  it('spells every digit so a model cannot mishear a decimal', () => {
    assert.equal(amountToWords('10'), 'one zero');
    assert.equal(amountToWords('0.5'), 'zero point five');
    const payload: QuoteReadback = {
      quoteId: 'q1', revision: 3, expiresAt: T0 + 30_000,
      inputAmount: '10', inputSymbol: 'USDC',
      outputAmount: '0.029931597948943828883109', outputSymbol: 'AAPLx',
    };
    const line = quoteReadbackUtterance(payload);
    assert.ok(line);
    assert.match(line!, /one zero U S D C/);
    assert.match(line!, /zero point zero two nine nine three Apple xStock/);
    assert.match(line!, /Jupiter estimate\. Paper only\./);
    assert.equal(payload.outputAmount, '0.029931597948943828883109', 'the stored amount is never touched');
  });

  it('uses the same spend/receive wording for a sell direction', () => {
    const payload: QuoteReadback = {
      quoteId: 'q2', revision: 4, expiresAt: T0 + 30_000,
      inputAmount: '5.5', inputSymbol: 'AAPLx',
      outputAmount: '126.9', outputSymbol: 'USDC',
    };
    const line = quoteReadbackUtterance(payload)!;
    assert.match(line, /^Spend five point five Apple xStock, receive approximately /);
    assert.match(line, /one two six point nine U S D C\./);
  });

  it('refuses to voice an amount or symbol it cannot say plainly', () => {
    const payload: QuoteReadback = {
      quoteId: 'q3', revision: 4, expiresAt: T0 + 30_000,
      inputAmount: '100', inputSymbol: 'USDC',
      outputAmount: 'not-a-number', outputSymbol: 'AAPLx',
    };
    assert.equal(quoteReadbackUtterance(payload), null);
    assert.equal(amountToWords('1e-7'), null);
    assert.equal(quoteReadbackUtterance({ ...payload, outputAmount: '1', outputSymbol: 'DOGE' }), null);
  });
});

describe('quote readback — controller payload', () => {
  it('binds the readback to the accepted quote and result revision', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async intent => estimate({ intent, inputAmount: intent.amount }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    await session.edit({ instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' }, 'amount');
    const before = session.getSnapshot().state.revision;
    const result = await session.quote();
    assert.equal(result.status, 'applied');
    assert.ok(result.quoteReadback);
    assert.equal(result.quoteReadback!.quoteId, 'q-readback-1');
    assert.equal(result.quoteReadback!.revision, before + 2, 'draft apply plus quote acceptance');
    assert.equal(result.quoteReadback!.revision, session.getCurrentState().revision);
    assert.equal(result.quoteReadback!.outputAmount, '0.029931597948943828883109');
    assert.equal(result.quoteReadback!.outputSymbol, 'AAPLx');
    assert.equal(result.quoteReadback!.expiresAt, T0 + 30_000);
    session.dispose();
  });

  it('carries no readback on a stale or failed estimate', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async () => { throw new Error('the venue did not answer'); },
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    await session.edit({ instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' }, 'amount');
    const result = await session.quote();
    assert.notEqual(result.status, 'applied');
    assert.equal(result.quoteReadback, undefined);
    session.dispose();
  });

  it('getCurrentState reflects the accepted quote before a render snapshot could lag', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async intent => estimate({ intent, inputAmount: intent.amount }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    await session.edit({ instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' }, 'amount');
    const staleSnapshot = session.getSnapshot().state;
    const result = await session.quote();
    assert.ok(staleSnapshot.revision < session.getCurrentState().revision);
    assert.equal(session.getCurrentState().quote?.id, result.quoteReadback!.quoteId);
    session.dispose();
  });
});

describe('quote readback — tool handler outcomes', () => {
  it('a completed readback returns the file-prompt message without digits', async () => {
    const { handlers, readbacks } = await quotedDesk('completed');
    const text = await handlers.request_estimate({});
    assert.equal(readbacks.length, 1);
    assert.match(text, /amounts were read aloud/);
    assert.match(text, /save this paper record/);
    assert.doesNotMatch(text, /\d/);
  });

  it('an unavailable readback never claims the amounts were spoken', async () => {
    const { handlers } = await quotedDesk('unavailable');
    const text = await handlers.request_estimate({});
    assert.match(text, /could not read the estimate aloud/);
    assert.match(text, /Do not speak or guess/);
    assert.doesNotMatch(text, /read aloud\.|were read aloud/);
  });

  it('a stale or cancelled readback warns not to file the old estimate', async () => {
    for (const outcome of ['stale', 'cancelled'] as const) {
      const { handlers } = await quotedDesk(outcome);
      const text = await handlers.request_estimate({});
      assert.match(text, /interrupted or the instruction changed/);
      assert.match(text, /do not ask to file the previous estimate/);
    }
  });

  it('an expired readback offers a fresh estimate only', async () => {
    const { handlers } = await quotedDesk('expired');
    const text = await handlers.request_estimate({});
    assert.match(text, /expired before its readback completed/);
    assert.match(text, /fresh estimate/);
    assert.doesNotMatch(text, /were read aloud/);
  });

  it('request_estimate keeps the spoken result when no readback is wired', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async intent => estimate({ intent, inputAmount: intent.amount }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    const desk = {
      get state() { return session.getSnapshot().state; },
      get inFlight() { return session.getSnapshot().inFlight; },
      get foreground() {
        const s = session.getSnapshot();
        return jesseForeground(s.state, s.viewedRecordId, s.records);
      },
      edit: session.edit, quote: session.quote, file: session.file, cancel: session.cancel,
    } as unknown as JesseDesk;
    const handlers = jesseToolHandlers({ desk: () => desk, markLine: () => {} });
    await handlers.choose_instrument({ query: 'Apple' });
    await handlers.set_instruction({ side: 'buy' });
    await handlers.set_amount({ amount: '100' });
    const text = await handlers.request_estimate({});
    assert.match(text, /receive about/);
    session.dispose();
  });

  it('describe_desk on a quotation re-reads the current quote with outcome honesty', async () => {
    const { handlers, readbacks, session } = await quotedDesk('completed');
    await handlers.request_estimate({});
    assert.equal(session.getSnapshot().state.quote?.id, 'q-readback-1');
    const text = await handlers.describe_desk({});
    assert.equal(readbacks.length, 2, 'the current quote is read again on request');
    assert.equal(readbacks[1].quoteId, 'q-readback-1');
    assert.match(text, /amounts were read aloud/);
    assert.doesNotMatch(text, /0\.0299/);
  });

  it('describe_desk on an expired quotation does not claim a fresh readback', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async intent => estimate({ intent, inputAmount: intent.amount }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    const desk = {
      get state() { return session.getSnapshot().state; },
      get inFlight() { return session.getSnapshot().inFlight; },
      get foreground() {
        const s = session.getSnapshot();
        return jesseForeground(s.state, s.viewedRecordId, s.records);
      },
      edit: session.edit, quote: session.quote, file: session.file, cancel: session.cancel,
    } as unknown as JesseDesk;
    const handlers = jesseToolHandlers({
      desk: () => desk,
      markLine: () => {},
      onQuoteReadback: async () => 'expired',
    });
    await handlers.choose_instrument({ query: 'Apple' });
    await handlers.set_instruction({ side: 'buy' });
    await handlers.set_amount({ amount: '100' });
    await handlers.request_estimate({});
    const text = await handlers.describe_desk({});
    assert.match(text, /expired before its readback completed/);
    assert.doesNotMatch(text, /were read aloud/);
    session.dispose();
  });
});

class FakeUtterance implements SpeechUtteranceLike {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

class FakeSynth implements SpeechSynthLike {
  utterances: FakeUtterance[] = [];
  cancels = 0;
  autoStart = true;
  throws = false;
  syncCancelEvents = false;
  speak(u: unknown) {
    if (this.throws) throw new Error('speak failed');
    const utterance = u as FakeUtterance;
    this.utterances.push(utterance);
    if (this.autoStart) setTimeout(() => { utterance.onstart?.(); utterance.onend?.(); }, 0);
  }
  cancel() {
    this.cancels += 1;
    if (this.syncCancelEvents) {
      const utterance = this.utterances[this.utterances.length - 1];
      utterance?.onerror?.();
      utterance?.onend?.();
    }
  }
}

function readbackPayload(overrides: Partial<QuoteReadback> = {}): QuoteReadback {
  return {
    quoteId: 'q-rb', revision: 5, expiresAt: T0 + 30_000,
    inputAmount: '10', inputSymbol: 'USDC',
    outputAmount: '0.029931597948943828883109', outputSymbol: 'AAPLx',
    ...overrides,
  };
}

describe('quote readback — browser speech outcomes', () => {
  it('speaks the deterministic sentence and reports completed', async () => {
    const synth = new FakeSynth();
    const started: string[] = [];
    const rb = createQuoteReadback({
      isCurrent: () => true,
      onStart: t => started.push(t),
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const outcome = await rb.speak(readbackPayload());
    assert.equal(outcome, 'completed');
    assert.equal(synth.utterances.length, 1);
    assert.match(synth.utterances[0].text, /one zero U S D C, receive approximately zero point zero two nine nine three Apple xStock/);
    assert.deepEqual(started, [synth.utterances[0].text]);
  });

  it('a barge-in cancel settles the pending readback as cancelled', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    const rb = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const pending = rb.speak(readbackPayload());
    rb.cancel();
    const outcome = await pending;
    assert.equal(outcome, 'cancelled');
    assert.equal(synth.cancels, 1);
  });

  it('an utterance that never starts reports unavailable inside the bound', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    const rb = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
      maxWaitMs: 25,
    });
    const outcome = await rb.speak(readbackPayload());
    assert.equal(outcome, 'unavailable');
    assert.equal(synth.cancels, 1);
  });

  it('an expired payload and an expiry timer both report expired', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    const rb = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    assert.equal(await rb.speak(readbackPayload({ expiresAt: T0 - 1 })), 'expired');
    const outcome = await rb.speak(readbackPayload({ expiresAt: T0 + 20 }));
    assert.equal(outcome, 'expired');
    assert.equal(synth.cancels, 1, 'the queued utterance is cancelled at expiry');
  });

  it('stale, unsupported and invalid payloads never produce a completion', async () => {
    const synth = new FakeSynth();
    const rb = createQuoteReadback({
      isCurrent: () => false,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    assert.equal(await rb.speak(readbackPayload()), 'stale');
    const none = createQuoteReadback({
      isCurrent: () => true,
      synth: null as unknown as SpeechSynthLike,
      now: () => T0,
    });
    assert.equal(await none.speak(readbackPayload()), 'unavailable');
    const invalid = createQuoteReadback({
      isCurrent: () => true,
      synth: new FakeSynth(),
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    assert.equal(await invalid.speak(readbackPayload({ outputAmount: 'bad' })), 'unavailable');
  });

  it('synchronous cancel events cannot overwrite an expired or timed-out outcome', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    synth.syncCancelEvents = true;
    const rb = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    assert.equal(await rb.speak(readbackPayload({ expiresAt: T0 + 20 })), 'expired');
    const rb2 = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
      maxWaitMs: 15,
    });
    assert.equal(await rb2.speak(readbackPayload()), 'unavailable');
  });

  it('a late onstart after settling never captions, and stale/expired never fall back', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    synth.syncCancelEvents = true;
    const started: string[] = [];
    const fallbacks: string[] = [];
    const rb = createQuoteReadback({
      isCurrent: p => p.revision === 5,
      onStart: t => started.push(t),
      onFallback: r => fallbacks.push(r),
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const outcome = await rb.speak(readbackPayload({ expiresAt: T0 + 20 }));
    assert.equal(outcome, 'expired');
    synth.utterances[0].onstart?.();
    assert.deepEqual(started, [], 'no caption after the readback already settled');
    const stale = await rb.speak(readbackPayload({ expiresAt: T0 + 30_000, revision: 999 }));
    assert.equal(stale, 'stale');
    assert.deepEqual(fallbacks, [], 'expired/stale never show the written-slip fallback');
  });

  it('a throwing synth.speak reports unavailable without hanging', async () => {
    const synth = new FakeSynth();
    synth.throws = true;
    const rb = createQuoteReadback({
      isCurrent: () => true,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const outcome = await rb.speak(readbackPayload());
    assert.equal(outcome, 'unavailable');
  });

  it('cancelIfStale drops only a payload the desk has moved past', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    let current = true;
    const rb = createQuoteReadback({
      isCurrent: () => current,
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const pending = rb.speak(readbackPayload());
    rb.cancelIfStale();
    assert.equal(synth.cancels, 0, 'still current — nothing to cancel');
    current = false;
    rb.cancelIfStale();
    const outcome = await pending;
    assert.equal(outcome, 'cancelled');
    assert.equal(synth.cancels, 1);
  });

  it('late events from a superseded utterance cannot settle or caption a new one', async () => {
    const synth = new FakeSynth();
    synth.autoStart = false;
    const started: string[] = [];
    const rb = createQuoteReadback({
      isCurrent: () => true,
      onStart: t => started.push(t),
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const first = rb.speak(readbackPayload());
    const second = rb.speak(readbackPayload({ quoteId: 'q-new' }));
    assert.equal(await first, 'cancelled');
    const old = synth.utterances[0];
    const fresh = synth.utterances[1];
    old.onstart?.();
    old.onend?.();
    old.onerror?.();
    assert.deepEqual(started, [], 'the old utterance cannot caption the new readback');
    fresh.onstart?.();
    assert.equal(started.length, 1);
    fresh.onend?.();
    assert.equal(await second, 'completed');
  });

  it('the live accessor keeps a just-accepted readback current, edits stale it', async () => {
    const session = createJesseDeskSession({
      storage: memoryStorage(),
      now: () => T0,
      ports: {
        quote: async intent => estimate({ intent, inputAmount: intent.amount }),
        compare: async () => COMPARISON_UNAVAILABLE_FIXTURE as MarketComparison,
      },
    });
    await session.edit({ instrumentId: instrument.id, side: 'buy', unit: 'USDC', amount: '100' }, 'amount');
    const result = await session.quote();
    const payload = result.quoteReadback!;
    const synth = new FakeSynth();
    synth.autoStart = false;
    const rb = createQuoteReadback({
      isCurrent: p => {
        const s = session.getCurrentState();
        return s.revision === p.revision && s.quote?.id === p.quoteId && T0 < p.expiresAt;
      },
      synth,
      utteranceFor: t => new FakeUtterance(t),
      now: () => T0,
    });
    const pending = rb.speak(payload);
    synth.utterances[0].onstart?.();
    synth.utterances[0].onend?.();
    assert.equal(await pending, 'completed', 'readback survives its own accepted revision');
    const second = rb.speak(payload);
    await session.edit({ amount: '50' }, 'amount');
    rb.cancelIfStale();
    assert.equal(await second, 'cancelled');
    session.dispose();
  });
});

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: URL) { FakeSocket.last = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class FakeNode {
  static posted: unknown[] = [];
  port = { onmessage: null as unknown, postMessage: (m: unknown) => { FakeNode.posted.push(m); } };
  connect() { return this; }
}

class FakeAudioContext {
  audioWorklet = { addModule: async () => undefined };
  destination = {};
  async resume() {}
  async close() {}
  createMediaStreamSource() { return { connect: () => undefined }; }
}

function sessionHandlers(overrides: Record<string, unknown> = {}) {
  return {
    onReady: () => undefined,
    onUserTranscript: () => undefined,
    onAgentTranscript: () => undefined,
    onSpeaking: () => undefined,
    onToolCall: async () => 'ok',
    onEnded: () => undefined,
    onError: () => undefined,
    ...overrides,
  } as ConstructorParameters<typeof AssemblyAiVoiceSession>[0];
}

describe('quote readback — session coordination', () => {
  const saved: Record<string, unknown> = {};

  beforeEach(() => {
    FakeNode.posted = [];
    for (const key of ['WebSocket', 'AudioContext', 'AudioWorkletNode']) saved[key] = (globalThis as Record<string, unknown>)[key];
    (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
    (window as unknown as Record<string, unknown>).WebSocket = FakeSocket;
    (window as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
    (globalThis as Record<string, unknown>).AudioWorkletNode = FakeNode;
    (globalThis as Record<string, unknown>).URL.createObjectURL = () => 'blob:x';
    (globalThis as Record<string, unknown>).URL.revokeObjectURL = () => undefined;
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) (globalThis as Record<string, unknown>)[key] = value;
    }
    delete (window as unknown as Record<string, unknown>)[VOICE_DEBUG_WINDOW_KEY];
  });

  async function liveSession(session: AssemblyAiVoiceSession) {
    await session.start('tok_rb', { type: 'session.update', session: {} });
    await new Promise(r => setTimeout(r, 5));
    FakeSocket.last!.emit({ type: 'session.ready', session_id: 's-rb' });
    return FakeSocket.last!;
  }

  it('runReadback waits for the in-flight reply, then runs the task', async () => {
    const order: string[] = [];
    const session = new AssemblyAiVoiceSession(sessionHandlers());
    const ws = await liveSession(session);
    ws.emit({ type: 'reply.started', reply_id: 'r1' });
    const readback = session.runReadback(async () => {
      order.push('task');
      return 'completed';
    });
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(order, [], 'the local readback waits for reply.done');
    ws.emit({ type: 'reply.done', reply_id: 'r1', status: 'completed' });
    const outcome = await readback;
    assert.equal(outcome, 'completed');
    assert.deepEqual(order, ['task']);
    assert.equal(session.isLocalSpeaking, false);
    session.end();
  });

  it('a hanging reply ends the wait as unavailable and retains no waiter', async () => {
    const session = new AssemblyAiVoiceSession(sessionHandlers());
    const ws = await liveSession(session);
    ws.emit({ type: 'reply.started', reply_id: 'r1' });
    let ran = false;
    const outcome = await session.runReadback(async () => { ran = true; return 'completed'; });
    assert.equal(outcome, 'unavailable');
    assert.equal(ran, false);
    session.end();
  }, 8000);

  it('ending the call while a readback waits resolves cancelled, never runs the task', async () => {
    const session = new AssemblyAiVoiceSession(sessionHandlers());
    const ws = await liveSession(session);
    ws.emit({ type: 'reply.started', reply_id: 'r1' });
    let ran = false;
    const pending = session.runReadback(async () => { ran = true; return 'completed'; });
    session.end();
    assert.equal(await pending, 'cancelled');
    assert.equal(ran, false);
  });

  it('barge-in while waiting invalidates the pending readback', async () => {
    const session = new AssemblyAiVoiceSession(sessionHandlers());
    const ws = await liveSession(session);
    ws.emit({ type: 'reply.started', reply_id: 'r1' });
    let ran = false;
    const pending = session.runReadback(async () => { ran = true; return 'completed'; });
    ws.emit({ type: 'input.speech.started' });
    assert.equal(await pending, 'cancelled');
    assert.equal(ran, false);
    session.end();
  });

  it('a newer readback keeps agent audio dropped when the older one ends', async () => {
    const session = new AssemblyAiVoiceSession(sessionHandlers());
    const ws = await liveSession(session);
    FakeNode.posted = [];
    let finishFirst: (() => void) | null = null;
    let finishSecond: (() => void) | null = null;
    const first = session.runReadback(() => new Promise<'completed'>(resolve => { finishFirst = () => resolve('completed'); }));
    const second = session.runReadback(() => new Promise<'completed'>(resolve => { finishSecond = () => resolve('completed'); }));
    finishFirst!();
    await first;
    await new Promise(r => setTimeout(r, 2));
    ws.emit({ type: 'reply.audio', data: Buffer.from('noise').toString('base64') });
    finishSecond!();
    await second;
    assert.ok(!FakeNode.posted.some(m => m instanceof ArrayBuffer), 'the older finally must not reopen agent audio');
    session.end();
  });

  it('reply.audio and agent transcripts are dropped while local speech runs', async () => {
    const heard: string[] = [];
    const session = new AssemblyAiVoiceSession(sessionHandlers({ onAgentTranscript: t => heard.push(t) }));
    const ws = await liveSession(session);
    FakeNode.posted = [];
    const readback = session.runReadback(async () => {
      ws.emit({ type: 'reply.audio', data: Buffer.from('noise').toString('base64') });
      ws.emit({ type: 'transcript.agent', text: 'agent words nobody heard' });
      await new Promise(r => setTimeout(r, 5));
      return 'completed';
    });
    assert.equal(await readback, 'completed');
    assert.equal(session.isLocalSpeaking, false);
    assert.ok(!FakeNode.posted.some(m => m instanceof ArrayBuffer), 'no agent audio reaches the ring');
    assert.ok(FakeNode.posted.includes('stop'), 'buffered playback is stopped first');
    assert.deepEqual(heard, [], 'the UI never captions agent speech nobody could hear');
    session.end();
  });

  it('input.speech.started interrupts playback and fires the local cancel', async () => {
    let speech = 0;
    const session = new AssemblyAiVoiceSession(sessionHandlers({ onSpeechStarted: () => { speech += 1; } }));
    const ws = await liveSession(session);
    FakeNode.posted = [];
    ws.emit({ type: 'input.speech.started' });
    assert.equal(speech, 1);
    assert.ok(FakeNode.posted.includes('stop'));
    session.end();
  });

  it('diagnostics are off by default; opt-in records sends, agent text and quote metadata only', async () => {
    const plain = new AssemblyAiVoiceSession(sessionHandlers({ onToolCall: async () => 'plain result' }));
    let ws = await liveSession(plain);
    ws.emit({ type: 'tool.call', call_id: 'c1', name: 'describe_desk', arguments: {} });
    await new Promise(r => setTimeout(r, 5));
    assert.equal(plain.getDiagnostics().length, 0);
    assert.equal((window as unknown as Record<string, unknown>)[VOICE_DEBUG_WINDOW_KEY], undefined);
    plain.end();

    const debugSession = new AssemblyAiVoiceSession(sessionHandlers({ onToolCall: async () => 'readback result text' }), { debug: true });
    ws = await liveSession(debugSession);
    ws.emit({ type: 'tool.call', call_id: 'c9', name: 'request_estimate', arguments: {} });
    ws.emit({ type: 'transcript.agent', text: 'Jesse says hello' });
    ws.emit({ type: 'transcript.user', text: 'user private words' });
    await new Promise(r => setTimeout(r, 5));
    debugSession.recordReadbackDiagnostic({
      quoteId: 'q-diag', revision: 7, expiresAt: T0 + 30_000,
      inputAmount: '10', inputSymbol: 'USDC',
      outputAmount: '0.02993', outputSymbol: 'AAPLx',
    }, 'Spend one zero U S D C', 'completed');
    const diag = debugSession.getDiagnostics();
    const sent = diag.find(e => e.event === 'tool_result_sent');
    assert.ok(sent);
    assert.equal(sent!.callId, 'c9');
    assert.equal(sent!.name, 'request_estimate');
    assert.match(sent!.text!, /readback result text/);
    const rb = diag.find(e => e.event === 'quote_readback');
    assert.ok(rb);
    assert.equal(rb!.quoteId, 'q-diag');
    assert.equal(rb!.revision, 7);
    assert.equal(rb!.outputAmount, '0.02993');
    assert.equal(rb!.outcome, 'completed');
    assert.ok(diag.some(e => e.event === 'agent_transcript' && e.text === 'Jesse says hello'));
    const blob = JSON.stringify(diag);
    assert.ok(!blob.includes('user private words'), 'user transcripts are never recorded');
    assert.ok(!blob.includes('tok_rb'), 'tokens are never recorded');
    assert.ok(diag.every(e => typeof e.at === 'number'));
    debugSession.end();
    assert.equal(debugSession.getDiagnostics().length, 0, 'ending clears diagnostics');
    assert.equal((window as unknown as Record<string, unknown>)[VOICE_DEBUG_WINDOW_KEY], undefined);
  });

  it('diagnostics stay bounded at the limit', async () => {
    const session = new AssemblyAiVoiceSession(sessionHandlers(), { debug: true });
    await liveSession(session);
    for (let i = 0; i < 60; i++) {
      FakeSocket.last!.emit({ type: 'transcript.agent', text: `line ${i}` });
      await new Promise(r => setTimeout(r, 0));
    }
    await new Promise(r => setTimeout(r, 10));
    assert.equal(session.getDiagnostics().length, 50);
    session.end();
  });

  it('teardown of a non-debug session never erases another session diagnostics', async () => {
    const debugSession = new AssemblyAiVoiceSession(sessionHandlers(), { debug: true });
    await liveSession(debugSession);
    const exposed = (window as unknown as Record<string, unknown>)[VOICE_DEBUG_WINDOW_KEY];
    assert.ok(Array.isArray(exposed));
    const plain = new AssemblyAiVoiceSession(sessionHandlers());
    (plain as unknown as { teardown(): void }).teardown();
    assert.equal((window as unknown as Record<string, unknown>)[VOICE_DEBUG_WINDOW_KEY], exposed);
    debugSession.end();
  });

  it('the AssemblyAI prompt forbids the model from repeating quote amounts', () => {
    const update = jesseSessionUpdate({ greeting: 'hi', foreground: { kind: 'draft' }, instrument: '', stage: 'draft', priorDiscussion: null });
    assert.match(update.session.system_prompt, /Quote amounts are read aloud by the browser, not by you\./);
    assert.match(update.session.system_prompt, /Never restate, calculate, convert, or guess the estimated received amount\./);
  });
});
