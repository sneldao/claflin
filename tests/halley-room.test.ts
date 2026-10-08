import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectHalleyToRoom } from '../lib/meteora/room-presentation';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Halley shared Room presentation', () => {
  it('maps actual paper states to the house scene without implying a mint', () => {
    assert.deepEqual(projectHalleyToRoom({ stage: 'draft', foreground: 'draft', live: false }), { stage: 'arrival', view: 'desk' });
    assert.deepEqual(projectHalleyToRoom({ stage: 'estimating', foreground: 'pending', live: false }), { stage: 'conversation', view: 'desk' });
    assert.deepEqual(projectHalleyToRoom({ stage: 'review', foreground: 'quotation', live: true }), { stage: 'quote', view: 'review' });
    assert.deepEqual(projectHalleyToRoom({ stage: 'saved', foreground: 'receipt', live: false }), { stage: 'filed', view: 'ledger' });
    assert.deepEqual(projectHalleyToRoom({ stage: 'draft', foreground: 'archive', live: false }), { stage: 'filed', view: 'ledger' });
    assert.deepEqual(projectHalleyToRoom({ stage: 'draft', foreground: 'missing', live: false }), { stage: 'arrival', view: 'ledger' });
  });
  it('keeps Compact still initially and loads the shared Room shell only when selected', () => {
    const surface = source('components/desk/HalleyDeskSurface.tsx');
    assert.match(surface, /useState<DeskPresentation>\('compact'\)/);
    assert.match(surface, /useDeskPresentation\('halley', applyMode, halley.historyReady\)/);
    assert.match(surface, /import\('\.\/RoomPresentation'\)/);
    assert.match(surface, /if \(roomView\)/);
    assert.match(surface, /eager=\{roomView\}/);
    assert.match(surface, /lineTargetId="halley-line"/);
    assert.match(surface, /onPresentation=\{changeView\}/);
    assert.match(surface, /End or cancel the call before changing views/);
    assert.match(surface, /Paper only: no token is minted/);
  });
  it('uses a static decorative celestial layer without another animation runtime', () => {
    const css = source('components/desk/HalleyRoom.module.css');
    assert.match(css, /pointer-events: none/);
    assert.doesNotMatch(css, /@keyframes|animation:/);
    const surface = source('components/desk/HalleyDeskSurface.tsx');
    assert.match(surface, /className=\{room.sky\} aria-hidden="true"/);
    assert.doesNotMatch(surface, /from ['"]three|rive|requestAnimationFrame/);
  });
});
