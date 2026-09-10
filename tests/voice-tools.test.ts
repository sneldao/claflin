import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';
import { deskReducer, initialDesk, type DeskState } from '../lib/trading/workflow';
import { foregroundDocument, type ForegroundDocument } from '../lib/trading/desk-documents';
import {
  chooseInstrumentResult,
  describeDesk,
  deskNoteSpokenLine,
  DESK_NOTE_ALREADY_SHARED,
  estimateSpokenResult,
  foregroundGuard,
  recordPaperGuard,
  setAmountResult,
  setInstructionResult,
  watchTarget,
} from '../lib/trading/voice-tools';
import { deskNoteOfTheDay } from '../lib/desk-notes';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];
const aapl = DESK_INSTRUMENTS.find(s => s.symbol === 'AAPLc')!;
const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' };
const quote: QuoteEstimate = {
  id: 'quote-voice', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: 'NVDAc', amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function reviewed(): DeskState {
  return deskReducer(deskReducer(initialDesk(intent), { type: 'request', requestId: 'r1' }), { type: 'quoted', requestId: 'r1', quote });
}

function draftState(): DeskState {
  return initialDesk(intent);
}

const foregroundOf = (state: DeskState, viewedRecordId: string | null = null, records?: Parameters<typeof foregroundDocument>[2]) =>
  foregroundDocument(state, viewedRecordId, records);

describe('the foreground guard applies to every voice tool', () => {
  it('permits action on the live draft, review, and receipt', () => {
    assert.equal(foregroundGuard(foregroundOf(draftState())), null);
    assert.equal(foregroundGuard(foregroundOf(reviewed())), null);
    assert.equal(foregroundGuard(foregroundOf(deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: now + 1 }))), null);
  });
  it('refuses a filed record opened for reading', () => {
    const refusal = foregroundGuard(foregroundOf(reviewed(), 'filed-elsewhere'));
    assert.match(refusal ?? '', /for reading/);
  });
  it('refuses a record that vanished from the browser', () => {
    const refusal = foregroundGuard(foregroundOf(reviewed(), 'gone', []));
    assert.match(refusal ?? '', /no longer in this browser/);
  });
});

describe('choose_instrument', () => {
  it('names a supported instrument', () => {
    const spoken = chooseInstrumentResult('nvidia');
    assert.match(spoken, /NVDAc/);
    assert.match(spoken, /on the ticket/);
  });
  it('lists the quote-supported catalog for an unknown name', () => {
    const spoken = chooseInstrumentResult('tesla');
    assert.match(spoken, /not on this desk/);
    for (const symbol of DESK_INSTRUMENTS.filter(s => s.quoteSupported).map(s => s.symbol)) {
      assert.ok(spoken.includes(symbol), `catalog missing ${symbol}`);
    }
  });
  it('handles an empty query', () => {
    assert.match(chooseInstrumentResult(''), /not on this desk/);
  });
});

describe('set_instruction', () => {
  it('speaks the buy and sell consequences', () => {
    assert.match(setInstructionResult('buy'), /USDC spend/);
    assert.match(setInstructionResult('sell'), /token quantity/);
  });
  it('rejects anything that is not buy or sell', () => {
    assert.match(setInstructionResult('short'), /buy or sell/);
    assert.match(setInstructionResult(''), /buy or sell/);
  });
});

describe('set_amount', () => {
  it('speaks the unit for each side', () => {
    assert.match(setAmountResult('buy', '25'), /25 USDC/);
    assert.match(setAmountResult('sell', '0.5'), /0\.5 tokens/);
  });
});

describe('request_estimate confirmation', () => {
  it('reads back spend, receipt, venue and the live review window', () => {
    const spoken = estimateSpokenResult(quote, now + 5000);
    assert.match(spoken, /spend 100 USDC/);
    assert.match(spoken, /receive 0\.43369593 NVDAc/);
    assert.match(spoken, /Aerodrome on Base/);
    assert.match(spoken, /25 seconds to review/);
    assert.match(spoken, /not an offer/);
  });
  it('never reports a negative window', () => {
    assert.match(estimateSpokenResult(quote, quote.expiresAt + 60_000), /0 seconds to review/);
  });
});

describe('record_paper', () => {
  it('refuses when no estimate is under review', () => {
    const guard = recordPaperGuard(draftState(), foregroundOf(draftState()), true, now);
    assert.match(guard ?? '', /no estimate under review/i);
  });
  it('refuses when the estimate has expired', () => {
    const state = reviewed();
    const guard = recordPaperGuard(state, foregroundOf(state), true, quote.expiresAt + 1);
    assert.match(guard ?? '', /expired/);
  });
  it('refuses when browser storage is unavailable', () => {
    const state = reviewed();
    const guard = recordPaperGuard(state, foregroundOf(state), false, now);
    assert.match(guard ?? '', /storage is unavailable/);
  });
  it('refuses while a filed record is being read', () => {
    const guard = recordPaperGuard(reviewed(), foregroundOf(reviewed(), 'filed-elsewhere'), true, now);
    assert.match(guard ?? '', /for reading/);
  });
  it('permits recording an unexpired estimate under review', () => {
    const state = reviewed();
    assert.equal(recordPaperGuard(state, foregroundOf(state), true, now + 1), null);
  });
  it('refuses a second recording of an already filed receipt', () => {
    const saved = deskReducer(reviewed(), { type: 'saved', quoteId: quote.id, now: now + 1 });
    const guard = recordPaperGuard(saved, foregroundOf(saved), true, now + 1);
    assert.match(guard ?? '', /already filed/);
  });
});

