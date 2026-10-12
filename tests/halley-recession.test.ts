import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HalleyPlate } from '../components/desk/HalleyPlate';
import type { HalleyDraft } from '../lib/meteora/contracts';

/* Canon rule 6 / mode states: orientation is a pre-start surface. Once a
   draft carries intent, settled context recedes and only the open step and
   its one primary action stay lit. */

const blank: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};
const named: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK' };

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('settled context recedes once a draft begins', () => {
  it('the plate orients a blank caller in full', () => {
    const out = text(renderToStaticMarkup(createElement(HalleyPlate, { stage: 'draft', draft: blank, mode: 'live' })));
    assert.match(out, /The tape desks price existing tokens/);
    assert.match(out, /Pick a tracker name and symbol/);
    assert.match(out, /Choose what buyers pay with/);
  });

  it('the plate becomes wayfinding: detail only where the caller stands', () => {
    const html = renderToStaticMarkup(createElement(HalleyPlate, { stage: 'draft', draft: named, mode: 'live' }));
    const out = text(html);
    assert.doesNotMatch(out, /The tape desks price existing tokens/);
    assert.doesNotMatch(out, /Pick a tracker name and symbol/, 'a done step keeps its title, not its paragraph');
    assert.match(out, /Choose what buyers pay with/, 'the current step keeps its detail');
    assert.doesNotMatch(out, /Review the projected curve, then continue/, 'a step not yet reached stays a title');
    assert.equal((html.match(/Go to /g) ?? []).length, 2, 'no jump button to a step that cannot be reached yet');
    assert.match(out, /Name it and anchor it/);
    assert.match(out, /Review and sign with your wallet/);
  });

  it('the slip folds orientation and the settled path, and puts the wallet note under the one primary action', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /const started = !blank \|\| halley\.state\.stage !== 'draft'/);
    assert.match(source, /\{!started && productLine\}/);
    assert.match(source, /\{started && productLine\}/, 'the product line moves into its fold, never deleted');
    assert.match(source, /<summary>\{mode === 'live' \? 'Creating a real token' : 'Exploring on paper'\} · change path<\/summary>/);
    assert.match(source, /\{!started && preflight\}/);
    const cta = source.indexOf('Still needed:');
    const preflightAfter = source.indexOf('{started && preflight}');
    assert.ok(cta > 0 && preflightAfter > cta, 'the wallet note follows the primary action once work has begun');
  });

  it('call panels say each fact once: status names the state, the button names the action', () => {
    for (const panel of ['HalleyCall', 'HettyCallSession', 'JesseCall', 'JesseCallAssemblyAI', 'TennieCall']) {
      const source = readFileSync(new URL(`../components/desk/${panel}.tsx`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /Microphone on/, `${panel} repeats "Microphone on"`);
      assert.match(source, /'Unmute' : 'Mute'/, panel);
      assert.match(source, /'Listening'/, panel);
    }
  });
});
