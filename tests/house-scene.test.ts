import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseSceneProvider, useHouseScene, type HouseSceneState } from '../components/desk/HouseScene';
import { DeskRoom } from '../components/desk/DeskRoom';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { HOUSE_DESKS } from '../lib/house';
import { NightDeskScene } from '../components/night-desk/NightDeskScene';
import { resetContainer, getRootElement } from './jsdom-setup';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const originalMatchMedia = window.matchMedia;
const originalRequestAnimationFrame = (globalThis as any).requestAnimationFrame;
const originalCancelAnimationFrame = (globalThis as any).cancelAnimationFrame;

const FOYER: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival', still: false };
const ROOM: HouseSceneState = { visible: true, layout: 'room', view: 'desk', stage: 'arrival', still: false };
const COMPACT: HouseSceneState = { visible: true, layout: 'compact', view: 'desk', stage: 'arrival', still: true };

type MediaControl = { setReduced(reduced: boolean): void };

function mockMatchMedia(reduced: boolean): MediaControl {
  const listeners = new Set<() => void>();
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
  return {
    setReduced(next: boolean) {
      reduced = next;
      listeners.forEach(cb => cb());
    },
  };
}

function Consumer({ state }: { state: HouseSceneState }) {
  const shared = useHouseScene(state);
  return createElement('span', { 'data-shared': shared ? 'true' : 'false' });
}

describe('shared house scene', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
    (globalThis as any).requestAnimationFrame = window.requestAnimationFrame.bind(window);
    (globalThis as any).cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    (window as any).matchMedia = originalMatchMedia;
    (globalThis as any).requestAnimationFrame = originalRequestAnimationFrame;
    (globalThis as any).cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('keeps one scene host across foyer → room → compact → room and removes it on provider unmount', async () => {
    root = createRoot(getRootElement());
    let state = FOYER;
    const render = () => root!.render(
      createElement(HouseSceneProvider, null, createElement(Consumer, { state })),
    );
    await act(render);

    const container = getRootElement();
    const host = container.querySelector('[data-house-scene]');
    assert.ok(host, 'house wrapper mounted');
    assert.equal(host!.getAttribute('data-house-scene'), 'foyer');
    const sceneHosts = () => container.querySelectorAll('.sceneHost');
    assert.equal(sceneHosts().length, 1, 'exactly one NightDeskScene mounted');
    const sceneNode = sceneHosts()[0];
    assert.equal(sceneNode.getAttribute('data-layout'), 'foyer');
    const sceneLayer = container.querySelector('[data-house-scene] > div');
    assert.ok(sceneLayer, 'scene layer present');
    assert.equal((sceneLayer as HTMLElement).hasAttribute('hidden'), false);

    state = ROOM;
    await act(render);
    assert.equal(host!.getAttribute('data-house-scene'), 'room');
    assert.equal(sceneHosts().length, 1, 'still one scene after foyer → room');
    assert.equal(sceneHosts()[0], sceneNode, 'same scene element — no remount');
    assert.equal(sceneNode.getAttribute('data-layout'), 'room');

    state = COMPACT;
    await act(render);
    assert.equal(sceneHosts().length, 1, 'scene stays mounted in compact');
    assert.equal(sceneHosts()[0], sceneNode);
    assert.equal(sceneNode.getAttribute('data-layout'), 'compact');
    assert.equal(sceneNode.getAttribute('data-motion'), 'still');
    assert.equal(sceneNode.querySelectorAll('canvas').length, 0, 'compact still mode never mounts WebGL');
    assert.equal((sceneLayer as HTMLElement).hasAttribute('hidden'), false, 'compact shows the static room layer');

    state = ROOM;
    await act(render);
    assert.equal(sceneHosts()[0], sceneNode, 'same scene returns from compact');
    assert.equal((sceneLayer as HTMLElement).hasAttribute('hidden'), false);

    await act(async () => root!.unmount());
    root = null;
    assert.equal(container.querySelectorAll('.sceneHost').length, 0, 'scene leaves only with the provider');
  });

  it('DeskRoom uses the shared compact still instead of the old parallax room', async () => {
    root = createRoot(getRootElement());
    const desk = HOUSE_DESKS.find(entry => entry.id === 'hetty')!;
    await act(async () => root!.render(
      createElement(HouseSceneProvider, null,
        createElement(DeskRoom, {
          deskId: 'hetty',
          activeDesk: desk,
          open: true,
          onSwitchDesk: () => {},
        }, createElement('div', { id: 'instruction' })),
      ),
    ));

    const workspace = getRootElement().querySelector('.workspace');
    const scene = getRootElement().querySelector('.sceneHost');
    assert.equal(workspace?.getAttribute('data-presentation'), 'compact');
    assert.equal(workspace?.getAttribute('data-shared-still'), 'true');
    assert.equal(workspace?.querySelector('.room'), null, 'old compact room is not composited under the still scene');
    assert.equal(scene?.getAttribute('data-layout'), 'compact');
    assert.equal(scene?.getAttribute('data-motion'), 'still');
    assert.equal(scene?.querySelectorAll('canvas').length, 0);
  });

  it('consumers outside the provider get no shared scene and mount a local one', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Consumer, { state: FOYER })));
    assert.equal(getRootElement().querySelector('[data-shared]')?.getAttribute('data-shared'), 'false');

    await act(async () => root!.unmount());
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
    const scenes = getRootElement().querySelectorAll('.sceneHost');
    assert.equal(scenes.length, 1, 'standalone foyer mounts its own scene');
    assert.equal(scenes[0].getAttribute('data-layout'), 'foyer');
  });

  it('scene controller exposes a layout channel separate from view', () => {
    const scene = source('lib/night-desk-scene.ts');
    assert.match(scene, /export type NightDeskLayout = 'foyer' \| 'room' \| 'compact'/);
    assert.match(scene, /setLayout\(layout: NightDeskLayout\): void/);
    assert.match(scene, /initialLayout: NightDeskLayout = 'room'/);
    assert.match(scene, /layout === 'foyer'/);
    assert.match(scene, /host\.closest<HTMLElement>\('\[data-house-scene\]'\)/);
    const component = source('components/night-desk/NightDeskScene.tsx');
    assert.match(component, /data-layout=\{layout\}/);
    const provider = source('components/desk/HouseScene.tsx');
    assert.match(provider, /data-house-scene=\{scene\.layout\}/);
    assert.match(provider, /subscribeAnchors/);
    assert.match(provider, /onAnchors=\{emitAnchors\}/);
    const room = source('components/desk/RoomPresentation.tsx');
    assert.match(room, /useHouseSceneAnchors\(applyAnchors\)/);
    assert.match(room, /<NightDeskScene[\s\S]*onAnchors=\{applyAnchors\}/);
    const compact = source('components/desk/DeskRoom.tsx');
    assert.match(compact, /layout: 'compact'/);
    assert.match(compact, /still: true/);
  });
});

