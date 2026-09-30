import { encodeBase58 } from './catalog';

/**
 * The on-chain signature of a signed Solana transaction — the first
 * signature in the wire format: a compact-u16 count, then 64-byte
 * signatures. Deriving it client-side the moment the wallet signs means
 * the durable record exists even if the execute response never arrives.
 * Returns null when the bytes cannot carry a signature.
 */
export function signatureFromSignedTransaction(tx: Uint8Array): string | null {
  if (tx.length < 2) return null;
  let count: number;
  let offset: number;
  if (tx[0] & 0x80) {
    count = (tx[0] & 0x7f) | (tx[1] << 7);
    offset = 2;
  } else {
    count = tx[0];
    offset = 1;
  }
  if (count === 0 || tx.length < offset + 64) return null;
  return encodeBase58(tx.slice(offset, offset + 64));
}
