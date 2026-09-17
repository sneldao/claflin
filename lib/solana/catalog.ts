/**
 * Jesse's Solana instrument catalog — a sourced allowlist, never a dynamic
 * arbitrary-token catalog. EMPTY for now: real xStock mints, decimals, and
 * multiplier extensions are verified against authoritative sources in a
 * later work-order step and persisted here with their provenance.
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

/** The verified allowlist — intentionally empty until mints are sourced. */
export const SOLANA_INSTRUMENTS: readonly SolanaInstrument[] = Object.freeze([]);

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
