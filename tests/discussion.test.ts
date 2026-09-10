import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalCssLoader = require.extensions['.css'];
require.extensions['.css'] = module => {
  module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
};
const { appendCaption, lastCaption, summarizeDiscussion } = require('../components/desk/HettyCall') as typeof import('../components/desk/HettyCall');
type Caption = { role: 'user' | 'agent'; text: string; at: number };
if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
else delete require.extensions['.css'];

function caption(role: Caption['role'], text: string, at = 1): Caption {
  return { role, text, at };
}

describe('discussion survives the voice connection', () => {
  it('appends newest-last and keeps the last exchange readable', () => {
    let captions: Caption[] = [];
    captions = appendCaption(captions, caption('user', 'Buy NVIDIA for 25 USDC', 1));
    captions = appendCaption(captions, caption('agent', 'On the ticket.', 2));
    assert.equal(captions.length, 2);
    assert.equal(lastCaption(captions, 'user')?.text, 'Buy NVIDIA for 25 USDC');
    assert.equal(lastCaption(captions, 'agent')?.text, 'On the ticket.');
    const summary = summarizeDiscussion(captions);
    assert.ok(summary?.includes('Buy NVIDIA for 25 USDC'));
    assert.ok(summary?.includes('The ticket holds the instruction'));
  });
  it('returns null sides and summary when nothing has been said', () => {
    assert.equal(lastCaption([], 'user'), null);
    assert.equal(summarizeDiscussion([]), null);
  });
  it('bounds the store so a long call cannot grow it without limit', () => {
    let captions: Caption[] = [];
    for (let i = 0; i < 60; i++) captions = appendCaption(captions, caption(i % 2 ? 'agent' : 'user', `line ${i}`, i));
    assert.equal(captions.length, 50);
    assert.equal(captions[captions.length - 1].text, 'line 59');
  });
});
