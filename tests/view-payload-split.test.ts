import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HouseSceneProvider, useHouseScene, type HouseSceneState } from '../components/desk/HouseScene';
import { ReceiverShell } from '../components/desk/ReceiverShell';
import { resetContainer, getRootElement } from './jsdom-setup';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const FOYER: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false };
const ROOM: HouseSceneState = { visible: true, layout: 'room', view: 'desk', stage: 'arrival', still: false };
const COMPACT: HouseSceneState = { visible: true, layout: 'compact', view: 'desk', stage: 'arrival', still: true };

function Consumer({ state }: { state: HouseSceneState }) {
  const shared = useHouseScene(state);
  return createElement('span', { 'data-shared': shared ? 'true' : 'false' });
}

describe('per-view payload split — WebGL isolation', () => {
  let root: Root | null = null;
  const originalMatchMedia = window.matchMedia;

  const listeners = new Set<() => void>();
  let reduced = true;
  const mockMatchMedia = () => {
    (window as any).matchMedia = (query: string) => ({
      get matches() { return query.includes('prefers-reduced-motion') ? reduced : false; },
      media: query,
      onchange: null,
      addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    });
  };

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    (window as any).matchMedia = originalMatchMedia;
  });

  it('provider initial state is still, so a compact desk URL never boots WebGL in the foyer pass-through', () => {
    assert.match(
      source('components/desk/HouseScene.tsx'),
      /INITIAL_SCENE[^;]*still: true/,
      'the shared scene must boot still — the desk surface lifts the still gate when Room is the destination',
    );
  });

  it('the pending foyer pass-through holds the scene still until the destination resolves', () => {
    const working = source('components/desk/WorkingDesk.tsx');
    assert.match(working, /entryPhase === 'pending'[\s\S]{0,220}sceneLive=\{false\}/,
      'while entry is unresolved the foyer must not claim a live scene');
    assert.match(working, /entryPhase === 'foyer'[\s\S]{0,120}sceneLive\s*\/>/,
      'a resolved foyer destination is a full scene');
    assert.match(source('components/desk/HouseFoyer.tsx'), /still: !sceneLive/);
  });

  it('scene host follows the consumer: still in compact, live canvas in room', async () => {
    mockMatchMedia();
    reduced = false;
    root = createRoot(getRootElement());
    let state = COMPACT;
    const render = () => root!.render(
      createElement(HouseSceneProvider, null, createElement(Consumer, { state })),
    );
    await act(render);
    assert.equal(getRootElement().querySelector('.sceneHost')?.getAttribute('data-motion'), 'still');
    assert.equal(getRootElement().querySelectorAll('canvas').length, 0, 'compact mounts no WebGL canvas');

    state = ROOM;
    await act(render);
    assert.equal(getRootElement().querySelector('.sceneHost')?.getAttribute('data-motion'), 'full');
    assert.equal(getRootElement().querySelectorAll('canvas').length, 1, 'room mounts the canvas');

    state = COMPACT;
    await act(render);
    assert.equal(getRootElement().querySelector('.sceneHost')?.getAttribute('data-motion'), 'still');
    assert.equal(getRootElement().querySelectorAll('canvas').length, 0, 'returning to compact takes the canvas back down');

    state = FOYER;
    await act(render);
    assert.equal(getRootElement().querySelector('.sceneHost')?.getAttribute('data-motion'), 'full', 'the foyer is a full scene');
  });

  it('ReceiverShell passes eager through to DeskInstrument and the compact surfaces opt out', () => {
    const shell = source('components/desk/ReceiverShell.tsx');
    assert.match(shell, /eager = true/, 'Room keeps the eager receiver by default');
    assert.match(shell, /eager=\{eager\}/);
    assert.match(shell, /allowScene=\{eager\}/, 'the hard scene gate rides the same flag');
    assert.match(source('components/desk/DeskInstrument.tsx'), /allowScene = true/);
    assert.match(source('components/desk/DeskInstrument.tsx'), /!allowScene/);
    /* The eager 3D receiver is Room furniture: both surfaces tie it to roomView,
       so Compact never imports three through the receiver. */
    assert.match(source('components/desk/JesseDeskSurface.tsx'), /eager=\{roomView\}/);
    assert.match(source('components/desk/HettyDeskSurface.tsx'), /eager=\{roomView\}/);
  });

  it('compact receiver never resolves the scene module; eager receiver renders its canvas slot', async () => {
    mockMatchMedia();
    reduced = false;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(ReceiverShell, {
      stage: 'arrival',
      label: 'PAPER TRADING / NO LIVE ORDERS',
      reviewing: false,
      brokerName: 'Jesse',
      lineTargetId: 'jesse-line',
      live: false,
      eager: false,
    })));
    /* The poster is the surface — the instrument host never becomes WebGL-ready. */
    assert.equal(getRootElement().querySelector('.instrument[data-ready]')?.getAttribute('data-ready'), 'false');

    await act(async () => root!.unmount());
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(ReceiverShell, {
      stage: 'arrival',
      label: 'PAPER TRADING / NO LIVE ORDERS',
      reviewing: false,
      brokerName: 'Jesse',
      lineTargetId: 'jesse-line',
      live: false,
    })));
    assert.equal(getRootElement().querySelectorAll('canvas').length, 1, 'room receiver keeps its canvas slot');
  });
});
