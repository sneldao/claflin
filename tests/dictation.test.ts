import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictatedTradeIntent } from '../lib/trading/dictation-parser';
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

  it('parses multi-leg instructions ("splits & swaps")', () => {
    const res = parseDictatedTradeIntent('Sell 5 tokens of Apple and buy 500 USDC of Tesla');
    assert.ok(res.multiLegs);
    assert.equal(res.multiLegs.length, 2);
    assert.equal(res.multiLegs[0].intent.side, 'sell');
    assert.equal(res.multiLegs[0].intent.amount, '5');
    assert.equal(res.multiLegs[1].intent.side, 'buy');
    assert.equal(res.multiLegs[1].intent.amount, '500');
  });

  it('parses price triggers and watch requests', () => {
    const res = parseDictatedTradeIntent('Buy 100 USDC of NVDA if price reaches $160');
    assert.equal(res.intent.side, 'buy');
    assert.equal(res.intent.amount, '100');
    assert.equal(res.triggerPrice, '160');

    const watchRes = parseDictatedTradeIntent('Watch TSLA at $210');
    assert.equal(watchRes.isWatch, true);
    assert.equal(watchRes.triggerPrice, '210');
    assert.ok(watchRes.matchedInstrument?.symbol.includes('TSLA'));
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
