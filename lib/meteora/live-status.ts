/**
 * The runtime status endpoint is the only authority for the live launch
 * path. A 200 with enabled:true opens it; the endpoint answers 403 with
 * { enabled: false } when deliberately closed; anything else — malformed
 * body, other status, a failed fetch — is 'unavailable', which fails
 * closed to paper but is worth a retry affordance.
 */
export type HalleyLiveStatus = 'checking' | 'enabled' | 'disabled' | 'unavailable';

export function liveStatusFromResponse(
  status: number,
  body: { enabled?: boolean } | null,
): 'enabled' | 'disabled' | 'unavailable' {
  if (status === 200 && body?.enabled === true) return 'enabled';
  if (status === 403 || (status === 200 && body?.enabled === false)) return 'disabled';
  return 'unavailable';
}

export type HalleyLivePhase =
  | 'idle'
  | 'connecting'
  | 'preparing'
  | 'review'
  | 'signing'
  | 'submitting'
  | 'confirmed'
  | 'partial'
  | 'failed'
  | 'unknown';

export function canPrepareHalleyLaunch(
  phase: HalleyLivePhase,
  intentAvailable: boolean,
  stale: boolean,
  accountPresent: boolean,
  attested: boolean,
  proposalBound = false,
): boolean {
  if (phase !== 'idle' && phase !== 'review' && phase !== 'failed') return false;
  if (phase === 'review' && proposalBound) return false;
  return intentAvailable && !stale && accountPresent && attested;
}

export interface HalleyIntentShape {
  name: string;
  symbol: string;
  anchorSymbol: string | null;
  quoteSymbol: string;
  curve: string;
  supply: string;
  graduationQuote: string;
}

export function halleyLiveIntentEquals(a: HalleyIntentShape, b: HalleyIntentShape): boolean {
  return a.name === b.name
    && a.symbol === b.symbol
    && a.anchorSymbol === b.anchorSymbol
    && a.quoteSymbol === b.quoteSymbol
    && a.curve === b.curve
    && a.supply === b.supply
    && a.graduationQuote === b.graduationQuote;
}

export function halleyLiveIntent(
  chosen: 'paper' | 'live' | null,
  status: HalleyLiveStatus,
  wasEnabled: boolean,
): boolean {
  if (chosen === 'live') return true;
  if (chosen === 'paper') return false;
  return status === 'enabled' || wasEnabled;
}

export function halleyProposalBound(
  proposal: { revision: number; wallet: string; intent: HalleyIntentShape } | null,
  revision: number,
  intent: HalleyIntentShape | null,
  account: string | null,
): boolean {
  return proposal !== null
    && intent !== null
    && account !== null
    && proposal.revision === revision
    && proposal.wallet === account
    && halleyLiveIntentEquals(proposal.intent, intent);
}

export function halleySubmitOutcome(ok: boolean, status: unknown): 'confirmed' | 'partial' | 'failed' | 'unknown' {
  if (!ok) return 'unknown';
  if (status === 'confirmed' || status === 'partial' || status === 'failed') return status;
  return 'unknown';
}

export function halleyLiveRecordHeading(phase: HalleyLivePhase): string | null {
  if (phase === 'partial') return 'Config only — pool not confirmed';
  if (phase === 'unknown' || phase === 'submitting' || phase === 'signing') return 'Pending chain check';
  if (phase === 'failed') return 'Checked — launch failed';
  return null;
}