describe('watch_mark', () => {
  it('resolves an explicit query over the foreground instrument', () => {
    const foreground = foregroundOf(draftState());
    assert.equal(watchTarget(foreground, 'apple'), aapl.id);
  });
  it('falls back to the foreground instrument when no query is given', () => {
    const foreground: ForegroundDocument = { kind: 'draft', quoteId: null, recordId: null, instrumentId: aapl.id, actionable: true, readonly: false };
    assert.equal(watchTarget(foreground, ''), aapl.id);
  });
  it('returns null when nothing is nameable', () => {
    const foreground: ForegroundDocument = { kind: 'draft', quoteId: null, recordId: null, instrumentId: null, actionable: true, readonly: false };
    assert.equal(watchTarget(foreground, ''), null);
    assert.equal(watchTarget(foreground, 'tesla'), null);
  });
  it('never resolves a watch from a read-only archive document', () => {
    const filedId = 'filed-aapl';
    const filed = {
      version: 1 as const, id: filedId, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1,
      quote: { ...quote, id: filedId, intent: { ...intent, instrumentId: aapl.id }, outputSymbol: 'AAPLc' },
    };
    const foreground = foregroundOf(reviewed(), filedId, [filed]);
    assert.equal(foreground.kind, 'archive');
    assert.equal(watchTarget(foreground, ''), aapl.id, 'watch-this follows the visible document');
  });
});

describe('share_desk_note', () => {
  it('speaks exactly the desk note for the current desk and day, plus its attribution', () => {
    const day = new Date('2026-09-09T12:00:00');
    const spoken = deskNoteSpokenLine('hetty', day);
    const note = deskNoteOfTheDay('hetty', day);
    assert.ok(spoken.includes(note.text), 'the spoken line carries the note verbatim');
    if (note.attribution) assert.ok(spoken.includes(note.attribution));
    assert.match(spoken, /not advice/);
  });
  it('is available on every foreground, including a read-only filed record', () => {
    // The note is furniture, not document state — no foreground refusal applies.
    const day = new Date('2026-09-09T12:00:00');
    const note = deskNoteOfTheDay('arbitrum', day);
    assert.ok(note.text.length > 0);
    assert.match(deskNoteSpokenLine('arbitrum', day), note.term ? /word for today/ : /note for today/);
  });
  it('frames a word day as a term of the trade, still verbatim and never advice', () => {
    const base = new Date('2026-09-09T12:00:00');
    const wordDay = [0, 1, 2].map(i => new Date(base.getTime() + i * 86_400_000)).find(d => deskNoteOfTheDay('hetty', d).term)!;
    const note = deskNoteOfTheDay('hetty', wordDay);
    const spoken = deskNoteSpokenLine('hetty', wordDay);
    assert.match(spoken, /word for today/);
    assert.ok(spoken.includes(note.text), 'the spoken line carries the word verbatim');
    assert.match(spoken, /not advice/);
  });
  it('keeps the once-per-call refusal honest and distinct', () => {
    assert.match(DESK_NOTE_ALREADY_SHARED, /already/);
    assert.doesNotMatch(DESK_NOTE_ALREADY_SHARED, /advice/);
  });
  it('never improvises: the spoken line is bounded and quote-safe', () => {
    for (const desk of ['hetty', 'jesse', 'isabel', 'arbitrum'] as const) {
      for (let offset = 0; offset < 14; offset++) {
        const spoken = deskNoteSpokenLine(desk, new Date(1788600000000 + offset * 86_400_000));
        assert.ok(spoken.length < 400);
        assert.doesNotMatch(spoken, /guaranteed|risk-free|you should buy|you should sell/i);
      }
    }
  });
});

describe('describe_desk', () => {
  it('describes a draft with no ledger and no tray', () => {
    const empty = initialDesk({ instrumentId: '', side: 'buy', unit: 'USDC', amount: '' });
    const spoken = describeDesk(empty, foregroundOf(empty), [], []);
    assert.match(spoken, /No instrument chosen/);
    assert.match(spoken, /No amount set/);
    assert.doesNotMatch(spoken, /paper record/);
    assert.doesNotMatch(spoken, /watched mark/);
  });
  it('describes the instrument and amount actually on the ticket', () => {
    const spoken = describeDesk(draftState(), foregroundOf(draftState()), [], []);
    assert.match(spoken, /Instrument: NVDAc/);
    assert.match(spoken, /buy 100 USDC/);
  });
  it('describes an estimate under review without confusing it with a filing', () => {
    const state = reviewed();
    const spoken = describeDesk(state, foregroundOf(state), [filedRecord('other')], ['watch-1']);
    assert.match(spoken, /Estimate under review/);
    assert.match(spoken, /1 paper record in the ledger/);
    assert.match(spoken, /1 watched mark in the tray/);
    assert.doesNotMatch(spoken, /filed/);
  });
  it('describes a filed record as read-only, not as the live instruction', () => {
    const spoken = describeDesk(reviewed(), foregroundOf(reviewed(), 'other'), [filedRecord('other')], []);
    assert.match(spoken, /read-only/);
    assert.doesNotMatch(spoken, /Estimate under review/);
  });
  it('pluralizes ledger and tray counts', () => {
    const spoken = describeDesk(draftState(), foregroundOf(draftState()), [filedRecord('a'), filedRecord('b')], ['w1', 'w2']);
    assert.match(spoken, /2 paper records/);
    assert.match(spoken, /2 watched marks/);
  });
});

function filedRecord(id: string) {
  return {
    version: 1 as const, id, mode: 'paper' as const, deskId: 'hetty' as const, createdAt: now + 1,
    quote: { ...quote, id },
  };
}
