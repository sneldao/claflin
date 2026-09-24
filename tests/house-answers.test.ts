import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FOYER_ANSWERS } from '../lib/desk/foyer-answers';
import { HouseFoyer } from '../components/desk/HouseFoyer';

describe('straight answers and the desks', () => {
  it('answers the questions a caller actually has', () => {
    const questions = FOYER_ANSWERS.map(a => a.question);
    for (const q of ['Is this a real share?', 'Can I use this from the US?', 'What does it cost?', 'What if the token drifts from the stock?', 'Can the desk trade without me?', 'Where does my record live?', 'Am I talking to a person?']) {
      assert.ok(questions.includes(q), `answers “${q}”`);
    }
  });

  it('never promises what the build does not do', () => {
    const all = FOYER_ANSWERS.map(a => a.answer).join(' ');
    assert.match(all, /No signature, no trade\./);
    assert.match(all, /non-US persons only/);
    assert.doesNotMatch(all, /guarantee|risk-free|always the best price/i);
    assert.doesNotMatch(all, /another device/, 'local records are not promised across devices');
  });

  it('SSR paints the brokers as AI, with an attributed line, then the answers and a risk line', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.match(html, /id="house-desks"/);
    assert.match(html, /Meet the brokers\./);
    assert.match(html, /AI broker · Coinbase Tokenized Stocks · Base/);
    assert.match(html, /AI broker · Backed xStocks · Solana/);
    assert.match(html, /Named for Hetty Green \(1834–1916\)/);
    assert.match(html, /An AI character, not the historical person/);
    assert.match(html, /— Hetty Green/);
    assert.match(html, /id="house-answers"/);
    assert.match(html, /<details[^>]*><summary>Is this a real share\?<\/summary>/);
    assert.match(html, /Claflin is not a broker-dealer and gives no investment advice\./);
  });
});
