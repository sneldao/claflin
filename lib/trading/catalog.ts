import { TOKENIZED_STOCKS, type TokenizedStock, type VenuePair } from '../tokenized-stocks';
import { BASE_CHAIN_ID } from '../base-chain';
import { TradingError } from './domain';

export type DeskInstrument = Readonly<Omit<TokenizedStock, 'availability' | 'availabilityNote' | 'venuePairs'> & {
  id: string;
  chainId: number;
  quoteSupported: boolean;
  liveExecutionEnabled: false;
  venuePairs: readonly Readonly<VenuePair>[];
}>;

/**
 * Instrument identity scheme. Base instruments keep their byte-identical
 * `8453:0x…` ids — persisted drafts and paper records must keep resolving.
 * New chains mint prefixed ids under the same grammar:
 *   base:0x…  — EVM alias for 8453:0x… (accepted, canonicalizes to 8453:…)
 *   sol:…     — Solana mint address (base58)
 *   rh:…      — Robinhood Chain instrument key
 */
export type InstrumentRef =
  | { protocol: 'evm'; chainId: number; address: string }
  | { protocol: 'sol'; address: string }
  | { protocol: 'rh'; address: string };

export function parseInstrumentId(id: string): InstrumentRef | null {
  const [prefix, ...rest] = id.split(':');
  const address = rest.join(':');
  if (!address) return null;
  if (prefix === 'sol') return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address) ? { protocol: 'sol', address } : null;
  if (prefix === 'rh') return { protocol: 'rh', address: address.toLowerCase() };
  if (prefix === 'base' && /^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { protocol: 'evm', chainId: BASE_CHAIN_ID, address: address.toLowerCase() };
  }
  if (/^\d+$/.test(prefix) && /^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { protocol: 'evm', chainId: Number(prefix), address: address.toLowerCase() };
  }
  return null;
}

/** Canonical id for a parsed ref. EVM Base refs fold to the legacy `8453:0x…` form. */
export function canonicalInstrumentId(ref: InstrumentRef): string {
  if (ref.protocol === 'evm') return `${ref.chainId}:${ref.address}`;
  if (ref.protocol === 'sol') return `sol:${ref.address}`;
  return `rh:${ref.address}`;
}

export const DESK_INSTRUMENTS: readonly DeskInstrument[] = Object.freeze(TOKENIZED_STOCKS.map(stock => {
  const { availability, availabilityNote: _note, venuePairs, ...identity } = stock;
  return Object.freeze({
    ...identity,
    id: `${BASE_CHAIN_ID}:${stock.contractAddress.toLowerCase()}`,
    chainId: BASE_CHAIN_ID as number,
    quoteSupported: availability === 'quote_candidate' && stock.decimals !== null && venuePairs.length > 0,
    liveExecutionEnabled: false as const,
    venuePairs: Object.freeze(venuePairs.map(pair => Object.freeze({ ...pair }))),
  });
}));

export function getDeskInstrument(id: string): DeskInstrument {
  const raw = id.toLowerCase();
  // Accept the `base:0x…` alias by folding it to the canonical `8453:0x…` id.
  const canonical = raw.startsWith('base:0x') ? `${BASE_CHAIN_ID}:${raw.slice(5)}` : raw;
  const stock = DESK_INSTRUMENTS.find(s => s.id === canonical);
  if (!stock) throw new TradingError('unknown_instrument', 'This product is outside Hetty’s Base catalog.', 404);
  return stock;
}

export function getQuotePair(stock: DeskInstrument): Readonly<VenuePair> {
  const canonical = getDeskInstrument(stock.id);
  const pair = canonical.venuePairs.find(p => p.quoteSymbol === 'USDC');
  if (!canonical.quoteSupported || !pair) throw new TradingError('coverage_pending', 'Quote coverage for this instrument has not been verified.', 422);
  return pair;
}

export function getQuotePairByPoolAddress(poolAddress: string): Readonly<VenuePair> | undefined {
  const lower = poolAddress.toLowerCase();
  return DESK_INSTRUMENTS.flatMap(s => s.venuePairs).find(p => p.poolAddress.toLowerCase() === lower);
}

export function resolveDeskAlias(query: string): DeskInstrument | undefined {
  const alias = query.trim().toLowerCase();
  const names: Record<string, string> = { nvidia: 'NVDAc', apple: 'AAPLc', meta: 'METAc', google: 'GOOGLc', alphabet: 'GOOGLc' };
  return DESK_INSTRUMENTS.find(s => s.id === alias || s.contractAddress.toLowerCase() === alias || s.symbol.toLowerCase() === alias || s.underlyingSymbol.toLowerCase() === alias || s.name.toLowerCase() === alias || s.symbol === names[alias]);
}
