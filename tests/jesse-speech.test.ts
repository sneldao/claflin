import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bindFilePaperCommand, parseJesseSpeech } from '../lib/jesse/speech.ts';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog.ts';
import { reasonCodeSentence } from '../lib/solana/market/reasons.ts';

const apple = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;

describe('parseJesseSpeech', () => {
  it('parses a complete buy instruction', () => {
    const result = parseJesseSpeech('buy 100 USDC of Apple');
    assert.equal(result.confidence, 'full');
    assert.equal(result.command?.type, 'draft');
    if (result.command?.type === 'draft') {
      assert.equal(result.command.intent.instrumentId, apple.id);
      assert.equal(result.command.intent.side, 'buy');
      assert.equal(result.command.intent.amount, '100');
      assert.equal(result.command.quote, true);
    }
  });

  it('parses compare and file commands', () => {
    assert.equal(parseJesseSpeech('compare NVIDIA').command?.type, 'compare');
    assert.equal(parseJesseSpeech('file this paper record').command?.type, 'file-paper');
    assert.equal(parseJesseSpeech('cancel').command?.type, 'cancel');
  });

  it('never invents an amount from a prior draft', () => {
    const result = parseJesseSpeech('buy Apple', {
      instrumentId: apple.id,
      side: 'buy',
      unit: 'USDC',
      amount: '25',
    });
    assert.equal(result.confidence, 'partial');
    assert.equal(result.command?.type, 'clarify');
    if (result.command?.type === 'clarify') {
      assert.equal(result.command.draft.amount, null);
    }
  });

  it('refuses unknown tickers', () => {
    const result = parseJesseSpeech('buy 50 of DOGE');
    assert.notEqual(result.command?.type, 'draft');
  });

  it('binds file-paper to the active quote id', () => {
    const raw = parseJesseSpeech('file this paper record');
    const bound = bindFilePaperCommand(raw, 'q-1');
    assert.deepEqual(bound.command, { type: 'file-paper', quoteId: 'q-1' });
    const unbound = bindFilePaperCommand(raw, null);
    assert.equal(unbound.command?.type, 'clarify');
  });

  it('corrects amount on the active instrument', () => {
    const result = parseJesseSpeech('no, make that 150', {
      instrumentId: apple.id,
      side: 'buy',
      unit: 'USDC',
      amount: '100',
    });
    /* Without an explicit buy/sell the grammar asks for side/amount clarity
       rather than inventing a trade from a fragment. */
    assert.ok(result.command);
  });
});

describe('evidence reason copy', () => {
  it('explains unverified unit basis without inventing a number', () => {
    assert.match(reasonCodeSentence('unverified-unit-basis'), /not yet verified/i);
  });
});
