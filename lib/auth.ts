import type { NextRequest } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

/**
 * Account-tier verification. Optional: when PRIVY_APP_ID/SECRET are unset the
 * desk runs anonymously and these helpers return null rather than failing.
 * Auth never gates the paper desk — it binds identity to sessions and records.
 */

let client: PrivyClient | null | undefined;

function getClient(): PrivyClient | null {
  if (client === undefined) {
    const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const secret = process.env.PRIVY_APP_SECRET;
    client = appId && secret ? new PrivyClient(appId, secret) : null;
  }
  return client;
}

export function accountsEnabled(): boolean {
  return getClient() !== null;
}

/**
 * Returns the verified Privy user id when the request carries a valid
 * `Authorization: Bearer <privy-token>`; null when absent or invalid.
 * Throws 'invalid_token' for a present-but-rejected token so routes can 401.
 */
export async function accountFromRequest(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const c = getClient();
  if (!c) throw new Error('invalid_token'); // tokens can't be verified without config
  try {
    const claims = await c.verifyAuthToken(header.slice(7));
    return claims.userId ?? null;
  } catch {
    throw new Error('invalid_token');
  }
}
