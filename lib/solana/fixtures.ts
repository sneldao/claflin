/**
 * Representative Solana test fixtures (plan §5, Engineer 1 work item 1) —
 * deterministic, clearly fictional, and safe for every engineer to build
 * against. These mints are generated from labels; they are NOT real xStock
 * mints and must never appear in the allowlist or any provider fallback.
 */

import type {
  JesseCommand,
  JesseIntent,
  MarketComparison,
  MarketObservation,
  SolanaInstrument,
  SolanaPaperEstimate,
} from './contracts';

/** Fixed clock for fixtures — evidence and quotes stay byte-stable. */
export const FIXTURE_NOW = 1_790_000_000_000;

const BASE58_ALPHABET =
  '123456789' +
  'ABCDEFGHJKLMNPQRSTUVWXYZ' +
  'abcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;
  return '1'.repeat(leadingZeros) + encoded;
}

/** A syntactically valid 32-byte base58 mint derived deterministically from
 *  a label — valid for parser/catalog tests, meaningless on any network. */
export function fixtureMint(label: string): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (label.charCodeAt(i % label.length) * 31 + i * 17 + 11) % 256;
  return encodeBase58(bytes);
}

export const AAPLX_FIXTURE_MINT = fixtureMint('claflin.fixture.aaplx');
export const USDC_FIXTURE_MINT = fixtureMint('claflin.fixture.usdc');

/** An AAPLx-style fixture instrument — the shape real verification must fill. */
export const AAPLX_FIXTURE: SolanaInstrument = {
  id: `sol:${AAPLX_FIXTURE_MINT}`,
  network: 'solana:mainnet',
  deskId: 'jesse',
  mint: AAPLX_FIXTURE_MINT,
  symbol: 'AAPLx',
  name: 'Apple xStock (fixture)',
  underlyingSymbol: 'AAPL',
  decimals: 6,
  tokenProgram: 'spl-token-2022',
  issuer: 'Fixture Issuer — not a real xStock',
  termsUrl: 'https://example.invalid/aaplx/terms',
  identitySourceUrl: 'https://example.invalid/aaplx/identity',
  verifiedAt: FIXTURE_NOW - 86_400_000,
  quoteSupported: true,
};

export const JESSE_BUY_INTENT: JesseIntent = { instrumentId: AAPLX_FIXTURE.id, side: 'buy', unit: 'USDC', amount: '100' };
export const JESSE_SELL_INTENT: JesseIntent = { instrumentId: AAPLX_FIXTURE.id, side: 'sell', unit: 'scaled-token', amount: '5.5' };

/** Representative paper assumptions — simulation wording per §4.2, not the
 *  Aerodrome literal; the Jupiter work item owns the final text. */
export const SOLANA_PAPER_ASSUMPTIONS =
  'Simulated fill at the returned Jupiter output, including the venue fees shown. Network gas, settlement, and any platform charges are excluded. No wallet, holdings, or eligibility is verified. This is a local paper record, not a live order or position.';

/**
 * A coherent sell estimate: 5.5 displayed AAPLx at multiplier 1.1 is exactly
 * 5_000_000 atoms in, 1257.5 USDC out (§4.3 fixtures), Metis-only routing,
 * 50 bps slippage, 30-second review window.
 */
export const SOLANA_PAPER_ESTIMATE_FIXTURE: SolanaPaperEstimate = {
  version: 2,
  id: 'solana-fixture-quote-1',
  kind: 'estimate',
  mode: 'paper',
  liveExecutionEnabled: false,
  deskId: 'jesse',
  network: 'solana:mainnet',
  venue: 'jupiter',
  intent: JESSE_SELL_INTENT,
  instrumentAddress: AAPLX_FIXTURE_MINT,
  instrumentName: AAPLX_FIXTURE.name,
  inputMint: AAPLX_FIXTURE_MINT,
  outputMint: USDC_FIXTURE_MINT,
  inputSymbol: 'AAPLx',
  outputSymbol: 'USDC',
  amountInRaw: '5000000',
  amountOutRaw: '1257500000',
  inputAmount: '5.5',
  outputAmount: '1257.5',
  requestedScaledAmount: '5.5',
  effectiveScaledAmount: '5.5',
  scaling: { multiplier: '1.1', observedSlot: 312_345_678, observedAt: FIXTURE_NOW - 2_000, nextEffectiveAt: null },
  router: 'metis',
  priceImpactPercent: '0.04',
  feeBps: null,
  feeMint: null,
  slippageBps: 50,
  minOutputRaw: '1251212500',
  providerRequestId: 'fixture-jupiter-order-1',
  quotedAt: FIXTURE_NOW,
  expiresAt: FIXTURE_NOW + 30_000,
  assumptions: SOLANA_PAPER_ASSUMPTIONS,
};

