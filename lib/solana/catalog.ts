/**
 * Jesse's Solana instrument catalog — a sourced allowlist, never a dynamic
 * arbitrary-token catalog. Every entry was verified 2026-09-17 against two
 * independent authorities: the issuer's public API (Backed/xStocks,
 * `identitySourceUrl` per entry) and Solana mainnet RPC `getAccountInfo`
 * (solana-rpc.publicnode.com, slot 447810681).
 *
 * What the mints showed on-chain, and what it means for the desk:
 * - All three xStocks are Token-2022 mints (owner TokenzQdBN…PxuEb) with
 *   8 decimals — not the 6 of the plan's worked examples.
 * - All three carry metadataPointer, permanentDelegate, defaultAccountState,
 *   scaledUiAmountConfig, pausableConfig, confidentialTransferMint,
 *   transferHook and tokenMetadata extensions, plus live issuer mint/freeze
 *   authorities — expected for issuer-controlled RWAs, disclosed on the
 *   ticket, and re-checked at any live preparation (plan §4.3).
 * - The scaled-UI multiplier is fee-accreting: observed raw fields had
 *   AAPLx 1.0026642075893797 (queued 1.0032690125398187 activating
 *   2026-09-10) and NVDAx 1.0009180758490996 (queued 1.001701196801074
 *   activating 2026-09-10), TSLAx exactly 1. The multiplier is therefore
 *   NEVER stored here — it is read live at quote time with the program's
 *   effective-at semantics. This catalog holds identity, not conversion
 *   state.
 *
 * Solana mint case is preserved everywhere in this module — the legacy
 * getDeskInstrument lowercases entire ids, and that EVM normalization must
 * not propagate to base58 mints, where case carries information.
 */

import { TradingError } from '../trading/domain';
import { isSolanaInstrumentId, type SolanaInstrument, type SolanaInstrumentId } from './contracts';

const BASE58_ALPHABET =
  '123456789' +
  'ABCDEFGHJKLMNPQRSTUVWXYZ' +
  'abcdefghijkmnopqrstuvwxyz';
/** A 32-byte Ed25519 public key encodes to at most 44 base58 characters. */
const MAX_MINT_LENGTH = 44;

/**
 * Decode base58 to bytes — pure TS, no dependency. Returns null on any
 * character outside the alphabet; leading '1's decode to leading zero bytes.
 * A regex is not sufficient validation for a mint: only the decoded length
 * proves this is a public key.
 */
export function decodeBase58(text: string): Uint8Array | null {
  if (text.length === 0) return null;
  let value = 0n;
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) return null;
    value = value * 58n + BigInt(digit);
  }
  let leadingZeros = 0;
  while (leadingZeros < text.length && text[leadingZeros] === '1') leadingZeros++;
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  return Uint8Array.from([...new Array<number>(leadingZeros).fill(0), ...bytes]);
}

/**
 * Validate a `sol:` instrument id and return it unchanged — exact case
 * preserved. Anything that is not a base58 string decoding to precisely
 * 32 bytes is rejected; a ticker-similar string is not an instrument.
 */
export function parseSolanaInstrumentId(id: string): SolanaInstrumentId {
  if (!isSolanaInstrumentId(id) || id.length > 4 + MAX_MINT_LENGTH) {
    throw new TradingError('unknown_instrument', 'This product is outside Jesse’s Solana catalog.', 404);
  }
  const decoded = decodeBase58(id.slice(4));
  if (!decoded || decoded.length !== 32) {
    throw new TradingError('unknown_instrument', 'That Solana instrument id does not decode to a verified mint.', 404);
  }
  return id;
}

/**
 * Canonical Solana USDC — confirmed from the issuer's own stablecoin list
 * (every xStock deployment above quotes USDC at this address) and from RPC
 * (legacy spl-token program, 6 decimals, supply consistent with the canonical
 * Circle mint). Never copied from Base's USDC address.
 */
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_USDC_DECIMALS = 6;

/**
 * The verified allowlist. Identity was verified 2026-09-17 (above);
 * `quoteSupported` flipped the same day after every entry quoted
 * successfully both directions on Jupiter Swap V2 (`/order`, Metis router,
 * ExactIn, 50 bps, keyless tier) — AAPLx, NVDAx and TSLAx all routed.
 * The Pyth feed mapping (Engineer 2) is a separate validation and does not
 * gate Jupiter quoting. verifiedAt is the identity-check instant.
 */
export const SOLANA_INSTRUMENTS: readonly SolanaInstrument[] = Object.freeze([
  Object.freeze({
    id: 'sol:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    network: 'solana:mainnet',
    deskId: 'jesse',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    symbol: 'AAPLx',
    name: 'Apple xStock',
    underlyingSymbol: 'AAPL',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    issuer: 'Backed Finance (xStocks)',
    termsUrl: 'https://xstocks.fi/us/products#AAPLx',
    identitySourceUrl: 'https://api.xstocks.fi/api/v2/public/assets/AAPLx',
    verifiedAt: 1789653043000,
    quoteSupported: true,
  } satisfies SolanaInstrument),
  Object.freeze({
    id: 'sol:Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    network: 'solana:mainnet',
    deskId: 'jesse',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    symbol: 'NVDAx',
    name: 'NVIDIA xStock',
    underlyingSymbol: 'NVDA',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    issuer: 'Backed Finance (xStocks)',
    termsUrl: 'https://xstocks.fi/us/products#NVDAx',
    identitySourceUrl: 'https://api.xstocks.fi/api/v2/public/assets/NVDAx',
    verifiedAt: 1789653043000,
    quoteSupported: true,
  } satisfies SolanaInstrument),
  Object.freeze({
    id: 'sol:XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    network: 'solana:mainnet',
    deskId: 'jesse',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    symbol: 'TSLAx',
    name: 'Tesla xStock',
    underlyingSymbol: 'TSLA',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    issuer: 'Backed Finance (xStocks)',
    termsUrl: 'https://xstocks.fi/us/products#TSLAx',
    identitySourceUrl: 'https://api.xstocks.fi/api/v2/public/assets/TSLAx',
    verifiedAt: 1789653043000,
    quoteSupported: true,
  } satisfies SolanaInstrument),
]);

/** Every instrument Jesse's desk may quote — today, none. */
export function instrumentsForSolanaDesk(): readonly SolanaInstrument[] {
  return SOLANA_INSTRUMENTS;
}

/**
 * Exact-id lookup in Jesse's allowlist — case-sensitive, no aliasing.
 * Anything not allowlisted (or not a decodable mint) is unknown, 404.
 */
export function getSolanaInstrument(id: string): SolanaInstrument {
  const canonical = parseSolanaInstrumentId(id);
  const instrument = SOLANA_INSTRUMENTS.find(candidate => candidate.id === canonical);
  if (!instrument) throw new TradingError('unknown_instrument', 'This product is outside Jesse’s Solana catalog.', 404);
  return instrument;
}
