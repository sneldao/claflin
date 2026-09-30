import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuoteReview, SolanaProposalCosts } from '../components/desk/QuoteReview';
import { JesseTicket } from '../components/desk/JesseTicket';
import { JESSE_BUY_INTENT, JESSE_SELL_INTENT, SOLANA_PAPER_ESTIMATE_FIXTURE } from '../lib/solana/fixtures';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type BaseQuoteEstimate } from '../lib/trading/domain';
import type { JesseDesk } from '../lib/solana/useJesseDesk';
import type { SolanaPaperEstimate } from '../lib/solana/contracts';

const apple = SOLANA_INSTRUMENTS.find(i => i.symbol === 'AAPLx')!;
const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'NVDAc')!;
const now = 1_788_600_000_000;

const jesseBuy: SolanaPaperEstimate = {
  ...SOLANA_PAPER_ESTIMATE_FIXTURE,
  intent: JESSE_BUY_INTENT,
  inputSymbol: 'USDC',
  outputSymbol: 'AAPLx',
  inputAmount: '100',
  outputAmount: '0.4326',
  effectiveScaledAmount: '0.4326',
};

const jesseSell: SolanaPaperEstimate = {
  ...jesseBuy,
  intent: JESSE_SELL_INTENT,
  inputSymbol: 'AAPLx',
  outputSymbol: 'USDC',
  inputAmount: '5.500003',
  outputAmount: '1269.10',
  effectiveScaledAmount: null,
};

const baseBuy: BaseQuoteEstimate = {
  id: 'quote-test', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false,
  intent: { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' },
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: stock.symbol, amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: stock.decimals ?? 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

const baseSell: BaseQuoteEstimate = {
  ...baseBuy,
  intent: { instrumentId: stock.id, side: 'sell', unit: 'token', amount: '2' },
  inputSymbol: stock.symbol, outputSymbol: 'USDC',
  amountInRaw: '200000000', amountOutRaw: '461360000',
  inputAmount: '2', outputAmount: '461.36', shareEquivalent: '2',
};

function dlOrder(html: string, labels: string[]) {
  let at = -1;
  for (const label of labels) {
    const next = html.indexOf(`<dt>${label}</dt>`, at + 1);
    assert.ok(next > at, `label missing or out of order: ${label}`);
    at = next;
  }
}

describe('quote review — shared breakdown', () => {
  it('labels a Jesse buy spend and scaled received amount, then product, issuer, fees, slippage', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: jesseBuy,
      scaled: true,
      issuer: apple.issuer,
      productName: apple.name,
      fees: 'Venue fee: 2 bps',
      slippage: '50 bps quote tolerance; paper record does not execute',
    }));
    dlOrder(html, ['You spend', 'Estimated received', 'Product', 'Issuer', 'Fees', 'Slippage']);
    assert.match(html, /100 USDC/);
    assert.match(html, />0\.4326 AAPLx \(scaled units\)</);
    assert.doesNotMatch(html, /unscaled|Displayed scaled amount/);
    assert.doesNotMatch(html, /shares/);
  });

  it('labels a Jesse sell with requested scaled units and the effective displayed quantity', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: jesseSell,
      scaled: true,
      sellUnit: `${jesseSell.inputSymbol} scaled units`,
      issuer: apple.issuer,
      productName: apple.name,
      fees: 'Venue fee: 2 bps',
      slippage: '50 bps quote tolerance; paper record does not execute',
    }));
    dlOrder(html, ['You sell', 'Effective amount sold', 'Estimated proceeds', 'Product', 'Issuer', 'Fees', 'Slippage']);
    assert.match(html, /5\.5 AAPLx scaled units/);
    assert.match(html, /5\.500003 AAPLx \(scaled units\)/);
    assert.doesNotMatch(html, /unscaled/);
    assert.match(html, />1269\.10 USDC</);
  });

  it('renders a Base buy in Base units with the pool-fee copy verbatim', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: baseBuy,
      issuer: 'Coinbase',
      productName: stock.name,
      fees: 'Pool swap fees included; separate fee amount not itemized.',
      slippage: 'Not applied to paper records',
    }));
    dlOrder(html, ['You spend', 'Estimated received', 'Product', 'Issuer', 'Fees', 'Slippage']);
    assert.match(html, /100 USDC/);
    assert.match(html, />0\.43369593 NVDAc</);
    assert.doesNotMatch(html, /unscaled|scaled units|shares/);
    assert.match(html, /Pool swap fees included; separate fee amount not itemized\./);
    assert.match(html, /Not applied to paper records/);
    assert.doesNotMatch(html, /\$\d/);
  });

  it('renders a Base sell as tokens, never scaled units', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: baseSell,
      issuer: 'Coinbase',
      productName: stock.name,
      fees: 'Pool swap fees included; separate fee amount not itemized.',
      slippage: 'Not applied to paper records',
    }));
    assert.match(html, /2 NVDAc tokens/);
    assert.doesNotMatch(html, /scaled units/);
    assert.match(html, />461\.36 USDC</);
  });

  it('renders Unavailable for missing product and issuer instead of omitting them', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: jesseBuy,
      scaled: true,
      issuer: null,
      productName: null,
      fees: 'Fee breakdown unavailable',
      slippage: '50 bps quote tolerance; paper record does not execute',
    }));
    assert.match(html, /<dt>Product<\/dt><dd>Unavailable<\/dd>/);
    assert.match(html, /<dt>Issuer<\/dt><dd>Unavailable<\/dd>/);
  });

  it('renders proposal network fee and rent as distinct exact rows', () => {
    const html = renderToStaticMarkup(createElement(SolanaProposalCosts, {
      feeSummary: { networkFeeLamports: '5000', rentLamports: '2039280' },
    }));
    assert.match(html, /<dt>Network fee<\/dt><dd>0\.000005 SOL<\/dd>/);
    assert.match(html, /<dt>Account rent<\/dt><dd>0\.00203928 SOL<\/dd>/);
    assert.doesNotMatch(html, /\$\d/);
  });

  it('marks a missing network fee Unavailable while rent stays exact', () => {
    const html = renderToStaticMarkup(createElement(SolanaProposalCosts, {
      feeSummary: { networkFeeLamports: null, rentLamports: '0' },
    }));
    assert.match(html, /<dt>Network fee<\/dt><dd>Unavailable<\/dd>/);
    assert.match(html, /<dt>Account rent<\/dt><dd>0 SOL<\/dd>/);
  });

  it('omits the minimum row unless an exact display value is supplied', () => {
    const html = renderToStaticMarkup(createElement(QuoteReview, {
      quote: jesseBuy,
      scaled: true,
      issuer: apple.issuer,
      productName: apple.name,
      fees: 'Venue fee: 2 bps',
      slippage: '50 bps quote tolerance; paper record does not execute',
    }));
    assert.doesNotMatch(html, /Minimum/);
    const withMin = renderToStaticMarkup(createElement(QuoteReview, {
      quote: jesseBuy,
      scaled: true,
      issuer: apple.issuer,
      productName: apple.name,
      fees: 'Venue fee: 2 bps',
      slippage: '50 bps quote tolerance; paper record does not execute',
      minimum: '0.4290 AAPLx',
    }));
    assert.match(withMin, /Minimum output/);
    assert.match(withMin, /0\.4290 AAPLx/);
  });
});

