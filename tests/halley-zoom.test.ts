import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DETAIL_DENSITY_STORAGE_KEY,
  loadDetailDensity,
  parseDetailDensity,
  saveDetailDensity,
} from '../lib/desk/detail-density';
import { halleyRevealTargetForTopic } from '../lib/meteora/voice-tools';

/* Phase 5–4: the desk's semantic zoom. One saved preference opens folded
   detail by default, explanations open the section they describe, the
   slip's one-liner morphs into the review's headline, and a small screen
   gets the call as a pill instead of a wall. */

describe('the detail-density preference', () => {
  it('is brief unless the caller chose full, and survives bad storage', () => {
    assert.equal(parseDetailDensity('full'), 'full');
    assert.equal(parseDetailDensity('brief'), 'brief');
    assert.equal(parseDetailDensity('everything'), 'brief', 'unknown values settle brief');
    assert.equal(parseDetailDensity(null), 'brief');
    assert.equal(loadDetailDensity(null), 'brief');
  });

  it('persists the caller’s choice and reads it back', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    assert.equal(loadDetailDensity(storage), 'brief');
    saveDetailDensity(storage, 'full');
    assert.equal(store.get(DETAIL_DENSITY_STORAGE_KEY), 'full');
    assert.equal(loadDetailDensity(storage), 'full');
  });
});

describe('voice is the zoom', () => {
  it('maps every explainable topic to a real slip element', () => {
    for (const topic of ['anchor', 'graduation', 'tracker-token', 'curve-shape', 'paper-mode', 'namesake'] as const) {
      assert.ok(halleyRevealTargetForTopic(topic), `${topic} has nowhere to land`);
    }
    assert.equal(halleyRevealTargetForTopic('anchor'), 'halley-step-2');
    assert.equal(halleyRevealTargetForTopic('graduation'), 'halley-grad');
    assert.equal(halleyRevealTargetForTopic('namesake'), 'halley-plate-title');
  });

  it('the surface answers the reveal and the targets exist', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /halley\.uiReveal/);
    assert.match(source, /jumpToId\(uiReveal\.target\)/);
    for (const id of ['halley-what-launch', 'halley-path', 'halley-step-2', 'halley-step-3', 'halley-grad', 'halley-plate-title']) {
      /* Plate ids live in HalleyPlate; the rest live in the surface. */
      const host = id === 'halley-plate-title'
        ? readFileSync(new URL('../components/desk/HalleyPlate.tsx', import.meta.url), 'utf8')
        : source;
      assert.ok(host.includes(`id="${id}"`), `${id} is not an element on the desk`);
    }
  });

  it('explaining a topic fires the reveal, not just the words', () => {
    const source = readFileSync(new URL('../lib/meteora/desk-tools.ts', import.meta.url), 'utf8');
    assert.match(source, /halleyRevealTargetForTopic\(topic\)/);
    assert.match(source, /d\.reveal\(revealTarget\)/);
  });
});

describe('the stamp toggle, the morph, and the pill', () => {
  const surface = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
  const desk = readFileSync(new URL('../lib/meteora/useHalleyDesk.ts', import.meta.url), 'utf8');
  const deskCss = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');
  const plateCss = readFileSync(new URL('../components/desk/HalleyPlate.module.css', import.meta.url), 'utf8');

  it('one quiet toggle in the stamp, wired to the saved preference', () => {
    assert.match(surface, /useDetailDensity/);
    assert.match(surface, /className=\{styles\.densityToggle\}/);
    assert.match(surface, /aria-pressed=\{density === 'full'\}/);
    assert.match(deskCss, /\.densityToggle/);
  });

  it('full opens the folded fine detail — once, then the hand rules', () => {
    assert.match(surface, /density === 'full'/);
    assert.match(surface, /assumptionsFold.*captionHistory|captionHistory.*assumptionsFold/s);
  });

  it('the review commit morphs through a view transition — reduced-motion plain', () => {
    assert.match(desk, /startViewTransition/);
    assert.match(desk, /prefers-reduced-motion:\s*reduce/, 'the morph must honour reduced motion');
    assert.match(desk, /flushSync/);
    assert.match(plateCss, /view-transition-name:\s*halley-slip-line/);
    assert.match(plateCss, /\.reviewTitle\s*\{[^}]*view-transition-name|\.slipLine,\s*\.reviewTitle\s*\{[^}]*view-transition-name/s);
  });

  it('on a small screen the call is a pill: newest line only', () => {
    assert.match(deskCss, /max-width:\s*760px[^}]*captionLine\[data-tail='true'\]\s*\{\s*display:\s*none/s);
    assert.match(deskCss, /content-visibility:\s*auto/);
  });

  it('the slip’s one-liner is the sticky top of the pair on mobile', () => {
    assert.match(plateCss, /max-width:\s*760px[\s\S]*?\.slipLine\s*\{[^}]*position:\s*sticky/);
  });
});
