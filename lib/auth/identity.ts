/**
 * Wallet-name resolution — address → the owner's declared display name
 * (.eth / basename via ensdata, .sol via the SNS proxy). Pure helpers
 * here; the network call lives in /api/identity/resolve so a resolver
 * outage can never surface inside a client hook.
 */

export type WalletKind = 'evm' | 'sol';

export function walletKind(address: string): WalletKind | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'sol';
  return null;
}

/** Display fallback while (or if) a name never resolves. */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

/** ensdata returns `ens_primary` (the reverse record) with `ens` as fallback. */
export function ensName(payload: unknown): string | null {
  const p = payload as { ens_primary?: unknown; ens?: unknown } | null;
  const name = p?.ens_primary ?? p?.ens;
  return typeof name === 'string' && name.includes('.') ? name : null;
}

/** The SNS proxy wraps results as { s: 'ok'|'error', result: ... }; the
   primary-domain result may be a bare string or an object carrying it.
   Names come back TLD-less — the house speaks in .sol. */
export function snsName(payload: unknown): string | null {
  const p = payload as { s?: unknown; result?: unknown } | null;
  if (p?.s !== 'ok') return null;
  const r = p.result;
  const raw =
    typeof r === 'string' ? r
    : typeof (r as { domainName?: unknown })?.domainName === 'string' ? (r as { domainName: string }).domainName
    : typeof (r as { reverse?: unknown })?.reverse === 'string' ? (r as { reverse: string }).reverse
    : null;
  if (!raw) return null;
  return raw.includes('.') ? raw : `${raw}.sol`;
}
