import { ensName, snsName, walletKind } from '@/lib/auth/identity';

export const dynamic = 'force-dynamic';

/* Names rarely change — hold them. A miss is often a cold resolver, so a
   negative result expires fast instead of pinning a failure for 10 min. */
const NAME_TTL_MS = 10 * 60_000;
const MISS_TTL_MS = 30_000;
const cache = new Map<string, { name: string | null; at: number }>();

async function lookup(kind: 'evm' | 'sol', address: string): Promise<string | null> {
  const url =
    kind === 'evm'
      ? `https://api.ensdata.net/${address}`
      : `https://sdk-proxy-v2.sns.id/primary-domain/${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 0 } });
  if (!res.ok) return null;
  const payload: unknown = await res.json();
  return kind === 'evm' ? ensName(payload) : snsName(payload);
}

/**
 * GET /api/identity/resolve?address=<wallet>
 * Resolves a wallet's declared display name (ENS/basename or SNS primary
 * domain). Returns { name: null } rather than an error — the label is
 * cosmetic and must never break sign-in.
 */
export async function GET(req: Request): Promise<Response> {
  const address = new URL(req.url).searchParams.get('address') ?? '';
  const kind = walletKind(address);
  if (!kind) return Response.json({ name: null }, { headers: { 'Cache-Control': 'no-store' } });

  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < (hit.name ? NAME_TTL_MS : MISS_TTL_MS)) {
    return Response.json({ name: hit.name }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let name: string | null = null;
  try {
    name = await lookup(kind, address);
  } catch {
    name = null;
  }
  cache.set(address, { name, at: Date.now() });
  return Response.json({ name }, { headers: { 'Cache-Control': 'no-store' } });
}
