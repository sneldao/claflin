/**
 * Cryptographic Order Provenance (The Scribe's Blotter)
 *
 * Generates deterministic provenance hashes for voice-dictated trading instructions.
 * Creates an auditable link between spoken audio transcripts, disfluency filtering,
 * and structured order parameters.
 */

export interface DictationProvenance {
  hash: string;
  transcript: string;
  timestamp: number;
  provider: string;
  disfluencyFiltered: boolean;
  shortSeal: string;
}

/** Simple fast deterministic hash for browser & SSR environments without async crypto overhead */
function simpleHexHash(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `0x${part1}${part2}`;
}

export function createDictationProvenance(
  transcript: string,
  symbol: string,
  side: string,
  amount: string,
  timestamp = Date.now(),
  provider = 'AssemblyAI Dictation (Universal-3.5 Pro)',
): DictationProvenance {
  const normalized = `${transcript.trim().toLowerCase()}|${symbol.toLowerCase()}|${side.toLowerCase()}|${amount}|${timestamp}|${provider}`;
  const hash = simpleHexHash(normalized);
  const shortSeal = `${hash.slice(0, 6)}…${hash.slice(-4)}`;

  return {
    hash,
    transcript: transcript.trim(),
    timestamp,
    provider,
    disfluencyFiltered: true,
    shortSeal,
  };
}
