import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictatedTradeIntent } from '../lib/trading/dictation-parser';
import { instructionCorrection, instructionIssue } from '../lib/trading/instruction-safety';
import { createDictationProvenance } from '../lib/trading/dictation-provenance';
import { dictationSpokenReadback, dictationTicketLine } from '../lib/trading/voice-tools';
import { friendlyDictationError } from '../lib/dictation/useDictation';
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

  it('parses multilingual instructions in Spanish, French, German, Japanese, and Chinese', () => {
    // Spanish
    const es = parseDictatedTradeIntent('comprar cien dólares de nvidia');
    assert.equal(es.intent.side, 'buy');
    assert.equal(es.intent.amount, '100');
    assert.ok(es.matchedInstrument?.symbol.includes('NVDA'));
    assert.equal(es.detectedLanguage, 'es');

    // French
    const fr = parseDictatedTradeIntent('acheter cinquante euros de apple');
    assert.equal(fr.intent.side, 'buy');
    assert.equal(fr.intent.amount, '50');
    assert.ok(fr.matchedInstrument?.symbol.includes('AAPL'));
    assert.equal(fr.detectedLanguage, 'fr');

    // German
    const de = parseDictatedTradeIntent('verkaufen zwanzig aktien von tesla');
    assert.equal(de.intent.side, 'sell');
    assert.equal(de.intent.amount, '20');
    assert.ok(de.matchedInstrument?.symbol.includes('TSLA'));
    assert.equal(de.detectedLanguage, 'de');

    // Japanese
    const ja = parseDictatedTradeIntent('テスラを10株購入');
    assert.equal(ja.intent.side, 'buy');
    assert.equal(ja.intent.amount, '10');
    assert.ok(ja.matchedInstrument?.symbol.includes('TSLA'));
    assert.equal(ja.detectedLanguage, 'ja');

    // Chinese
    const zh = parseDictatedTradeIntent('买入100美元英伟达');
    assert.equal(zh.intent.side, 'buy');
    assert.equal(zh.intent.amount, '100');
    assert.ok(zh.matchedInstrument?.symbol.includes('NVDA'));
    assert.equal(zh.detectedLanguage, 'zh');
  });

  it('refuses multi-leg instructions instead of executing the first leg', () => {
    const res = parseDictatedTradeIntent('Sell 5 tokens of Apple and buy 500 USDC of Tesla');
    assert.ok(res.multiLegs);
    assert.equal(res.multiLegs.length, 2);
    assert.ok(res.issue);
    assert.equal(res.confidence, 'none');
    assert.deepEqual(res.intent, {});
  });

  it('refuses conditional orders while still recording the trigger diagnostically', () => {
    const res = parseDictatedTradeIntent('Buy 100 USDC of NVDA if price reaches $160');
    assert.ok(res.issue);
    assert.equal(res.confidence, 'none');
    assert.deepEqual(res.intent, {});
    assert.equal(res.triggerPrice, '160');

    const watchRes = parseDictatedTradeIntent('Watch TSLA at $210');
    assert.equal(watchRes.isWatch, true);
    assert.equal(watchRes.triggerPrice, '210');
    assert.ok(watchRes.matchedInstrument?.symbol.includes('TSLA'));
  });

  it('records the literal words that set each field as spans', () => {
    const res = parseDictatedTradeIntent('buy $25 of Apple');
    assert.equal(res.spans?.side, 'buy');
    assert.equal(res.spans?.amount, '$25');
    assert.equal(res.spans?.instrument, 'Apple');

    const words = parseDictatedTradeIntent('buy twenty five dollars of apple');
    assert.equal(words.spans?.amount, 'twenty five dollars');
    assert.equal(words.spans?.side, 'buy');

    const sell = parseDictatedTradeIntent('sell 5 tokens of google');
    assert.equal(sell.spans?.side, 'sell');
    assert.equal(sell.spans?.amount, '5 tokens');
    assert.equal(sell.spans?.instrument, 'google');
  });

  it('generates deterministic cryptographic provenance seals', () => {
    const prov1 = createDictationProvenance('Buy 100 USDC of NVDA', 'NVDAc', 'buy', '100', 1726000000000);
    const prov2 = createDictationProvenance('Buy 100 USDC of NVDA', 'NVDAc', 'buy', '100', 1726000000000);
    const prov3 = createDictationProvenance('Buy 200 USDC of NVDA', 'NVDAc', 'buy', '200', 1726000000000);

    assert.equal(prov1.hash, prov2.hash);
    assert.notEqual(prov1.hash, prov3.hash);
    assert.ok(prov1.hash.startsWith('0x'));
    assert.ok(prov1.shortSeal.includes('…'));
    assert.equal(prov1.disfluencyFiltered, true);
  });

  it('generates in-character spoken readback lines for Hetty', () => {
    const line = dictationSpokenReadback('buy', '100', 'USDC', 'NVDAc');
    assert.match(line, /Dictation inscribed/);
    assert.match(line, /NVDAc/);
    assert.match(line, /100 USDC/);
  });

  it('writes honest ticket lines that never invent a missing amount', () => {
    assert.equal(
      dictationTicketLine('buy', '25', 'USDC', 'GOOGLc'),
      'Buy 25 USDC of GOOGLc — on the ticket, ready for your review.',
    );
    assert.equal(
      dictationTicketLine('buy', '', 'USDC', 'GOOGLc'),
      'Buy GOOGLc heard — add the amount on the ticket.',
    );
    assert.doesNotMatch(dictationTicketLine('buy', '', 'USDC', 'GOOGLc'), /\d/);
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

describe('dictation corrections and instruction safety', () => {
  const apple = DESK_INSTRUMENTS.find(s => s.symbol === 'AAPLc')!;
  const buyDraft = { instrumentId: apple.id, side: 'buy' as const, unit: 'USDC' as const, amount: '100' };

  it('applies a buy amount correction to the active draft', () => {
    const res = parseDictatedTradeIntent('make that 50', buyDraft);
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '50');
    assert.equal(res.intent.unit, 'USDC');
    assert.equal(res.intent.instrumentId, apple.id);
    assert.equal(res.spans?.amount, '50');
    assert.equal(res.issue, undefined);
  });

  it('applies a sell amount correction without flipping side', () => {
    const res = parseDictatedTradeIntent('actually 2', { ...buyDraft, side: 'sell', unit: 'token', amount: '5' });
    assert.equal(res.intent.side, 'sell');
    assert.equal(res.intent.amount, '2');
    assert.equal(res.intent.unit, 'token');
  });

  it('uses the replacement amount in a negation correction', () => {
    const res = parseDictatedTradeIntent('not 100 — make that 50', buyDraft);
    assert.equal(res.intent.amount, '50');
    assert.equal(res.spans?.amount, '50');
    assert.equal(res.issue, undefined);
  });

  it('asks for a side instead of defaulting a bare correction to buy', () => {
    const res = parseDictatedTradeIntent('make that 50', { instrumentId: apple.id, amount: '100' });
    assert.equal(res.intent.side, undefined);
    assert.equal(res.intent.amount, '50');
    assert.equal(res.confidence, 'partial');
    assert.equal(res.issue, undefined);
  });

  it('keeps a missing amount missing on a fresh instruction', () => {
    const res = parseDictatedTradeIntent('buy Apple', buyDraft);
    assert.equal(res.intent.amount, undefined);
  });

  it('clears the amount on a bare side flip and keeps a new explicit amount', () => {
    const bare = parseDictatedTradeIntent('actually sell', buyDraft);
    assert.equal(bare.intent.side, 'sell');
    assert.equal(bare.intent.amount, undefined);
    const withAmount = parseDictatedTradeIntent('actually sell 2 tokens', buyDraft);
    assert.equal(withAmount.intent.side, 'sell');
    assert.equal(withAmount.intent.amount, '2');
    assert.equal(withAmount.intent.unit, 'token');
  });

  it('never reuses the active instrument for an unknown ticker', () => {
    const res = parseDictatedTradeIntent('buy 100 DOGE', buyDraft);
    assert.equal(res.matchedInstrument, undefined);
    assert.equal(res.intent.instrumentId, undefined);
    assert.match(res.explanation, /outside this desk's coverage/i);
  });

  it('never reuses the active instrument for an unknown correction instrument', () => {
    for (const text of ['make that 50 of DOGE', 'actually 50 of DOGE', 'make that 50 DOGE']) {
      const res = parseDictatedTradeIntent(text, buyDraft);
      assert.equal(res.intent.instrumentId, undefined, text);
      assert.match(res.explanation, /outside this desk's coverage/i, text);
    }
  });

  it('resolves a named correction instrument through the alias book', () => {
    const res = parseDictatedTradeIntent('make that 50 of Google', buyDraft);
    assert.ok(res.matchedInstrument?.symbol.includes('GOOGL'));
    assert.equal(res.intent.instrumentId, res.matchedInstrument?.id);
    const meta = parseDictatedTradeIntent('make that 50 of Facebook', buyDraft);
    assert.ok(meta.matchedInstrument?.symbol.includes('META'));
  });

  it('refuses unit conflicts instead of rescaling a correction', () => {
    const sellDraft = { instrumentId: apple.id, side: 'sell' as const, unit: 'token' as const, amount: '5' };
    const sellRes = parseDictatedTradeIntent('make that 50 USDC', sellDraft);
    assert.match(sellRes.issue ?? '', /different instructions — say which you meant/i);
    assert.equal(sellRes.confidence, 'none');
    assert.deepEqual(sellRes.intent, {});
    const buyRes = parseDictatedTradeIntent('make that 2 tokens', buyDraft);
    assert.match(buyRes.issue ?? '', /different instructions — say which you meant/i);
    assert.equal(buyRes.confidence, 'none');
    assert.deepEqual(buyRes.intent, {});
  });

  it('accepts a correction that names a known instrument with a space after the amount', () => {
    assert.equal(instructionIssue('make that 50 of Tesla'), null);
    const correction = instructionCorrection('make that 50 of Tesla')!;
    assert.equal(correction.replacement, '50');
    assert.equal('make that 50 of Tesla'.slice(correction.replacementIndex, correction.replacementIndex + 2), '50');
    const res = parseDictatedTradeIntent('make that 50 of Tesla', buyDraft);
    assert.equal(res.intent.amount, '50');
    assert.ok(res.matchedInstrument?.symbol.includes('TSLA'));
  });

  it('refuses correction amounts it cannot read plainly', () => {
    for (const text of ['make that 2k', 'make that .5', 'make that 1,000']) {
      const res = parseDictatedTradeIntent(text, buyDraft);
      assert.ok(res.issue, text);
      assert.equal(res.confidence, 'none', text);
      assert.deepEqual(res.intent, {}, text);
    }
  });

  it('does not accept short or long as supported sides', () => {
    assert.ok(parseDictatedTradeIntent('short 5 Apple').issue);
    assert.ok(parseDictatedTradeIntent('long 100 Apple').issue);
  });

  it('refuses corrections wrapped in conditions, extra amounts, or extra products', () => {
    for (const text of [
      'make that 50 if price hits 160',
      'make that 50 or 75',
      'buy 100 Apple actually 50 or 75',
      'buy Apple and Tesla',
      'buy 100 Apple and DOGE',
      'buy Apple when it dips',
      'buy Apple at $160',
      'Sell 5 tokens of Apple and buy 500 USDC of Tesla',
    ]) {
      const res = parseDictatedTradeIntent(text, buyDraft);
      assert.ok(res.issue, text);
      assert.equal(res.confidence, 'none', text);
      assert.deepEqual(res.intent, {}, text);
    }
  });

  it('refuses multilingual multileg and conditional instructions the same way', () => {
    for (const text of ['comprar 100 dólares de apple y vender tesla', 'acheter 50 euros de apple et vendre tesla']) {
      const res = parseDictatedTradeIntent(text);
      assert.ok(res.issue, text);
      assert.equal(res.confidence, 'none', text);
      assert.deepEqual(res.intent, {}, text);
    }
  });

  it('keeps a harmless spelled-out amount accepted', () => {
    const res = parseDictatedTradeIntent('buy one hundred and twenty dollars of apple');
    assert.equal(res.issue, undefined);
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '120');
  });

  it('refuses several amounts without a supported correction', () => {
    const res = parseDictatedTradeIntent('buy 100 or 200 of Apple', buyDraft);
    assert.ok(res.issue);
    assert.equal(res.confidence, 'none');
    assert.deepEqual(res.intent, {});
  });

  it('refuses negative and zero corrections', () => {
    for (const text of ['make that -5', 'change it to 0']) {
      const res = parseDictatedTradeIntent(text, buyDraft);
      assert.ok(res.issue, text);
      assert.deepEqual(res.intent, {}, text);
    }
  });

  it('does not read a dash inside not500-50 as a negative amount', () => {
    const res = parseDictatedTradeIntent('buy not500-50 Apple', buyDraft);
    assert.doesNotMatch(res.issue ?? '', /positive/i);
  });

  it('refuses a negation pair whose replacement is negative', () => {
    const res = parseDictatedTradeIntent('not 500 - -5', buyDraft);
    assert.ok(res.issue);
    assert.deepEqual(res.intent, {});
  });

  it('refuses a fresh zero amount before any quote', () => {
    const res = parseDictatedTradeIntent('buy 0 of Apple');
    assert.ok(res.issue);
    assert.deepEqual(res.intent, {});
  });

  it('refuses alternative verb synonyms for the same unsafe shapes', () => {
    for (const text of ['grab 100 Apple and Tesla', 'dump 5 tokens of Apple and buy 500 USDC of Tesla']) {
      const res = parseDictatedTradeIntent(text, buyDraft);
      assert.ok(res.issue, text);
      assert.deepEqual(res.intent, {}, text);
    }
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

  it('returns 503 without an API key so manual typing stays available', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.ASSEMBLYAI_API_KEY;
    delete process.env.ASSEMBLYAI_API_KEY;
    let called = 0;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const dummyAudio = new Uint8Array([0, 1, 2, 3, 4]);
      const req = new NextRequest('http://localhost:3000/api/dictation', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: dummyAudio,
      });
      const res = await POST(req);
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.error, 'dictation_unavailable');
      assert.ok(/type your instruction/i.test(data.message));
      assert.equal(called, 0);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
      else process.env.ASSEMBLYAI_API_KEY = originalKey;
    }
  });

  it('forwards audio to AssemblyAI as a multipart `audio` file part', async () => {
    const seen: Array<{ url: string; contentType: string | null; isForm: boolean; fileName: string | null }> = [];
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.ASSEMBLYAI_API_KEY;
    process.env.ASSEMBLYAI_API_KEY = 'test-key';
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: { headers?: Record<string, string>; body?: unknown }) => {
      const body = init?.body as FormData | undefined;
      const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
      const file = isForm ? body.get('audio') as File | null : null;
      seen.push({
        url: String(input),
        contentType: init?.headers?.['Content-Type'] ?? init?.headers?.['content-type'] ?? null,
        isForm,
        fileName: file && typeof file !== 'string' ? file.name : null,
      });
      return new Response(JSON.stringify({ text: 'Buy 100 USDC of NVDA' }), { status: 200 });
    }) as typeof fetch;
    try {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }), 'recording.webm');
      const req = new NextRequest('http://localhost:3000/api/dictation', { method: 'POST', body: form });
      const res = await POST(req);
      assert.equal(res.status, 200);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].isForm, true);
      assert.equal(seen[0].contentType, null);
      assert.ok(seen[0].fileName);
      const data = await res.json();
      assert.equal(data.transcript, 'Buy 100 USDC of NVDA');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
      else process.env.ASSEMBLYAI_API_KEY = originalKey;
    }
  });

  it('returns 422 no_speech when AssemblyAI hears no words', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.ASSEMBLYAI_API_KEY;
    process.env.ASSEMBLYAI_API_KEY = 'test-key';
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
      new Response(JSON.stringify({ text: '   ', llm_response: null }), { status: 200 })) as typeof fetch;
    try {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }), 'recording.webm');
      const req = new NextRequest('http://localhost:3000/api/dictation', { method: 'POST', body: form });
      const res = await POST(req);
      assert.equal(res.status, 422);
      const data = await res.json();
      assert.equal(data.error, 'no_speech');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
      else process.env.ASSEMBLYAI_API_KEY = originalKey;
    }
  });

  it('prefers the llm_response rewrite over the verbatim text', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.ASSEMBLYAI_API_KEY;
    process.env.ASSEMBLYAI_API_KEY = 'test-key';
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
      new Response(JSON.stringify({ text: 'Um buy uh 100 of Nvidia', llm_response: 'Buy 100 USDC of NVDA', llm_error: null }), { status: 200 })) as typeof fetch;
    try {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }), 'recording.webm');
      const req = new NextRequest('http://localhost:3000/api/dictation', { method: 'POST', body: form });
      const res = await POST(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.transcript, 'Buy 100 USDC of NVDA');
      assert.equal(data.cleanedUp, true);
      assert.equal(data.verbatimTranscript, 'Um buy uh 100 of Nvidia');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
      else process.env.ASSEMBLYAI_API_KEY = originalKey;
    }
  });

  it('maps invalid keys (404) to 503 credits_exhausted, not a raw 404', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.ASSEMBLYAI_API_KEY;
    process.env.ASSEMBLYAI_API_KEY = 'test-key';
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
      new Response(JSON.stringify({ status: 404, title: 'Not Found', detail: 'Invalid API key' }), { status: 404 })) as typeof fetch;
    try {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }), 'recording.webm');
      const req = new NextRequest('http://localhost:3000/api/dictation', { method: 'POST', body: form });
      const res = await POST(req);
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.error, 'credits_exhausted');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
      else process.env.ASSEMBLYAI_API_KEY = originalKey;
    }
  });
});

describe('Dictation UX copy (friendlyDictationError)', () => {
  it('never leaks status codes and always offers a way forward', () => {
    for (const [status, code] of [[502, 'dictation_failed'], [503, 'credits_exhausted'], [429, 'rate_limited'], [422, 'no_speech'], [400, 'bad_request']] as Array<[number, string]>) {
      const copy = friendlyDictationError(status, code, 'raw server words');
      assert.ok(!/\b50[023]\b|\b42[29]\b|\b40[04]\b/.test(copy), `must not leak status: ${copy}`);
      assert.ok(/type|try again|wait/i.test(copy), `must offer a way forward: ${copy}`);
    }
  });
});
