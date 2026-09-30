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

  it('parses Solana-native hearables: AAPLx quote, size correction, and unknown ticker refusal', () => {
    const quote = parseJesseSpeech('buy 100 USDC of AAPLx');
    assert.equal(quote.command?.type, 'draft');
    const correct = parseJesseSpeech('make that 50 USDC of AAPLx', {
      instrumentId: apple.id,
      side: 'buy',
      unit: 'USDC',
      amount: '100',
    });
    assert.equal(correct.command?.type, 'draft');
    if (correct.command?.type === 'draft') {
      assert.equal(correct.command.intent.amount, '50');
      assert.equal(correct.command.intent.side, 'buy');
    }
    const withoutSide = parseJesseSpeech('make that 50', {
      instrumentId: apple.id,
      side: null,
      unit: null,
      amount: '100',
    });
    assert.equal(withoutSide.command?.type, 'clarify');
    if (withoutSide.command?.type === 'clarify') {
      assert.equal(withoutSide.command.field, 'side');
      assert.equal(withoutSide.command.draft.side, null);
    }
    const refuse = parseJesseSpeech('buy DOGE on Solana');
    assert.equal(refuse.command?.type, 'clarify');
    if (refuse.command?.type === 'clarify') {
      assert.equal(refuse.command.field, 'instrument');
      assert.equal(refuse.command.draft.instrumentId, null);
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

describe('parseJesseSpeech safety and corrections', () => {
  const buyDraft = { instrumentId: apple.id, side: 'buy' as const, unit: 'USDC' as const, amount: '100' };
  const sellDraft = { instrumentId: apple.id, side: 'sell' as const, unit: 'scaled-token' as const, amount: '5' };

  it('applies buy and sell amount corrections to the active draft', () => {
    const buy = parseJesseSpeech('make that 50', buyDraft);
    assert.equal(buy.command?.type, 'draft');
    if (buy.command?.type === 'draft') {
      assert.equal(buy.command.intent.side, 'buy');
      assert.equal(buy.command.intent.unit, 'USDC');
      assert.equal(buy.command.intent.amount, '50');
    }
    assert.equal(buy.spans?.amount, '50');

    const sell = parseJesseSpeech('actually 2 tokens', sellDraft);
    assert.equal(sell.command?.type, 'draft');
    if (sell.command?.type === 'draft') {
      assert.equal(sell.command.intent.side, 'sell');
      assert.equal(sell.command.intent.unit, 'scaled-token');
      assert.equal(sell.command.intent.amount, '2');
    }
  });

  it('uses the replacement of a negation correction and marks its literal span', () => {
    const res = parseJesseSpeech('not 100 — make that 50', buyDraft);
    assert.equal(res.command?.type, 'draft');
    if (res.command?.type === 'draft') assert.equal(res.command.intent.amount, '50');
    assert.equal(res.spans?.amount, '50');
  });

  it('asks buy or sell when a correction arrives with no side', () => {
    const res = parseJesseSpeech('make that 50', { instrumentId: apple.id, side: null, unit: null, amount: '100' });
    assert.equal(res.command?.type, 'clarify');
    if (res.command?.type === 'clarify') assert.equal(res.command.field, 'side');
  });

  it('clears the old amount on a bare side flip', () => {
    const res = parseJesseSpeech('actually sell', buyDraft);
    assert.equal(res.command?.type, 'clarify');
    if (res.command?.type === 'clarify') {
      assert.equal(res.command.draft.side, 'sell');
      assert.equal(res.command.draft.amount, null);
    }
  });

  it('never reuses the active instrument for an unknown correction instrument', () => {
    for (const text of ['make that 50 of DOGE', 'actually 50 on DOGE', 'make that 50 DOGE']) {
      const res = parseJesseSpeech(text, buyDraft);
      assert.notEqual(res.command?.type, 'draft', text);
      if (res.command?.type === 'clarify') {
        assert.equal(res.command.field, 'instrument', text);
        assert.equal(res.command.draft.instrumentId, null, text);
      }
    }
  });

  it('refuses unit conflicts instead of rescaling a correction', () => {
    const sellRes = parseJesseSpeech('make that 50 USDC', sellDraft);
    assert.equal(sellRes.command, null);
    assert.match(sellRes.issue ?? '', /different instructions — say which you meant/i);
    const buyRes = parseJesseSpeech('make that 2 tokens', buyDraft);
    assert.equal(buyRes.command, null);
    assert.match(buyRes.issue ?? '', /different instructions — say which you meant/i);
  });

  it('refuses correction amounts it cannot read plainly', () => {
    for (const text of ['make that 2k', 'make that .5', 'make that 1,000']) {
      const res = parseJesseSpeech(text, buyDraft);
      assert.ok(res.issue, text);
      assert.equal(res.command, null, text);
    }
  });

  it('refuses conditions, multileg, negatives, and extra amounts — even inside corrections', () => {
    for (const text of [
      'buy Apple when it dips',
      'buy Apple at $160',
      'buy AAPLx and TSLAx',
      'make that 50 if price hits 160',
      'make that 50 or 75',
      'buy 100 AAPLx actually 50 or 75',
      'make that -5',
      'not 500 - -5',
      'buy 0 of Apple',
      'short 5 Apple',
    ]) {
      const res = parseJesseSpeech(text, buyDraft);
      assert.ok(res.issue, text);
      assert.equal(res.confidence, 'none', text);
      assert.equal(res.command, null, text);
    }
  });

  it('resolves a named correction instrument through the alias book', () => {
    const res = parseJesseSpeech('make that 50 of Tesla', buyDraft);
    assert.equal(res.command?.type, 'draft');
    if (res.command?.type === 'draft') {
      assert.equal(res.command.intent.instrumentId, SOLANA_INSTRUMENTS.find(i => i.symbol === 'TSLAx')!.id);
    }
  });
});

describe('evidence reason copy', () => {
  it('explains unverified unit basis without inventing a number', () => {
    assert.match(reasonCodeSentence('unverified-unit-basis'), /not yet verified/i);
  });
});
