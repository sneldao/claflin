import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WrittenSlip } from '../components/desk/WrittenSlip';
import { HETTY_VOCAB, JESSE_VOCAB, filedLine, slipOneLine, slipValidity } from '../lib/desk/written-slip';
import { SLIP_ACTIONS } from '../lib/desk/ui-copy';
import {
  AAPLX_FIXTURE,
  JESSE_BUY_INTENT,
  SOLANA_PAPER_ESTIMATE_FIXTURE,
} from '../lib/solana/fixtures';
import type { JessePaperRecord } from '../lib/solana/paper';
import type { JesseDraft, SolanaPaperEstimate } from '../lib/solana/contracts';

const buyQuote: SolanaPaperEstimate = {
  ...SOLANA_PAPER_ESTIMATE_FIXTURE,
  intent: JESSE_BUY_INTENT,
  inputSymbol: 'USDC',
  outputSymbol: 'AAPLx',
  inputAmount: '100',
  outputAmount: '0.4312',
};

const buyDraft: JesseDraft = {
  instrumentId: JESSE_BUY_INTENT.instrumentId,
  side: 'buy',
  unit: 'USDC',
  amount: '100',
};

const sellDraft: JesseDraft = {
  instrumentId: JESSE_BUY_INTENT.instrumentId,
  side: 'sell',
  unit: 'scaled-token',
  amount: '5.5',
};

const record: JessePaperRecord = {
  version: 2,
  id: buyQuote.id,
  mode: 'paper',
  deskId: 'jesse',
  owner: 'test',
  createdAt: buyQuote.quotedAt + 5_000,
  quote: buyQuote,
  instrumentSnapshot: AAPLX_FIXTURE,
  comparison: null,
};

const jesse = {
  vocab: JESSE_VOCAB,
  instruments: [AAPLX_FIXTURE],
};

describe('written slip — review', () => {
  it('writes the quotation as a sentence with terms and validity, not a swap form', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'review',
      draft: buyDraft,
      ...jesse,
      quote: buyQuote,
      instrument: AAPLX_FIXTURE,
      now: buyQuote.quotedAt + 10_000,
      terms: 'Multiplier 1.1 · Backed · Token-2022 · Jupiter Metis · Solana · paper estimate',
      actions: createElement('button', null, SLIP_ACTIONS.file),
    }));
    assert.match(html, /Buy/);
    assert.match(html, /for your account/);
    assert.match(html, /100 USDC/);
    assert.match(html, /Apple xStock \(fixture\) \(AAPLx\)/);
    assert.match(html, /about 0\.4312 AAPLx at Jupiter’s price just now\./);
    assert.match(html, /Good for 20 seconds\./);
    assert.match(html, /Multiplier 1\.1/);
    assert.match(html, /paper estimate/);
    assert.match(html, /File paper record/);
    assert.doesNotMatch(html, /<select/);
    assert.doesNotMatch(html, /type="radio"/);
  });

  it('marks the slip lapsed once the window closes', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'review',
      draft: buyDraft,
      ...jesse,
      quote: buyQuote,
      instrument: AAPLX_FIXTURE,
      now: buyQuote.expiresAt + 1_000,
    }));
    assert.match(html, /data-lapsed="true"/);
    assert.match(html, /Lapsed — ask for a fresh price\./);
  });
});

describe('written slip — sentences', () => {
  it('writes sells in scaled units', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: sellDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
    }));
    assert.match(html, /Sell/);
    assert.match(html, /5\.5 scaled units/);
    assert.match(html, /AAPLx/);
  });

  it('renders missing values as named blanks', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: { instrumentId: AAPLX_FIXTURE.id, side: 'buy', unit: 'USDC', amount: null },
      ...jesse,
      instrument: AAPLX_FIXTURE,
      onEdit: () => {},
    }));
    assert.match(html, /aria-label="Add amount"/);
  });

  it('strikes superseded prices through', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: buyDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
      superseded: [{ id: 'q-old', line: 'Buy 100 USDC of AAPLx — about 0.4310 AAPLx', reason: 'corrected', at: 1 }],
    }));
    assert.match(html, /<s>Buy 100 USDC of AAPLx — about 0\.4310 AAPLx<\/s>/);
    assert.match(html, /superseded — this price no longer stands/);
    assert.match(html, /aria-label="Superseded on this slip"/);
  });
});

describe('written slip — provenance', () => {
  const prov = {
    amount: { kind: 'said' as const, phrase: 'buy 100 USDC of AAPLx', excerpt: '100 USDC', value: '100' },
  };

  it('quotes the words that wrote a value', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: buyDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
      provenance: prov,
    }));
    assert.match(html, /← “100 USDC”/);
    assert.match(html, /From what you said: “buy 100 USDC of AAPLx”/);
  });

  it('never renders a mark whose value the slip no longer holds', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: { ...buyDraft, amount: '50' },
      ...jesse,
      instrument: AAPLX_FIXTURE,
      provenance: prov,
    }));
    assert.doesNotMatch(html, /← “100 USDC”/);
  });
});

describe('written slip — receipt', () => {
  it('reads as filed paper, never as a fill', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'receipt',
      draft: buyDraft,
      ...jesse,
      quote: buyQuote,
      filedAt: record.createdAt,
      instrument: AAPLX_FIXTURE,
    }));
    assert.match(html, /Filed on paper/);
    assert.match(html, /Nothing moved\./);
    assert.doesNotMatch(html, /bought|filled/i);
  });
});

describe('slip vocabulary — Hetty speaks Aerodrome and tokens', () => {
  it('writes a sell in whole tokens at Aerodrome', () => {
    const quote = {
      id: 'q1',
      intent: { instrumentId: 'googl', side: 'sell' as const, amount: '3' },
      inputSymbol: 'GOOGL',
      outputAmount: '743.21',
      outputSymbol: 'USDC',
      expiresAt: 0,
    };
    assert.equal(
      slipOneLine(quote, HETTY_VOCAB),
      'Sell 3 GOOGL tokens of GOOGL — about 743.21 USDC',
    );
    assert.match(
      filedLine(quote, 'GOOGL', HETTY_VOCAB),
      /^Filed on paper: sell 3 .* — Aerodrome estimated about 743\.21 USDC\. Nothing moved\.$/,
    );
  });
});

describe('slipValidity', () => {
  const expiresAt = 30_000;
  it('is open inside the window', () => {
    assert.deepEqual(slipValidity(expiresAt, 10_000), { secondsLeft: 20, state: 'open' });
  });
  it('freezes filing in the last five seconds', () => {
    assert.equal(slipValidity(expiresAt, 26_000).state, 'closing');
    assert.equal(slipValidity(expiresAt, 25_000).state, 'closing');
  });
  it('lapses at the deadline', () => {
    assert.equal(slipValidity(expiresAt, 30_000).state, 'lapsed');
    assert.equal(slipValidity(expiresAt, 31_000).state, 'lapsed');
  });
});
