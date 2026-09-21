import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseSceneProvider, useHouseScene, type HouseSceneState } from '../components/desk/HouseScene';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { NightDeskScene } from '../components/night-desk/NightDeskScene';
import { resetContainer, getRootElement } from './jsdom-setup';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const originalMatchMedia = window.matchMedia;

const FOYER: HouseSceneState = { visible: true, layout: 'foyer', view: 'desk', stage: 'arrival' };
const ROOM: HouseSceneState = { visible: true, layout: 'room', view: 'desk', stage: 'arrival' };
const COMPACT: HouseSceneState = { visible: false, layout: 'room', view: 'desk', stage: 'arrival' };

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

  beforeEach(() => resetContainer());

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    (window as any).matchMedia = originalMatchMedia;
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
    assert.equal((sceneLayer as HTMLElement).hasAttribute('hidden'), true, 'compact hides the shared layer');

    state = ROOM;
    await act(render);
    assert.equal(sceneHosts()[0], sceneNode, 'same scene returns from compact');
    assert.equal((sceneLayer as HTMLElement).hasAttribute('hidden'), false);

    await act(async () => root!.unmount());
    root = null;
    assert.equal(container.querySelectorAll('.sceneHost').length, 0, 'scene leaves only with the provider');
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
    assert.match(scene, /export type NightDeskLayout = 'foyer' \| 'room'/);
    assert.match(scene, /setLayout\(layout: NightDeskLayout\): void/);
    assert.match(scene, /initialLayout: NightDeskLayout = 'room'/);
    assert.match(scene, /layout === 'foyer'/);
    assert.match(scene, /host\.closest<HTMLElement>\('\[data-house-scene\]'\)/);
    const component = source('components/night-desk/NightDeskScene.tsx');
    assert.match(component, /data-layout=\{layout\}/);
    const provider = source('components/desk/HouseScene.tsx');
    assert.match(provider, /data-house-scene=\{scene\.layout\}/);
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
});
