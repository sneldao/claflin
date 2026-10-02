import { test, describe } from 'node:test';
import assert from 'node:assert';
import { checkEligibility, RESTRICTED_COUNTRIES, SCHEMA_VERIFIED_ACCOUNT, SCHEMA_VERIFIED_COUNTRY } from '../lib/eligibility';
import { eligibilityLine } from '../lib/trading/useEligibility';

describe('eligibility — Coinbase Verifications on Base', () => {
  test('restricted set covers US and territories for Reg-S posture', () => {
    for (const code of ['US', 'PR', 'GU', 'VI', 'AS', 'MP']) assert.ok(RESTRICTED_COUNTRIES.has(code));
    assert.ok(!RESTRICTED_COUNTRIES.has('GB'));
  });

  test('rejects a malformed address without touching the chain', async () => {
    const result = await checkEligibility('not-an-address');
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.reason, 'invalid_address');
  });

  test('schema constants are the documented Coinbase Verifications UIDs', () => {
    assert.match(SCHEMA_VERIFIED_ACCOUNT, /^0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9$/);
    assert.match(SCHEMA_VERIFIED_COUNTRY, /^0x1801901fabd0e6189356b4fb52bb0ab855276d84f7ec140839fbd1f6801ca065$/);
  });
});

describe('eligibilityLine — honest live-path copy', () => {
  test('a verified wallet reads ok and names what attested it', () => {
    const line = eligibilityLine({ stage: 'done', eligible: true, country: 'DE', reason: null });
    assert.strictEqual(line.marker, 'ok');
    assert.match(line.detail, /Verified Account/);
  });

  test('a restricted country is terminal — no verify or retry path offered', () => {
    const line = eligibilityLine({ stage: 'done', eligible: false, country: 'US', reason: 'restricted_jurisdiction' });
    assert.strictEqual(line.marker, 'needed');
    assert.strictEqual(line.action, 'none');
    assert.match(line.detail, /excluded/);
    assert.match(line.detail, /\(US\)/);
  });

  test('a missing account attestation names the path — verify with the issuer', () => {
    const line = eligibilityLine({ stage: 'done', eligible: false, country: null, reason: 'no_verified_account_attestation' });
    assert.strictEqual(line.action, 'verify');
    assert.match(line.detail, /issuer/);
  });

  test('an unreadable check offers retry, not a silent dead end', () => {
    const line = eligibilityLine({ stage: 'done', eligible: false, country: null, reason: 'check_unavailable' });
    assert.strictEqual(line.action, 'retry');
  });

  test('non-terminal stages stay unknown, never claim eligibility', () => {
    for (const stage of ['checking', 'signed_out', 'no_wallet', 'off'] as const) {
      const line = eligibilityLine({ stage });
      assert.strictEqual(line.marker, 'unknown');
      assert.strictEqual(line.action, 'none');
    }
  });
});
