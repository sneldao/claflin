import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensName, snsName, truncateAddress, walletKind } from '../lib/auth/identity';

describe('wallet identity', () => {
  it('classifies addresses by shape — evm, sol, or neither', () => {
    assert.equal(walletKind('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), 'evm');
    assert.equal(walletKind('36Dn3RWhB8x4c83W6ebQ2C2eH9sh5bQX2nMdkP2cWaA4'), 'sol');
    assert.equal(walletKind('papajams.eth'), null);
    assert.equal(walletKind('0x1234'), null);
    assert.equal(walletKind(''), null);
  });

  it('truncates a raw address for the unresolved label', () => {
    assert.equal(
      truncateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      '0xd8d…6045',
    );
    assert.equal(truncateAddress('short'), 'short');
  });

  it('reads the reverse record from an ensdata payload', () => {
    assert.equal(ensName({ ens_primary: 'vitalik.eth', ens: 'vitalik.eth' }), 'vitalik.eth');
    assert.equal(ensName({ ens: 'fallback.eth' }), 'fallback.eth');
    assert.equal(ensName({ ens: null }), null);
    assert.equal(ensName({}), null);
    assert.equal(ensName('vitalik.eth'), null);
  });

  it('unwraps the SNS proxy envelope and speaks in .sol', () => {
    assert.equal(snsName({ s: 'ok', result: 'bonfida' }), 'bonfida.sol');
    assert.equal(snsName({ s: 'ok', result: { domainName: 'toly' } }), 'toly.sol');
    assert.equal(snsName({ s: 'ok', result: { domainName: 'toly.sns' } }), 'toly.sns');
    assert.equal(snsName({ s: 'ok', result: null }), null);
    assert.equal(snsName({ s: 'error', result: 'nope' }), null);
    assert.equal(snsName(null), null);
  });
});
