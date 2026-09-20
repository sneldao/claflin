import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_CAPABILITIES, isOpenDesk, OPEN_DESK_ID, usesLegacyDeskDocuments } from '../lib/house';
import { JESSE_PAPER_ENABLED } from '../lib/solana/flags';
import { PAPER_ASSUMPTIONS, type BaseQuoteEstimate } from '../lib/trading/domain';
import { DESK_INSTRUMENTS, getDeskInstrument, resolveDeskAlias } from '../lib/trading/catalog';
import { quoteAdapterFor } from '../lib/trading/adapters';
import { isJesseIntent, isSolanaEstimate, isSolanaInstrumentId } from '../lib/solana/contracts';
import { decodeBase58, getSolanaInstrument, instrumentsForSolanaDesk, parseSolanaInstrumentId, SOLANA_INSTRUMENTS, SOLANA_USDC_DECIMALS, SOLANA_USDC_MINT } from '../lib/solana/catalog';
import { displayedToRaw, effectiveDisplayed, rawToDisplayed } from '../lib/solana/amounts';
import { AAPLX_FIXTURE, JESSE_BUY_INTENT, JESSE_SELL_INTENT, SOLANA_PAPER_ESTIMATE_FIXTURE } from '../lib/solana/fixtures';

const now = 1788600000000;
const stock = DESK_INSTRUMENTS[0];

/* A valid legacy Base estimate — the union must admit it unchanged. */
const baseQuote: BaseQuoteEstimate = {
  id: 'quote-test', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false,
  intent: { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '100' },
  chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
  instrumentAddress: stock.contractAddress, instrumentName: stock.name,
  inputSymbol: 'USDC', outputSymbol: 'NVDAc', amountInRaw: '100000000', amountOutRaw: '43369593',
  inputAmount: '100', outputAmount: '0.43369593', tokenDecimals: 8, multiplierRaw: '1000000000000000000', shareEquivalent: '0.43369593',
  reference: { source: 'chainlink', status: 'unavailable', session: 'unknown', pauseStatus: 'unchecked' },
  blockNumber: 123, blockTimestamp: now / 1000 - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
};

function codeOf(fn: () => unknown): { code: string; status: number } {
  try { fn(); } catch (error) {
    const known = error as { code?: string; status?: number };
    return { code: known.code ?? 'no-code', status: known.status ?? 0 };
  }
  return { code: 'did-not-throw', status: 0 };
}

describe('desk capabilities drive openness', () => {
  it('opens only desks with real quote and paper capabilities', () => {
    /* Hetty's live capability mirrors the deployment flag — the capability
       table, the desk gate and the docs tell one story (README: live
       execution boundary). Planned desks never trade live. */
    const hettyLive = process.env.NEXT_PUBLIC_LIVE_EXECUTION_ENABLED === 'true';
    assert.deepEqual(DESK_CAPABILITIES.hetty, { quote: true, paper: true, voice: 'elevenlabs-convai', live: hettyLive });
    /* Jesse paper tracks NEXT_PUBLIC_JESSE_PAPER_ENABLED — quote-only is not
       an open desk until the seated surface can file. */
    assert.deepEqual(DESK_CAPABILITIES.jesse, { quote: true, paper: JESSE_PAPER_ENABLED, voice: JESSE_PAPER_ENABLED ? 'elevenlabs-convai' : null, live: false });
    for (const deskId of ['isabel', 'arbitrum'] as const) {
      assert.deepEqual(DESK_CAPABILITIES[deskId], { quote: false, paper: false, voice: null, live: false });
    }
    assert.equal(OPEN_DESK_ID, 'hetty');
    assert.equal(isOpenDesk('hetty'), true);
    assert.equal(isOpenDesk('jesse'), JESSE_PAPER_ENABLED);
    for (const deskId of ['isabel', 'arbitrum', 'nope']) assert.equal(isOpenDesk(deskId), false);
    /* Legacy Base documents stay Hetty-owned regardless of Jesse's flag. */
    assert.equal(usesLegacyDeskDocuments('hetty'), true);
    assert.equal(usesLegacyDeskDocuments('jesse'), false);
    assert.equal(usesLegacyDeskDocuments('isabel'), false);
  });
});