function observation(overrides: Partial<MarketObservation>): MarketObservation {
  return {
    feedId: null,
    symbol: 'AAPL/USD',
    source: 'pyth-pro',
    unit: null,
    price: null,
    confidence: null,
    generatedAt: null,
    receivedAt: FIXTURE_NOW - 3_500,
    session: 'unknown',
    status: 'unavailable',
    ...overrides,
  };
}

function comparison(id: string, overrides: Partial<MarketComparison>): MarketComparison {
  return {
    id,
    version: 1,
    instrumentId: AAPLX_FIXTURE.id,
    observedAt: FIXTURE_NOW - 3_000,
    token: observation({}),
    equity: observation({}),
    multiplier: null,
    status: 'unavailable',
    referenceDifferenceBps: null,
    reasonCodes: [],
    ...overrides,
  };
}

/** Both observations fresh, regular session, verified units — 101 vs 100. */
export const COMPARISON_COMPARABLE_FIXTURE: MarketComparison = comparison('fixture-comparison-comparable', {
  token: observation({
    feedId: 7_416, symbol: 'AAPLx/USD', unit: 'usd-per-scaled-token',
    price: '101', confidence: '0.05', generatedAt: FIXTURE_NOW - 4_000, session: 'regular', status: 'fresh',
  }),
  equity: observation({
    feedId: 3_097, symbol: 'AAPL/USD', unit: 'usd-per-share',
    price: '100', confidence: '0.04', generatedAt: FIXTURE_NOW - 5_000, session: 'regular', status: 'fresh',
  }),
  multiplier: '1.1',
  status: 'comparable',
  referenceDifferenceBps: '100.0',
});

/** Equity outside regular session — a labelled non-contemporaneous reading. */
export const COMPARISON_LAST_OBSERVATION_FIXTURE: MarketComparison = comparison('fixture-comparison-last-observation', {
  token: observation({
    feedId: 7_416, symbol: 'AAPLx/USD', unit: 'usd-per-scaled-token',
    price: '101', confidence: '0.05', generatedAt: FIXTURE_NOW - 4_000, session: 'regular', status: 'fresh',
  }),
  equity: observation({
    feedId: 3_097, symbol: 'AAPL/USD', unit: 'usd-per-share',
    price: '100', confidence: '0.04', generatedAt: FIXTURE_NOW - 3_600_000, session: 'postMarket', status: 'stale',
  }),
  multiplier: '1.1',
  status: 'last-observation',
  referenceDifferenceBps: '100.0',
  reasonCodes: ['equity-not-regular-session', 'non-contemporaneous'],
});

/** No evidence — never fabricated, never blocks an otherwise valid quote. */
export const COMPARISON_UNAVAILABLE_FIXTURE: MarketComparison = comparison('fixture-comparison-unavailable', {
  status: 'unavailable',
  reasonCodes: ['equity-unavailable', 'token-unavailable'],
});

/** One sample of every command shape the shared controller must accept. */
export const JESSE_COMMAND_FIXTURES: readonly JesseCommand[] = [
  { type: 'draft', intent: JESSE_BUY_INTENT, quote: true },
  { type: 'compare', instrumentId: AAPLX_FIXTURE.id },
  { type: 'explain', topic: 'scaled-units' },
  { type: 'describe' },
  { type: 'focus', target: 'evidence', objectId: COMPARISON_COMPARABLE_FIXTURE.id },
  { type: 'watch', instrumentId: AAPLX_FIXTURE.id },
  { type: 'cancel' },
  { type: 'file-paper', quoteId: SOLANA_PAPER_ESTIMATE_FIXTURE.id },
  { type: 'clarify', draft: { instrumentId: AAPLX_FIXTURE.id, side: null, unit: null, amount: null }, field: 'side', question: 'Buy or sell?' },
];
