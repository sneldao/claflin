import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LastCallFold, LineCaptions, hasDiscussion } from '../components/desk/BrokerLine';
import { isSpokenTurn, spokenText } from '../lib/desk/caption-text';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const PANELS = ['HalleyCall', 'HettyCallSession', 'JesseCall', 'JesseCallAssemblyAI', 'TennieCall'];

describe('the slip is one column of sections', () => {
  it('never puts the section folds in the house label/control grid', () => {
    const surface = read('components/desk/HalleyDeskSurface.tsx');
    /* The bug: each <details> became one `.fields` grid cell — a section in
       the 100px label column beside a closed one. */
    assert.doesNotMatch(surface, /className=\{styles\.fields\}/);
    assert.match(surface, /className=\{plate\.slipStack\}/);
    const css = read('components/desk/HalleyPlate.module.css');
    assert.match(css, /\.slipStack \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.slipStack details > label/);
  });
});

describe('a blank slip is voice-first', () => {
  const surface = read('components/desk/HalleyDeskSurface.tsx');

  it('leads with the launch card; the full slip is Customise, with a way back', () => {
    assert.match(surface, /const showSlip = customising;/);
    assert.match(surface, /\{!showSlip && \(\s*<HalleyLaunchCard/);
    assert.match(surface, /onCustomise=\{\(\) => setCustomising\(true\)\}/);
    assert.match(surface, /\{showSlip && <>\s*<button[^>]*onClick=\{\(\) => setCustomising\(false\)\}>← Simple view<\/button>\s*<div className=\{plate\.slipStack\}/);
    assert.match(surface, /\{showSlip && <div className=\{plate\.stickyCta\}>/);
    /* The old blank lead is gone — the card is the blank state. */
    assert.doesNotMatch(surface, /id="halley-lead"/);
  });

  it('never tallies what is missing before the caller has started', () => {
    assert.match(surface, /\{!complete && !blank && halley\.state\.stage === 'draft' && <span aria-hidden="true"> · \{missing\.length\} left<\/span>\}/);
    assert.match(surface, /\{!complete && !blank && <p id="halley-needed"/);
  });

  it('uses placeholders that cannot be mistaken for values', () => {
    assert.match(surface, /placeholder="e\.g\. Comet Tracker"/);
    assert.match(surface, /placeholder="e\.g\. COMET"/);
    assert.doesNotMatch(surface, /placeholder="NVDA(?:T| tracker)"/);
  });

  it('keeps the detail toggle out of the stage label', () => {
    assert.match(surface, /<span className=\{styles\.paperNumber\}>\{stageLabel\(halley\.state\.stage\)\}<\/span>/);
    assert.match(surface, /Detail · \{density === 'full' \? 'full' : 'brief'\}/);
  });

  it('gives the hearables dark ink on paper, light ink on the board', () => {
    const css = read('components/desk/WorkingDesk.module.css');
    assert.match(css, /\.ticket \.blotterLine \{ color: var\(--desk-paper-ink\); \}/);
    assert.match(css, /^\.blotterLine \{[^}]*color: var\(--desk-paper-light\)/m);
  });
});

describe('the line speaks plainly between calls', () => {
  it('strips delivery cues and recognises a pause as no words', () => {
    assert.equal(spokenText('[slow] At this desk, the quote must be USDC.'), 'At this desk, the quote must be USDC.');
    assert.equal(spokenText('[sad] Are you still there?'), 'Are you still there?');
    assert.equal(spokenText('Ticker [NVDA] stays'), 'Ticker stays');
    assert.ok(!isSpokenTurn('...'));
    assert.ok(!isSpokenTurn('[sigh]'));
    assert.ok(isSpokenTurn('Yes, anchor it.'));
  });

  it('never renders a cue on the live tape or in the fold', () => {
    const captions = [
      { role: 'agent' as const, text: '[slow] Quoted in NVDAx.', at: 1 },
      { role: 'user' as const, text: 'Anchor it.', at: 2 },
    ];
    const out = text(renderToStaticMarkup(createElement(LineCaptions, { captions, brokerName: 'Halley', applied: null })));
    assert.doesNotMatch(out, /\[slow\]/);
    assert.match(out, /Quoted in NVDAx\./);
  });

  it('treats a call where the caller never spoke as no thread at all', () => {
    const silent = [
      { role: 'agent' as const, text: 'Claflin, Halley speaking.', at: 1 },
      { role: 'user' as const, text: '...', at: 2 },
      { role: 'agent' as const, text: '[sad] Are you still there?', at: 3 },
    ];
    assert.ok(!hasDiscussion(silent));
    assert.equal(renderToStaticMarkup(createElement(LastCallFold, { captions: silent, brokerName: 'Halley' })), '');
    const real = [...silent, { role: 'user' as const, text: 'Launch NVIDIA.', at: 4 }];
    assert.ok(hasDiscussion(real));
    const out = text(renderToStaticMarkup(createElement(LastCallFold, { captions: real, brokerName: 'Halley' })));
    assert.match(out, /Last call · 3 lines/, 'the pause is not counted as a line');
    assert.doesNotMatch(out, /\[sad\]/);
  });

  it('every panel: two choices between calls, one line of memory, no cue in storage', () => {
    for (const panel of PANELS) {
      const source = read(`components/desk/${panel}.tsx`);
      assert.doesNotMatch(source, /Start fresh/, `${panel} still offers three choices`);
      assert.doesNotMatch(source, /Ring fresh/, panel);
      assert.match(source, />\s*New call\s*</, panel);
      assert.match(source, /hasDiscussion\(captions\) && \(/, panel);
      assert.match(source, /\{live && \(lastUser \|\| lastAgent \|\| applied\) && \(/, `${panel} shows the live tape between calls`);
      assert.match(source, /<LastCallFold captions=\{captions\}/, panel);
      assert.match(source, /text: spokenText\((?:text|clean)\)\.slice/, panel);
    }
  });
});

describe('the plate says each thing once', () => {
  it('drops its legal stamp and becomes one line on a phone', () => {
    const plate = read('components/desk/HalleyPlate.tsx');
    assert.doesNotMatch(plate, /className=\{styles\.stamp\}/);
    assert.match(plate, /<span className=\{styles\.stepDetail\}>\{detail\}<\/span>/);
    const css = read('components/desk/HalleyPlate.module.css');
    assert.match(css, /\.step:not\(\[data-state='current'\]\) \{ display: none; \}/);
  });
});
