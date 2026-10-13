import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HalleyLaunchCard, nudgeFor, roundGraduation, tickerFromName } from '../components/desk/HalleyLaunchCard';
import type { HalleyDraft } from '../lib/meteora/contracts';

const blank: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => {};
const card = (draft: HalleyDraft, extra: Partial<Parameters<typeof HalleyLaunchCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(HalleyLaunchCard, {
    draft, anchorMarkUsd: null, busy: false, canDraw: false, primaryLabel: 'See your paper launch',
    onEdit: noop, onDraw: noop, onCustomise: noop, voiceLines: ['launch an NVIDIA tracker'], onSay: noop,
    ...extra,
  }));

describe('the launch card', () => {
  it('pencils a ticker from the name the way a person would', () => {
    assert.equal(tickerFromName('Basilisk'), 'BASILISK');
    assert.equal(tickerFromName('Comet Tracker'), 'COMET');
    assert.equal(tickerFromName('AI fund'), 'AIFUND', 'a short first word joins the rest');
    assert.equal(tickerFromName('Supercalifragilistic'), 'SUPERCALIF', 'ten characters at most');
    assert.equal(tickerFromName('!'), null);
    assert.equal(tickerFromName('x'), null, 'two characters at least');
  });

  it('rounds a dragged graduation to a number someone would say', () => {
    assert.equal(roundGraduation(1234.56), '1235');
    assert.equal(roundGraduation(12.345), '12.3');
    assert.equal(roundGraduation(0.456), '0.46');
  });

  it('names the one thing still between the caller and the launch', () => {
    assert.match(nudgeFor(blank, false), /Name it and pick what it tracks/);
    assert.match(nudgeFor({ ...blank, name: 'Basilisk', symbol: 'BASILISK' }, false), /Pick what it tracks/);
    assert.match(nudgeFor({ ...blank, name: 'x' }, true), /two letters or more/);
  });

  it('a blank card asks two plain questions and shows no jargon', () => {
    const out = text(card(blank));
    assert.match(out, /Name your tracker/);
    assert.match(out, /What does it track\?/);
    for (const name of ['Apple', 'NVIDIA', 'Tesla', 'Nothing']) assert.match(out, new RegExp(name));
    assert.match(out, /Customise/);
    assert.match(out, /launch an NVIDIA tracker/, 'voice stays one row away');
    /* The card never asks the caller to know the venue's vocabulary. */
    assert.doesNotMatch(out, /quote asset|graduation line|DAMM|DBC|anchor/i);
    /* No curve until there is something to draw. */
    assert.doesNotMatch(card(blank), /svg/);
  });

  it('once it tracks something, the curve appears with the terms in plain words', () => {
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'NVDA', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' };
    const html = card(draft, { anchorMarkUsd: 227.16, canDraw: true });
    const out = text(html);
    assert.match(out, /\$BASILISK/);
    assert.match(out, /\$227\.16/, 'the chosen tile shows its live mark');
    assert.match(out, /Paid in USDC · 1,000,000 tokens · starts at NVIDIA’s price/);
    assert.match(html, /<svg/);
    assert.match(html, /aria-pressed="true"[^>]*><strong>NVIDIA/);
    assert.doesNotMatch(out, /Name it|Pick what it tracks/, 'no nudge once it can launch');
  });

  it('the surface mounts the after-filing pieces lazily and once per filing', () => {
    const surface = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    for (const name of ['HalleyWatch', 'HalleyShareCard', 'HalleyLaunchCelebration']) {
      assert.match(surface, new RegExp(`const ${name} = dynamic\\(\\(\\) => import\\('\\./${name}'\\)`), name);
    }
    assert.match(surface, /<HalleyLaunchCelebration key=\{estimate\.id\} symbol=\{estimate\.intent\.symbol\} \/>/);
    assert.match(surface, /<HalleyWatch record=\{filedRecord\} \/>/);
    assert.match(surface, /<summary>Share launch<\/summary>\s*<HalleyShareCard record=\{filedRecord\} \/>/);
    assert.match(surface, /halley\.records\.find\(record => record\.id === estimate\.id\)/);
  });
});
