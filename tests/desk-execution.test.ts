import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyExecutionError } from '../lib/trading/useDeskExecution';

describe('desk execution failures stay distinct', () => {
  it('names the disconnected wallet, not a generic submit miss', () => {
    assert.equal(classifyExecutionError(new Error('Wallet not connected.')), 'disconnected');
  });
  it('names the wrong network', () => {
    assert.equal(classifyExecutionError(new Error('not on Base')), 'wrong_network');
  });
  it('names insufficient funds', () => {
    assert.equal(classifyExecutionError(new Error('insufficient funds for gas')), 'insufficient_funds');
  });
  it('names a declined signature', () => {
    assert.equal(classifyExecutionError(new Error('User denied the request')), 'rejected');
  });
  it('names unavailable gas estimation', () => {
    assert.equal(classifyExecutionError(new Error('gas estimation failed')), 'gas_unavailable');
  });
  it('names an RPC drop', () => {
    assert.equal(classifyExecutionError(new Error('RPC timeout')), 'rpc_failed');
  });
  it('falls back to a submit failure only when nothing else matches', () => {
    assert.equal(classifyExecutionError(new Error('something unexpected')), 'submit_failed');
  });
});
