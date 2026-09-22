import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { coverageForOffering, deskRuntimeFor, deskRuntimeForEstimate, documentEngineFor, MARKET_MANDATES, supportsAccountSync, usesLegacyDeskDocuments } from '../lib/desk/registry';
import { estimateDeskId, estimateEnvelope, estimateRail, isSolanaEstimate, withEstimateContext } from '../lib/desk/estimates';
import { normalizeDeskStage, type DeskInstruction, type DeskRuntime } from '../lib/desk/contracts';
import { INSTRUMENT_OFFERINGS, offeringForInstrument, offeringsForProduct } from '../lib/desk/offerings';
import { markAdapterFor, quoteAdapterFor, resolveQuoteCoverage } from '../lib/trading/adapters';
import { PAPER_ASSUMPTIONS, type BaseQuoteEstimate, type QuoteEstimate } from '../lib/trading/domain';
import { parseEstimate } from '../lib/trading/workflow';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { parseJesseEstimate } from '../lib/solana/paper';
import { SOLANA_INSTRUMENTS } from '../lib/solana/catalog';
import { JESSE_SELL_INTENT, SOLANA_PAPER_ESTIMATE_FIXTURE } from '../lib/solana/fixtures';

const stock = DESK_INSTRUMENTS[0];
const solanaInstrument = SOLANA_INSTRUMENTS[0];
const now = 1_790_000_000_000;

