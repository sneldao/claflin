import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictatedTradeIntent } from '../lib/trading/dictation-parser';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/dictation/route';

describe('AssemblyAI Dictation Intent Parser', () => {
  it('parses a clean buy instruction with token symbol and amount', () => {
    const res = parseDictatedTradeIntent('Buy 100 USDC of NVDA');
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '100');
    assert.equal(res.intent.unit, 'USDC');
    assert.ok(res.matchedInstrument?.symbol.includes('NVDA'));
    assert.equal(res.confidence, 'full');
  });

  it('parses a sell instruction with company name alias', () => {
    const res = parseDictatedTradeIntent('Sell 5 tokens of Apple');
    assert.equal(res.intent.side, 'sell');
    assert.equal(res.intent.amount, '5');
    assert.equal(res.intent.unit, 'token');
    assert.ok(res.matchedInstrument?.symbol.includes('AAPL'));
    assert.equal(res.confidence, 'full');
  });

  it('parses a dollar amount formatted with k notation', () => {
    const res = parseDictatedTradeIntent('Buy 2k of Tesla');
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '2000');
    assert.ok(res.matchedInstrument?.symbol.includes('TSLA'));
    assert.equal(res.confidence, 'full');
  });

  it('parses spelled-out numbers and casual trading verbs', () => {
    const res = parseDictatedTradeIntent('grab twenty five dollars of nvidia');
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '25');
    assert.ok(res.matchedInstrument?.symbol.includes('NVDA'));
    assert.equal(res.confidence, 'full');

    const res2 = parseDictatedTradeIntent('unload ten tokens of coin');
    assert.equal(res2.intent.side, 'sell');
    assert.equal(res2.intent.amount, '10');
    assert.ok(res2.matchedInstrument?.symbol.includes('COIN'));
    assert.equal(res2.confidence, 'full');

    const res3 = parseDictatedTradeIntent('buy half a grand of apple');
    assert.equal(res3.intent.side, 'buy');
    assert.equal(res3.intent.amount, '500');
    assert.ok(res3.matchedInstrument?.symbol.includes('AAPL'));
    assert.equal(res3.confidence, 'full');
  });

  it('handles partial instructions gracefully', () => {
    const res = parseDictatedTradeIntent('Just looking at Google');
    assert.ok(res.matchedInstrument?.symbol.includes('GOOGL'));
    assert.equal(res.confidence, 'partial');
  });

  it('handles empty or unrecognized input', () => {
    const res = parseDictatedTradeIntent('');
    assert.equal(res.confidence, 'none');
  });
});

describe('AssemblyAI Dictation API Route (/api/dictation)', () => {
  it('rejects requests with empty payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/dictation', {
      method: 'POST',
      body: new Uint8Array(0),
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'bad_request');
  });

  it('returns simulated dictation in dev mode without API key', async () => {
    const dummyAudio = new Uint8Array([0, 1, 2, 3, 4]);
    const req = new NextRequest('http://localhost:3000/api/dictation', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: dummyAudio,
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.transcript);
    assert.equal(data.disfluencyFiltered, true);
    assert.ok(data.parsedIntent);
  });
});