describe('solana instrument catalog', () => {
  it('ships the verified xStock allowlist with provenance', () => {
    /* Verified 2026-09-17 against the issuer API and mainnet RPC — see the
       module header in lib/solana/catalog.ts. Identity is verified here;
       quoteSupported flips only after route/feed validation. */
    assert.equal(SOLANA_INSTRUMENTS.length, 3);
    assert.equal(instrumentsForSolanaDesk(), SOLANA_INSTRUMENTS);
    assert.deepEqual(SOLANA_INSTRUMENTS.map(i => i.symbol), ['AAPLx', 'NVDAx', 'TSLAx']);
    assert.deepEqual(SOLANA_INSTRUMENTS.map(i => i.underlyingSymbol), ['AAPL', 'NVDA', 'TSLA']);
    assert.equal(new Set(SOLANA_INSTRUMENTS.map(i => i.mint)).size, 3, 'mints are unique');
    for (const instrument of SOLANA_INSTRUMENTS) {
      assert.equal(instrument.network, 'solana:mainnet');
      assert.equal(instrument.deskId, 'jesse');
      assert.equal(instrument.tokenProgram, 'spl-token-2022');
      assert.equal(instrument.decimals, 8, `${instrument.symbol}: RPC-verified decimals`);
      assert.equal(instrument.id, `sol:${instrument.mint}`);
      assert.equal(instrument.quoteSupported, true, `${instrument.symbol}: Jupiter route verified both directions 2026-09-17`);
      assert.equal(decodeBase58(instrument.mint)?.length, 32, `${instrument.symbol}: mint decodes to a public key`);
      assert.ok(instrument.identitySourceUrl.startsWith('https://api.xstocks.fi/'), instrument.symbol);
      assert.ok(instrument.verifiedAt > 0, instrument.symbol);
    }
  });
  it('resolves a real allowlisted mint, case-exact', () => {
    const aaplx = getSolanaInstrument('sol:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
    assert.equal(aaplx.symbol, 'AAPLx');
    /* Case carries information in base58: the lowercased twin is a valid
       32-byte string but is NOT this instrument. */
    assert.equal(codeOf(() => getSolanaInstrument('sol:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp'.toLowerCase())).code, 'unknown_instrument');
  });
  it('keeps the canonical USDC mint decodable and separate from Base USDC', () => {
    assert.equal(decodeBase58(SOLANA_USDC_MINT)?.length, 32);
    assert.equal(SOLANA_USDC_DECIMALS, 6);
    assert.notEqual(SOLANA_USDC_MINT.toLowerCase(), SOLANA_USDC_MINT, 'mixed case preserved');
  });
  it('preserves an exact mixed-case mint through a catalog round trip', () => {
    const mint = AAPLX_FIXTURE.mint;
    assert.match(mint, /[a-z]/);
    assert.match(mint, /[A-Z]/);
    assert.equal(parseSolanaInstrumentId(AAPLX_FIXTURE.id), AAPLX_FIXTURE.id);
    assert.equal(parseSolanaInstrumentId(AAPLX_FIXTURE.id), `sol:${mint}`);
    assert.notEqual(parseSolanaInstrumentId(AAPLX_FIXTURE.id), AAPLX_FIXTURE.id.toLowerCase());
    assert.equal(decodeBase58(mint)?.length, 32);
  });
  it('rejects invalid base58 and wrong decoded lengths', () => {
    for (const bad of ['sol:0OIl+not-base58', 'sol:not base58!!', 'sol:1111', 'sol:', 'not-sol:abc', AAPLX_FIXTURE.id.toLowerCase() + '1'.repeat(10)]) {
      assert.equal(codeOf(() => parseSolanaInstrumentId(bad)).code, 'unknown_instrument', bad);
    }
  });
  it('refuses anything outside the allowlist with unknown_instrument 404', () => {
    const failure = codeOf(() => getSolanaInstrument(AAPLX_FIXTURE.id));
    assert.equal(failure.code, 'unknown_instrument');
    assert.equal(failure.status, 404);
  });
});

describe('scaled amount math (plan §4.3)', () => {
  it('renders the exact fixtures', () => {
    assert.equal(rawToDisplayed(1_000_000n, 6, '1.1'), '1.1');
    assert.equal(displayedToRaw('5.5', 6, '1.1'), 5_000_000n);
    assert.equal(displayedToRaw('1', 6, '1.5'), 666_666n);
    assert.equal(effectiveDisplayed(666_666n, 6, '1.5'), '0.999999');
  });
  it('handles the precision boundary at d=6', () => {
    assert.throws(() => displayedToRaw('0.0000001', 6, '1'), /zero atoms/);
    assert.equal(displayedToRaw('0.000001', 6, '1'), 1n);
    assert.equal(rawToDisplayed(0n, 6, '1.1'), '0');
  });
  it('rejects zero, negative, and non-decimal input', () => {
    for (const bad of ['0', '0.000', '-1', 'abc', '1.2.3', '', '1e3']) {
      assert.throws(() => displayedToRaw(bad, 6, '1'), bad || 'empty');
    }
    assert.throws(() => displayedToRaw('1', 6, '0'));
    assert.throws(() => displayedToRaw('1', 6, '-1.1'));
    assert.throws(() => displayedToRaw('1', 6, 'many'));
    assert.throws(() => rawToDisplayed(-1n, 6, '1'));
  });
  it('rejects overflow beyond the Solana u64 range', () => {
    assert.equal(displayedToRaw('18446744073709.551615', 6, '1'), 2n ** 64n - 1n);
    assert.throws(() => displayedToRaw('18446744073709.551616', 6, '1'), /u64/);
    assert.throws(() => displayedToRaw('99999999999999', 6, '1'), /u64/);
    assert.throws(() => rawToDisplayed(2n ** 64n, 6, '1'), /u64/);
  });
});

describe('contract guards narrow the shared unions', () => {
  it('isSolanaEstimate narrows both ways', () => {
    assert.equal(isSolanaEstimate(SOLANA_PAPER_ESTIMATE_FIXTURE), true);
    assert.equal(isSolanaEstimate(baseQuote), false);
  });
  it('isSolanaInstrumentId is a template check, not mint validation', () => {
    assert.equal(isSolanaInstrumentId(AAPLX_FIXTURE.id), true);
    assert.equal(isSolanaInstrumentId('sol:anything-goes-here'), true);
    assert.equal(isSolanaInstrumentId('8453:0xabc'), false);
    assert.equal(isSolanaInstrumentId('sol:'), false);
    assert.equal(isSolanaInstrumentId(42), false);
  });
  it('isJesseIntent accepts only unit-safe complete intents', () => {
    assert.equal(isJesseIntent(JESSE_BUY_INTENT), true);
    assert.equal(isJesseIntent(JESSE_SELL_INTENT), true);
    assert.equal(isJesseIntent({ ...JESSE_BUY_INTENT, unit: 'token' }), false);
    assert.equal(isJesseIntent({ ...JESSE_SELL_INTENT, unit: 'token' }), false);
    assert.equal(isJesseIntent({ ...JESSE_BUY_INTENT, amount: '0' }), false);
    assert.equal(isJesseIntent(baseQuote.intent), false, 'a Base intent has no sol: instrument');
    assert.equal(isJesseIntent(null), false);
  });
});

describe('base seams stay byte-identical', () => {
  it('folds base:0x… aliases to the canonical 8453 id', () => {
    const folded = getDeskInstrument(`base:${stock.contractAddress}`);
    assert.equal(folded.id, stock.id);
    assert.match(folded.id, /^8453:0x[0-9a-f]{40}$/);
  });
  it('resolves legacy voice aliases unchanged', () => {
    assert.equal(resolveDeskAlias('nvidia')?.symbol, 'NVDAc');
    assert.equal(resolveDeskAlias('apple')?.symbol, 'AAPLc');
  });
  it('keeps sol: ids out of Hetty’s catalog', () => {
    assert.equal(codeOf(() => getDeskInstrument(AAPLX_FIXTURE.id)).code, 'unknown_instrument');
  });
  it('resolves Jesse through its own venue while planned desks still refuse', () => {
    assert.equal(quoteAdapterFor('hetty').venue, 'aerodrome');
    assert.equal(quoteAdapterFor('jesse').venue, 'jupiter');
    for (const deskId of ['isabel', 'arbitrum']) {
      const failure = codeOf(() => quoteAdapterFor(deskId));
      assert.equal(failure.code, 'desk_unavailable');
      assert.equal(failure.status, 422);
    }
  });
});
