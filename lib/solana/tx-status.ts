/**
 * On-chain signature reconciliation — the durable answer to "what happened
 * to that order?" Reads getSignatureStatuses with searchTransactionHistory
 * so a signature stays findable after the short proposal TTL lapses and
 * after a full browser reload.
 *
 * Never import this from a client module: it speaks RPC and reads
 * deployment configuration.
 */

export type SignatureStatus = 'confirmed' | 'finalized' | 'failed' | 'notFound' | 'unreadable';

export interface SignatureCheck {
  signature: string;
  status: SignatureStatus;
}

interface RpcEnvelope {
  result?: unknown;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Parse getSignatureStatuses into one check per requested signature.
 * A null slot is "not found" — honest, distinct from malformed.
 */
export function parseSignatureStatusesResult(body: unknown, signatures: string[]): SignatureCheck[] {
  const result = (body as RpcEnvelope)?.result;
  const value = (result as { value?: unknown } | null)?.value;
  if (!Array.isArray(value) || value.length !== signatures.length) {
    return signatures.map(signature => ({ signature, status: 'unreadable' }));
  }
  return signatures.map((signature, i) => {
    const entry = value[i];
    if (entry === null) return { signature, status: 'notFound' };
    if (typeof entry !== 'object') return { signature, status: 'unreadable' };
    const err = (entry as { err?: unknown }).err;
    if (err !== null && err !== undefined) return { signature, status: 'failed' };
    const conf = (entry as { confirmationStatus?: unknown }).confirmationStatus;
    if (conf === 'finalized') return { signature, status: 'finalized' };
    if (conf === 'confirmed' || conf === 'processed') return { signature, status: 'confirmed' };
    return { signature, status: 'unreadable' };
  });
}

/** Batch status read — one call for every pending signature the wallet holds. */
export async function readSignatureStatuses({
  rpcUrl,
  signatures,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: {
  rpcUrl: string;
  signatures: string[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<{ checks: SignatureCheck[]; ok: boolean }> {
  if (signatures.length === 0) return { checks: [], ok: true };
  let body: unknown;
  try {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [signatures, { searchTransactionHistory: true }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { checks: [], ok: false };
    body = await res.json();
  } catch {
    return { checks: [], ok: false };
  }
  return { checks: parseSignatureStatusesResult(body, signatures), ok: true };
}
