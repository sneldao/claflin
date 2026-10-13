import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HalleyLaunchCard, echoFor, formatMove, nudgeFor, priceMoveFor, regionFor, roundGraduation, tickerFromName } from '../components/desk/HalleyLaunchCard';
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

  it('says plainly when an anchored launch barely moves, and stays quiet when it does', () => {
    /* raised ÷ market cap: 150 USDC against 1M × $227 is a vanishing move. */
    assert.ok(Math.abs(priceMoveFor(227.16, 1_000_000, 150)! - 150 / 227_160_000) < 1e-15);
    assert.equal(priceMoveFor(null, 1_000_000, 150), null, 'no opening price, no claim');
    assert.equal(formatMove(150 / 227_160_000), 'under 0.01%');
    assert.equal(formatMove(0.0005), '+0.05%');
    assert.equal(formatMove(0.05), '+5.0%');
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'NVDA', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' };
    assert.match(text(card(draft, { anchorMarkUsd: 227.16, canDraw: true })), /barely moves \(under 0\.01%\)/);
    /* Unanchored opens at 1.0: 150 raised on 100 tokens is a real move — no note. */
    const steep = { ...draft, anchorSymbol: null, supply: '100' };
    assert.doesNotMatch(text(card(steep, { canDraw: true })), /barely moves/);
  });

  it('knows which part of the card answers each write and each explanation', () => {
    assert.equal(regionFor(null, true), null);
    assert.equal(regionFor({ said: ['name', 'symbol'], at: 1 }, false), 'name');
    assert.equal(regionFor({ said: ['anchorSymbol'], at: 1 }, true), 'tiles');
    assert.equal(regionFor({ said: ['graduationQuote'], at: 1 }, true), 'preview');
    assert.equal(regionFor({ said: ['supply'], at: 1 }, false), 'tiles', 'no curve yet — the tiles answer for it');
    /* Halley's explanation targets point into the slip; the card reads them. */
    assert.equal(regionFor({ target: 'halley-step-2', at: 1 }, true), 'tiles');
    assert.equal(regionFor({ target: 'halley-step-3', at: 1 }, true), 'preview');
    assert.equal(regionFor({ target: 'halley-grad', at: 1 }, true), 'preview');
    assert.equal(regionFor({ target: 'halley-what-launch', at: 1 }, true), null, 'exists on both surfaces already');
  });

  it('says what Halley just did in one plain line', () => {
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'TSLA', quoteSymbol: 'USDC', curve: 'flat', supply: '2000000', graduationQuote: '300' };
    assert.equal(echoFor(['name', 'symbol'], draft), 'Halley named it Basilisk ($BASILISK).');
    assert.equal(echoFor(['anchorSymbol'], draft), 'Halley set it to track Tesla.');
    assert.equal(echoFor(['anchorSymbol'], { ...draft, anchorSymbol: null }), 'Halley set it to track nothing — it opens at 1.0.');
    assert.equal(echoFor(['curve'], draft), 'Halley chose the flat curve.');
    assert.equal(echoFor(['supply'], draft), 'Halley set 2,000,000 tokens.');
    assert.equal(echoFor(['graduationQuote'], draft), 'Halley moved the open-market line to 300 USDC.');
    assert.equal(echoFor(undefined, draft), null);
  });

  it('answers a spoken write: a pulse on the touched part and an echo line', () => {
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'TSLA', quoteSymbol: 'USDC', supply: '1000000', graduationQuote: '150' };
    const html = card(draft, { canDraw: true, heard: { said: ['anchorSymbol'], at: 42 } });
    /* Exactly one pulse, inside the tiles. */
    assert.equal((html.match(/class="[^"]*heard[^"]*"/g) ?? []).length, 1);
    assert.match(html, /data-region="tiles"[^>]*><span class="[^"]*heard/);
    assert.match(html, /role="status" aria-live="polite" data-heard="true"[^>]*><span>Halley set it to track Tesla\.<\/span>/);
    /* Nothing heard, nothing pulses — the echo line stays mounted but empty. */
    const quiet = card(draft, { canDraw: true });
    assert.doesNotMatch(quiet, /class="[^"]*heard[^"]*"/);
    assert.match(quiet, /data-heard="false"[^>]*><\/p>/);
  });

  it('answers a refusal too — amber pulse, note in the echo, no invented write', () => {
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'TSLA', quoteSymbol: 'USDC' };
    const refused = card(draft, {
      canDraw: true,
      heard: { kind: 'refused', said: ['anchorSymbol'], note: '“GameStop” isn’t an anchor on this desk.', at: 7 },
    });
    /* One pulse, in the tiles, in the refused tone — and the echo carries her no. */
    assert.equal((refused.match(/class="[^"]*heard[^"]*"/g) ?? []).length, 1);
    assert.match(refused, /class="heard heardRefused"/);
    assert.match(refused, /data-heard="true" data-refused="true"[^>]*><span>“GameStop” isn’t an anchor on this desk\.<\/span>/);
    /* The draft is untouched — a refusal never rewrites what the card shows. */
    assert.doesNotMatch(refused, /Halley set it/);
  });

  it('breathes while the line is deciding, and shows the wash while the curve is drawn', () => {
    const draft: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK', anchorSymbol: 'TSLA', quoteSymbol: 'USDC' };
    const waiting = card(draft, { canDraw: true, awaiting: true });
    assert.match(waiting, /data-awaiting="true"/);
    assert.match(waiting, /class="awaiting" aria-hidden="true">· · ·/);
    /* A fresh echo outranks the cue — nothing breathes over an answer. */
    const answered = card(draft, { canDraw: true, awaiting: true, heard: { said: ['anchorSymbol'], at: 9 } });
    assert.match(answered, /data-awaiting="false"/);
    const anticipating = card(draft, { canDraw: true, anticipating: true });
    assert.match(anticipating, /data-region="preview"[^>]*data-anticipate="true"/);
    assert.doesNotMatch(card(draft, { canDraw: true }), /data-anticipate="true"/);
    /* Reduced motion: the cue goes still, the final state identical. */
    const css = readFileSync(new URL('../components/desk/HalleyLaunchCard.module.css', import.meta.url), 'utf8');
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reduced, /\.card\[data-awaiting='true'\] \{ animation: none/);
  });

  it('docks the live call on a phone so the card stays in view', () => {
    const call = readFileSync(new URL('../components/desk/HalleyCall.tsx', import.meta.url), 'utf8');
    assert.match(call, /id="halley-line"[^>]*className=\{styles\.call\}[^>]*data-dock="true"/);
    const css = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 760px\) \{\s*\.call\[data-dock='true'\]\[data-live='true'\] \{\s*position: fixed; top: 0;/);
    const cardCss = readFileSync(new URL('../components/desk/HalleyLaunchCard.module.css', import.meta.url), 'utf8');
    assert.match(cardCss, /scroll-margin-top: var\(--call-dock/);
    assert.match(cardCss, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.heard \{ animation: heardHold/s);
    const surface = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(surface, /heard=\{cardHeard\}/);
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
