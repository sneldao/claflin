import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WrittenSlip } from '../components/desk/WrittenSlip';
import { entryInstructionMarks } from '../lib/desk/slip-provenance';
import { entryIntentWithInstruction } from '../lib/house-entry';
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
    assert.match(html, /Estimate expires in 20 seconds\./);
    assert.match(html, /Multiplier 1\.1/);
    assert.match(html, /paper estimate/);
    assert.match(html, /Save paper record/);
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
    assert.match(html, /Expired — request a fresh estimate/);
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

describe('written slip — estimate terms', () => {
  it('puts the numbers first and folds the paper disclaimer behind one line', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'review',
      draft: buyDraft,
      ...jesse,
      quote: { ...buyQuote, assumptions: 'Simulated fill at the quoted output.' },
      instrument: AAPLX_FIXTURE,
      now: buyQuote.quotedAt + 10_000,
    }));
    assert.match(html, /<details[^>]*><summary>How this paper estimate works<\/summary><p[^>]*>Simulated fill at the quoted output\.<\/p><\/details>/);
    assert.ok(!/<details[^>]* open/.test(html), 'collapsed by default');
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

  it('labels keyed text as typed, never as speech', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: buyDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
      provenance: {
        amount: { kind: 'typed' as const, phrase: 'buy 100 USDC of AAPLx', excerpt: '100 USDC', value: '100' },
      },
    }));
    assert.match(html, /← “100 USDC”/);
    assert.match(html, /From what you typed: “buy 100 USDC of AAPLx”/);
    assert.doesNotMatch(html, /From what you said/);
  });

  it('marks a foyer- or URL-carried value as carried, never said', () => {
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: buyDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
      provenance: {
        side: { kind: 'carried' as const, value: 'buy' },
        instrument: { kind: 'carried' as const, value: JESSE_BUY_INTENT.instrumentId },
      },
    }));
    assert.match(html, /← from the foyer/);
    assert.match(html, /Carried in from the foyer/);
    assert.doesNotMatch(html, /From what you said|From what you typed/);
  });

  it('shows a call-set value as "from the call" and keeps the long phrase out of sight', () => {
    const phrase = "Uh, no, let's swap it to Tesla for 10 USDC";
    const html = renderToStaticMarkup(createElement(WrittenSlip, {
      mode: 'draft',
      draft: buyDraft,
      ...jesse,
      instrument: AAPLX_FIXTURE,
      provenance: { amount: { kind: 'line' as const, value: '100', lastCaller: phrase } },
    }));
    assert.match(html, /<span aria-hidden="true">← from the call<\/span>/);
    assert.ok(!html.includes(`← from the call · you said`), 'the quote is not printed beside the field');
    assert.match(html, /Set over the call after you said: “Uh, no/, 'still available on hover and to screen readers');
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

describe('entry instruction marks', () => {
  it('marks spoken side and amount as said only with literal spans', () => {
    const intent = entryIntentWithInstruction('buy $25 of Apple', 'spoken')!;
    const marks = entryInstructionMarks(intent, 'aaplc');
    assert.equal(marks.instrument?.kind, 'carried');
    assert.equal(marks.side?.kind, 'said');
    assert.equal(marks.side?.kind === 'said' && marks.side.excerpt, 'buy');
    assert.equal(marks.amount?.kind, 'said');
  });

  it('marks typed values as typed and picked context as carried', () => {
    const typed = entryIntentWithInstruction('buy $25 of Apple', 'typed')!;
    const typedMarks = entryInstructionMarks(typed, 'aaplc');
    assert.equal(typedMarks.side?.kind, 'typed');
    assert.equal(typedMarks.amount?.kind, 'typed');
    const picked = entryIntentWithInstruction('buy $25 of Apple', 'picked')!;
    assert.equal(entryInstructionMarks(picked, 'aaplc').side?.kind, 'carried');
  });

  it('never mints said marks for a URL-only entry', () => {
    const marks = entryInstructionMarks({ side: 'buy', amount: '25' }, 'aaplc');
    assert.equal(marks.side?.kind, 'carried');
    assert.equal(marks.amount?.kind, 'carried');
  });

  it('falls back to carried when a claimed span is not literally in the phrase', () => {
    const spoken = entryInstructionMarks({
      side: null,
      amount: '25',
      instruction: { text: 'twenty five dollars of Apple', source: 'spoken', spans: { amount: '25' } },
    }, 'aaplc');
    assert.equal(spoken.amount?.kind, 'carried', 'the normalized figure was never literally said');
    const typed = entryInstructionMarks({
      side: null,
      amount: '25',
      instruction: { text: 'twenty five dollars of Apple', source: 'typed' },
    }, 'aaplc');
    assert.equal(typed.amount?.kind, 'carried', 'a typed mark needs its literal span');
    const fabric = entryInstructionMarks({
      side: 'buy',
      amount: null,
      instruction: { text: 'sell Apple', source: 'spoken', spans: { side: 'buy' } },
    }, 'aaplc');
    assert.equal(fabric.side?.kind, 'carried', 'a span that is not in the text is no quote');
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
