import { test, describe } from 'node:test';
import assert from 'node:assert';
import { checkEligibility, RESTRICTED_COUNTRIES, SCHEMA_VERIFIED_ACCOUNT, SCHEMA_VERIFIED_COUNTRY } from '../lib/eligibility';

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