describe('quote review — ticket wiring', () => {
  function reviewedDesk(quote: SolanaPaperEstimate): JesseDesk {
    const applied = { status: 'applied' as const, revision: 3, quoteId: null, evidenceId: null, spokenText: '' };
    return {
      foreground: { kind: 'quotation', quoteId: quote.id, recordId: null, instrumentId: apple.id, actionable: true, readonly: false },
      historyReady: true,
      storageError: null,
      viewedRecordId: null,
      openRecord: () => {},
      dismissRecord: () => {},
      removeRecord: () => {},
      state: {
        revision: 2,
        sessionGeneration: 1,
        draft: { instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' },
        stage: 'review',
        quote,
        presentedInstrument: null,
        comparison: null,
        presentation: { mode: 'compact', focus: 'desk', objectId: null },
        watches: [],
      },
      inFlight: null,
      lastResult: null,
      records: [],
      edit: async () => applied,
      quote: async () => {},
      compare: async () => {},
      file: async () => applied,
      cancel: async () => applied,
      watch: async () => applied,
      setPresentationMode: () => ({ ok: true, spokenText: '' }),
      run: async () => applied,
    };
  }

  it('shows the paper review heading and unknown-fee copy on the Jesse slip', () => {
    const html = renderToStaticMarkup(createElement(JesseTicket, {
      jesse: reviewedDesk({ ...jesseBuy, feeBps: null }),
      quietEvidence: true,
    }));
    assert.match(html, /Review this paper estimate\./);
    assert.match(html, /Fee breakdown unavailable/);
    assert.doesNotMatch(html, /Then it’s yours/);
  });

  it('keeps honest scaled-unit labelling inside the ticket', () => {
    const html = renderToStaticMarkup(createElement(JesseTicket, {
      jesse: reviewedDesk(jesseBuy),
      quietEvidence: true,
    }));
    assert.match(html, /0\.4326 AAPLx \(scaled units\)/);
    assert.doesNotMatch(html, /unscaled/);
    assert.match(html, /Venue fee: 2 bps/);
    assert.match(html, /paper record does not execute/);
  });
});