const baseQuote: BaseQuoteEstimate = {
  id: 'base-architecture-quote',
  kind: 'estimate',
  mode: 'paper',
  liveExecutionEnabled: false,
  intent: { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' },
  chainId: 8453,
  venue: 'aerodrome',
  poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress,
  instrumentName: stock.name,
  inputSymbol: 'USDC',
  outputSymbol: stock.symbol,
  amountInRaw: '100000000',
  amountOutRaw: '43369593',
  inputAmount: '100',
  outputAmount: '0.43369593',
  tokenDecimals: stock.decimals,
  multiplierRaw: '1000000000000000000',
  shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123,
  blockTimestamp: now / 1000 - 2,
  quotedAt: now,
  expiresAt: now + 30_000,
  assumptions: PAPER_ASSUMPTIONS,
};

const solanaCatalogQuote = {
  ...SOLANA_PAPER_ESTIMATE_FIXTURE,
  intent: { ...SOLANA_PAPER_ESTIMATE_FIXTURE.intent, instrumentId: solanaInstrument.id },
  instrumentAddress: solanaInstrument.mint,
  instrumentName: solanaInstrument.name,
  inputMint: solanaInstrument.mint,
};

describe('rail-neutral desk architecture', () => {
  it('keeps the shared domain independent of rail contract modules', () => {
    const domainPath = fileURLToPath(new URL('../lib/trading/domain.ts', import.meta.url));
    const domainSource = readFileSync(domainPath, 'utf8');
    assert.doesNotMatch(domainSource, /solana\/contracts|from ['"].*solana/);
  });

  it('resolves mandate coverage, storage, and presentation from desk runtime', () => {
    const hetty = deskRuntimeFor('hetty');
    const jesse = deskRuntimeFor('jesse');
    assert.equal(hetty?.coverages.length, 1);
    assert.equal(hetty?.coverages[0].mandate.id, 'coinbase-tokenized-stocks');
    assert.deepEqual(hetty?.coverages[0].mandate.rails, [{ kind: 'evm', network: 'eip155:8453', chainId: 8453 }]);
    assert.equal(hetty?.coverages[0].adapters.quote, 'aerodrome');
    assert.equal(hetty?.storage.scope, 'account-sync');
    assert.equal(jesse?.coverages.length, 1);
    assert.equal(jesse?.coverages[0].mandate.id, 'backed-xstocks');
    assert.deepEqual(jesse?.coverages[0].mandate.rails, [{ kind: 'solana', network: 'solana:mainnet' }]);
    assert.equal(jesse?.coverages[0].adapters.quote, 'jupiter');
    assert.equal(jesse?.storage.scope, 'browser-local');
    assert.equal(hetty?.storage.engine, 'legacy-reducer');
    assert.equal(jesse?.storage.engine, 'controller');
    assert.equal(documentEngineFor('hetty'), 'legacy-reducer');
    assert.equal(documentEngineFor('jesse'), 'controller');
    assert.equal(documentEngineFor('isabel'), 'none');
    assert.equal(documentEngineFor('arbitrum'), 'none');
    assert.equal(documentEngineFor('nope'), 'none');
    /* The legacy helper stays as a predicate over the declared engine. */
    assert.equal(usesLegacyDeskDocuments('hetty'), true);
    assert.equal(usesLegacyDeskDocuments('jesse'), false);
    assert.equal(supportsAccountSync('hetty'), true);
    assert.equal(supportsAccountSync('jesse'), false);
  });

  it('keeps similar exposure distinct as concrete instrument offerings', () => {
    const overlapped = INSTRUMENT_OFFERINGS.find(offering => offeringsForProduct(offering.productId).length > 1);
    assert.ok(overlapped);
    const variants = offeringsForProduct(overlapped.productId);
    assert.ok(variants.some(offering => offering.rail.kind === 'evm'));
    assert.ok(variants.some(offering => offering.rail.kind === 'solana'));
    assert.equal(new Set(variants.map(offering => offering.instrumentId)).size, variants.length);

    const solana = variants.find(offering => offering.rail.kind === 'solana');
    assert.ok(solana);
    assert.equal(offeringForInstrument(solana.instrumentId)?.instrumentId, solana.instrumentId);
    assert.equal(offeringForInstrument(solana.instrumentId.toLowerCase()), null);

    const mixedCaseBase = `8453:0x${stock.contractAddress.slice(2).toUpperCase()}`;
    assert.equal(offeringForInstrument(mixedCaseBase)?.instrumentId, stock.id);
  });

  it('routes adapters through desk, offering, and coverage without borrowing venues', () => {
    const solana = INSTRUMENT_OFFERINGS.find(offering => offering.rail.kind === 'solana');
    assert.ok(solana);
    assert.equal(quoteAdapterFor('hetty', stock.id).venue, 'aerodrome');
    assert.equal(quoteAdapterFor('jesse', { instrumentId: solana.instrumentId }).venue, 'jupiter');
    assert.throws(() => quoteAdapterFor('hetty', solana.instrumentId), /not covered by this desk/);
    assert.throws(() => quoteAdapterFor('jesse', stock.id), /not covered by this desk/);
    assert.equal(markAdapterFor('hetty').source, 'chainlink');
    for (const deskId of ['isabel', 'arbitrum', 'unknown']) {
      assert.throws(() => quoteAdapterFor(deskId));
      assert.throws(() => markAdapterFor(deskId));
    }
    assert.throws(() => markAdapterFor('jesse'));
  });

  it('keeps multi-coverage matching explicit and fails closed when ambiguous', () => {
    const runtime = deskRuntimeFor('jesse');
    const solanaOffering = offeringForInstrument(solanaInstrument.id);
    const baseOffering = offeringForInstrument(stock.id);
    assert.ok(runtime && solanaOffering && baseOffering);

    const additionalCoverage = {
      mandate: MARKET_MANDATES['coinbase-tokenized-stocks'],
      adapters: { quote: 'aerodrome', marks: null, execution: null, voice: null },
      capabilities: runtime.coverages[0].capabilities,
    };
    const multiCoverage: DeskRuntime = {
      ...runtime,
      coverages: [...runtime.coverages, additionalCoverage],
    };

    assert.equal(coverageForOffering(multiCoverage, solanaOffering)?.adapters.quote, 'jupiter');
    assert.equal(coverageForOffering(multiCoverage, baseOffering)?.adapters.quote, 'aerodrome');
    assert.throws(() => resolveQuoteCoverage(multiCoverage), /concrete instrument/);
    assert.throws(() => resolveQuoteCoverage(multiCoverage, stock.id), /not covered by this desk/);
  });

  it('wraps either rail estimate in a shared envelope without flattening evidence', () => {
    const base = estimateEnvelope(baseQuote);
    assert.equal(base?.deskId, 'hetty');
    assert.equal(base?.mandateId, 'coinbase-tokenized-stocks');
    assert.equal(base?.instrumentId, stock.id);
    assert.equal(base?.offeringId, offeringForInstrument(stock.id)?.offeringId);
    assert.deepEqual(base?.rail, { kind: 'evm', network: 'eip155:8453', chainId: 8453 });
    assert.equal(base?.evidence, baseQuote);
    assert.equal('network' in baseQuote, false);

    const solana = estimateEnvelope(solanaCatalogQuote);
    assert.equal(solana?.deskId, 'jesse');
    assert.equal(solana?.mandateId, 'backed-xstocks');
    assert.equal(solana?.instrumentId, solanaInstrument.id);
    assert.equal(solana?.offeringId, offeringForInstrument(solanaInstrument.id)?.offeringId);
    assert.deepEqual(solana?.rail, { kind: 'solana', network: 'solana:mainnet' });
    assert.equal(solana?.evidence, solanaCatalogQuote);
    assert.equal('chainId' in solanaCatalogQuote, false);
    assert.equal(isSolanaEstimate(solanaCatalogQuote), true);
    assert.equal(isSolanaEstimate(baseQuote), false);

    const boundBase = withEstimateContext(baseQuote);
    const boundSolana = withEstimateContext(solanaCatalogQuote);
    assert.equal(boundBase.deskId, 'hetty');
    assert.equal(boundBase.mandateId, 'coinbase-tokenized-stocks');
    assert.equal(boundSolana.deskId, 'jesse');
    assert.equal(boundSolana.mandateId, 'backed-xstocks');
    assert.doesNotThrow(() => parseEstimate(boundBase));
    assert.doesNotThrow(() => parseJesseEstimate(boundSolana));
  });

  it('refuses estimates whose rail evidence disagrees with the claimed desk', () => {
    const foreignDeskClaim = { ...solanaCatalogQuote, deskId: 'hetty' };
    assert.equal(deskRuntimeForEstimate(foreignDeskClaim), null);
    assert.equal(estimateEnvelope(foreignDeskClaim), null);

    const unknownEvm = { ...baseQuote, chainId: 42161 };
    assert.equal(estimateDeskId(unknownEvm), null);
    assert.equal(estimateRail(unknownEvm)?.kind, 'evm');

    const railMismatchedInstrument = {
      ...baseQuote,
      intent: { ...baseQuote.intent, instrumentId: solanaInstrument.id },
    };
    assert.equal(estimateEnvelope(railMismatchedInstrument), null);

    const mismatchedMandate = { ...baseQuote, mandateId: 'backed-xstocks' };
    assert.equal(estimateEnvelope(mismatchedMandate), null);
  });

  it('keeps rail parsers closed to foreign payloads', () => {
    assert.throws(() => parseEstimate(SOLANA_PAPER_ESTIMATE_FIXTURE));
    assert.throws(() => parseJesseEstimate(baseQuote));
  });

  it('uses one instruction and lifecycle vocabulary across desk refinements', () => {
    const instruction: DeskInstruction = JESSE_SELL_INTENT;
    assert.equal(instruction.side, 'sell');
    const quote: QuoteEstimate = SOLANA_PAPER_ESTIMATE_FIXTURE;
    assert.equal(quote.kind, 'estimate');
    assert.equal(normalizeDeskStage('loading'), 'quoting');
    assert.equal(normalizeDeskStage('review'), 'review');
  });
});
