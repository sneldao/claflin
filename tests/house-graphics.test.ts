import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GRAPHICS_STORAGE_KEY,
  parseGraphicsPreference,
  shouldUseLightweightGraphics,
  type GraphicsPreference,
} from '../lib/desk/graphics';
import { HouseSceneProvider, useHouseGraphics } from '../components/desk/HouseScene';
import { GraphicsControl } from '../components/desk/GraphicsControl';
import { resetContainer, getRootElement } from './jsdom-setup';

const calm = { reducedMotion: false, coarsePointer: false, saveData: false };

describe('graphics preference — pure rules', () => {
  it('parses stored values and falls back to auto on anything else', () => {
    assert.equal(parseGraphicsPreference('auto'), 'auto');
    assert.equal(parseGraphicsPreference('lightweight'), 'lightweight');
    assert.equal(parseGraphicsPreference('full'), 'full');
    for (const raw of [null, undefined, '', 'bogus', 0, {}, 'FULL']) {
      assert.equal(parseGraphicsPreference(raw), 'auto', String(raw));
    }
  });

  it('reduced motion always wins, even over an explicit full preference', () => {
    for (const preference of ['auto', 'lightweight', 'full'] as GraphicsPreference[]) {
      assert.equal(shouldUseLightweightGraphics(preference, { ...calm, reducedMotion: true }), true, preference);
    }
  });

  it('honours explicit choices and auto signals without viewport heuristics', () => {
    assert.equal(shouldUseLightweightGraphics('lightweight', calm), true);
    assert.equal(shouldUseLightweightGraphics('full', { ...calm, coarsePointer: true, saveData: true }), false);
    assert.equal(shouldUseLightweightGraphics('auto', calm), false);
    assert.equal(shouldUseLightweightGraphics('auto', { ...calm, coarsePointer: true }), true);
    assert.equal(shouldUseLightweightGraphics('auto', { ...calm, saveData: true }), true);
  });
});

describe('house graphics — provider', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
    window.localStorage.clear();
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    window.localStorage.clear();
  });

  it('paints the static room on SSR before preferences are read', () => {
    const html = renderToStaticMarkup(createElement(HouseSceneProvider, null, createElement('p', null, 'desk')));
    assert.match(html, /data-motion="still"/);
    assert.doesNotMatch(html, /<canvas/);
  });

  it('shows the pending graphics status and English options before preferences are read', () => {
    const html = renderToStaticMarkup(createElement(HouseSceneProvider, null, createElement(GraphicsControl)));
    assert.match(html, /Reading graphics preference…/);
    assert.match(html, /Scene graphics/);
    assert.match(html, /Automatic/);
    assert.match(html, /Lightweight/);
    assert.match(html, /Full scene/);
    assert.match(html, /disabled=""/);
  });

  it('keeps every child mounted and identical across preference changes', async () => {
    let graphics: ReturnType<typeof useHouseGraphics> | null = null;
    let mounts = 0;
    const StableFinance = { id: 'desk-session' };
    function Probe() {
      const g = useHouseGraphics();
      graphics = g;
      useEffect(() => { mounts += 1; }, []);
      return createElement('div', { 'data-probe': 'true' }, StableFinance.id);
    }
    root = createRoot(getRootElement());
    await act(async () => { root!.render(createElement(HouseSceneProvider, null, createElement(Probe))); });
    assert.ok(graphics);
    assert.equal(graphics!.inside, true);
    assert.equal(mounts, 1);
    const probe = getRootElement().querySelector('[data-probe="true"]');

    await act(async () => { graphics!.setPreference('full'); });
    assert.equal(graphics!.preference, 'full');
    assert.equal(graphics!.lightweight, true, 'reduced-motion test environment never goes full');
    assert.equal(mounts, 1, 'toggling graphics must not remount desk children');
    assert.equal(getRootElement().querySelector('[data-probe="true"]'), probe);
    assert.equal(getRootElement().querySelectorAll('canvas').length, 0);

    await act(async () => { graphics!.setPreference('lightweight'); });
    assert.equal(mounts, 1);
    assert.equal(window.localStorage.getItem(GRAPHICS_STORAGE_KEY), 'lightweight');
  });

  it('restores a stored preference and treats an unknown value as auto', async () => {
    let graphics: ReturnType<typeof useHouseGraphics> | null = null;
    function Probe() {
      graphics = useHouseGraphics();
      return null;
    }
    window.localStorage.setItem(GRAPHICS_STORAGE_KEY, 'bogus-value');
    root = createRoot(getRootElement());
    await act(async () => { root!.render(createElement(HouseSceneProvider, null, createElement(Probe))); });
    assert.equal(graphics!.preference, 'auto');

    await act(async () => root!.unmount());
    root = null;
    window.localStorage.setItem(GRAPHICS_STORAGE_KEY, 'full');
    root = createRoot(getRootElement());
    await act(async () => { root!.render(createElement(HouseSceneProvider, null, createElement(Probe))); });
    assert.equal(graphics!.preference, 'full');
    assert.equal(graphics!.ready, true);
  });

  it('reports a safe lightweight fallback outside the provider', async () => {
    let graphics: ReturnType<typeof useHouseGraphics> | null = null;
    function Probe() {
      graphics = useHouseGraphics();
      return null;
    }
    root = createRoot(getRootElement());
    await act(async () => { root!.render(createElement(Probe)); });
    assert.deepEqual(
      { inside: graphics!.inside, ready: graphics!.ready, lightweight: graphics!.lightweight, preference: graphics!.preference },
      { inside: false, ready: false, lightweight: true, preference: 'auto' },
    );
  });
});