describe('night desk scene mount', () => {
  let root: Root | null = null;

  beforeEach(() => resetContainer());

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    (window as any).matchMedia = originalMatchMedia;
  });

  it('SSR first paint is deterministic — fallback only, no canvas either motion state', () => {
    const markup = () => renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival' }));
    mockMatchMedia(false);
    const full = markup();
    mockMatchMedia(true);
    const reduced = markup();
    assert.equal(full, reduced, 'SSR markup must not depend on the client media query');
    assert.doesNotMatch(full, /<canvas/);
    assert.match(full, /fallbackRoom/);
    assert.match(full, /data-motion="pending"/);
  });

  it('mounts no canvas under reduced motion, adds it when preference flips, removes it when it flips back', async () => {
    const control = mockMatchMedia(true);
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(NightDeskScene, { view: 'desk', stage: 'arrival' })));

    const container = getRootElement();
    assert.equal(container.querySelectorAll('canvas').length, 0, 'reduced motion mounts no canvas');
    const host = container.querySelector('.sceneHost');
    assert.equal(host?.getAttribute('data-motion'), 'reduce');

    await act(async () => control.setReduced(false));
    assert.equal(container.querySelectorAll('canvas').length, 1, 'full motion mounts the canvas');
    assert.equal(host?.getAttribute('data-motion'), 'full');

    await act(async () => control.setReduced(true));
    assert.equal(container.querySelectorAll('canvas').length, 0, 'returning to reduced removes the canvas');
  });

  it('renders the receiver poster only in the foyer layout', async () => {
    const foyer = renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival', layout: 'foyer' }));
    assert.match(foyer, /desk-receiver\.webp/);
    const room = renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival', layout: 'room' }));
    assert.doesNotMatch(room, /desk-receiver\.webp/);
  });

  it('still mode is a complete static scene and never exposes a canvas slot', () => {
    const markup = renderToStaticMarkup(createElement(NightDeskScene, {
      view: 'desk',
      stage: 'arrival',
      layout: 'compact',
      still: true,
    }));
    assert.match(markup, /data-motion="still"/);
    assert.match(markup, /data-layout="compact"/);
    assert.doesNotMatch(markup, /<canvas/);
    assert.match(markup, /fallbackDesk/);
  });

  it('warms the lamp on fresh tape and re-prints the glow per reading', () => {
    const fresh = renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival', tape: 'fresh', tapeAt: 111 }));
    assert.match(fresh, /data-tape="fresh"/);
    assert.match(fresh, /tapeGlow/);
    const stale = renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival', tape: 'stale', tapeAt: 111 }));
    assert.match(stale, /data-tape="stale"/);
    assert.doesNotMatch(stale, /tapeGlow/);
    const idle = renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival' }));
    assert.doesNotMatch(idle, /data-tape/);
    assert.doesNotMatch(idle, /tapeGlow/);
  });

  it('tape markup is SSR-deterministic across motion preferences', () => {
    const markup = () => renderToStaticMarkup(createElement(NightDeskScene, { view: 'desk', stage: 'arrival', tape: 'fresh', tapeAt: 222 }));
    mockMatchMedia(false);
    const full = markup();
    mockMatchMedia(true);
    const reduced = markup();
    assert.equal(full, reduced, 'tape props must not branch on the client media query');
  });
});
