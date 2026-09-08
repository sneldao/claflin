import { ethers } from 'ethers';
import { baseRpcCandidates, BASE } from './trading/aerodrome';

/**
 * Coinbase Verifications — onchain eligibility via EAS attestations on Base.
 *
 * A wallet is eligible for the live desk when it holds Coinbase's onchain
 * "Verified Account" attestation AND a "Verified Country" attestation whose
 * country code is not US/US-territory (Reg-S posture). Both are issued only
 * by Coinbase's permissioned attester and are revocable — we verify onchain,
 * never from a cached or client-supplied claim.
 *
 * This is an *eligibility signal*, not a legal determination: Coinbase's own
 * terms govern who may hold the products; the desk surfaces the attestation
 * honestly and refuses when it cannot verify.
 */

export const EAS_BASE = '0x4200000000000000000000000000000000000021' as const;
export const COINBASE_INDEXER = '0x2c7eE1E5f416dfF40054c27A62f7B357C4E8619C' as const;
export const COINBASE_ATTESTER = '0x357458739F90461b99789350868CD7CF330Dd7EE' as const;

export const SCHEMA_VERIFIED_ACCOUNT = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9' as const;
export const SCHEMA_VERIFIED_COUNTRY = '0x1801901fabd0e6189356b4fb52bb0ab855276d84f7ec140839fbd1f6801ca065' as const;

/** US + territories — conservative Reg-S exclusion. */
export const RESTRICTED_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP']);

const INDEXER_ABI = ['function getAttestationUid(address recipient, bytes32 schemaUid) view returns (bytes32)'];
const EAS_ABI = [
  'function getAttestation(bytes32 uid) view returns (tuple(bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))',
];

const ZERO_UID = '0x' + '0'.repeat(64);

export interface EligibilityResult {
  eligible: boolean;
  accountVerified: boolean;
  country: string | null;
  countryVerified: boolean;
  reason: string | null;
}

async function latestAttestation(address: string, schemaUid: string) {
  const candidateUrls = baseRpcCandidates();
  let lastError: unknown = null;
  for (const rpcUrl of candidateUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, BASE, { staticNetwork: true });
      const indexer = new ethers.Contract(COINBASE_INDEXER, INDEXER_ABI, provider);
      const uid: string = await indexer.getAttestationUid(address, schemaUid);
      if (uid === ZERO_UID) return null;
      const eas = new ethers.Contract(EAS_BASE, EAS_ABI, provider);
      const att = await eas.getAttestation(uid);
      if (att.revocationTime !== 0n) return null;
      if (att.recipient.toLowerCase() !== address.toLowerCase()) return null;
      if (att.attester.toLowerCase() !== COINBASE_ATTESTER.toLowerCase()) return null;
      return att;
    } catch (e) { lastError = e; }
  }
  throw lastError ?? new Error('eligibility_unavailable');
}

/** Check whether an address holds a live Coinbase Verified Account + eligible country attestation. */
export async function checkEligibility(address: string): Promise<EligibilityResult> {
  if (!ethers.isAddress(address)) {
    return { eligible: false, accountVerified: false, country: null, countryVerified: false, reason: 'invalid_address' };
  }
  const account = await latestAttestation(address, SCHEMA_VERIFIED_ACCOUNT).catch(() => null);
  const accountVerified = Boolean(account);
  if (!accountVerified) {
    return { eligible: false, accountVerified, country: null, countryVerified: false, reason: 'no_verified_account_attestation' };
  }
  const countryAtt = await latestAttestation(address, SCHEMA_VERIFIED_COUNTRY).catch(() => null);
  if (!countryAtt) {
    return { eligible: false, accountVerified, country: null, countryVerified: false, reason: 'no_country_attestation' };
  }
  let country: string | null = null;
  try {
    const [decoded] = ethers.AbiCoder.defaultAbiCoder().decode(['string'], countryAtt.data);
    country = String(decoded).toUpperCase();
  } catch {
    return { eligible: false, accountVerified, country: null, countryVerified: false, reason: 'country_attestation_undecodable' };
  }
  const countryVerified = true;
  if (RESTRICTED_COUNTRIES.has(country)) {
    return { eligible: false, accountVerified, country, countryVerified, reason: 'restricted_jurisdiction' };
  }
  return { eligible: true, accountVerified, country, countryVerified, reason: null };
}
