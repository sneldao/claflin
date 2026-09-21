import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HOUSE_DESKS } from '../lib/house';
import { RoomPresentation } from '../components/desk/RoomPresentation';
import { resetContainer, getRootElement } from './jsdom-setup';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const jesse = HOUSE_DESKS.find(desk => desk.id === 'jesse')!;
const hetty = HOUSE_DESKS.find(desk => desk.id === 'hetty')!;

function objectButtons() {
  return Array.from(getRootElement().querySelectorAll('nav[aria-label*="room"] button'));
}

describe('room presentation object navigation', () => {
  let root: Root | null = null;

  beforeEach(() => resetContainer());

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
  });

  it('uses Hetty-specific object language instead of Jesse’s two-market evidence label', async () => {
    let selected: string | null = null;
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(RoomPresentation, {
      desk: hetty,
      stage: 'arrival',
      view: 'desk',
      onView: view => { selected = view; },
      presentation: 'room',
      onPresentation: () => {},
      onSwitchDesk: () => {},
    }, createElement('div', { id: 'on-desk' }))));

    const labels = objectButtons().map(button => button.textContent);
    assert.deepEqual(labels, ['The working tray', 'Your instruction', 'The ledger']);
    assert.equal(
      getRootElement().querySelector('nav[aria-label*="room"]')?.getAttribute('aria-label'),
      "Objects in Hetty Green's room",
    );

    await act(async () => objectButtons()[0].dispatchEvent(
      new (window as any).MouseEvent('click', { bubbles: true, cancelable: true }),
    ));
    assert.equal(selected, 'evidence');
  });

  it('keeps Jesse’s market evidence vocabulary', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(RoomPresentation, {
      desk: jesse,
      stage: 'arrival',
      view: 'desk',
      onView: () => {},
      presentation: 'room',
      onPresentation: () => {},
      onSwitchDesk: () => {},
    }, createElement('div'))));

    assert.deepEqual(
      objectButtons().map(button => button.textContent),
      ['The two markets', 'Your instruction', 'The ledger'],
    );
  });

  it('keeps room object labels bound to scene anchors', () => {
    const room = source('components/desk/RoomPresentation.tsx');
    assert.match(room, /useHouseSceneAnchors\(applyAnchors\)/);
    assert.match(room, /ref=\{objectRefs\[object\.view\]\}/);
    assert.match(room, /element\.style\.visibility = anchor\.visible/);
    const scene = source('lib/night-desk-scene.ts');
    assert.match(scene, /onAnchors\?\.\(\{/);
    const provider = source('components/desk/HouseScene.tsx');
    assert.match(provider, /subscribeAnchors/);
    const hettySurface = source('components/desk/HettyDeskSurface.tsx');
    assert.match(hettySurface, /setRoomFocus\(\{ foreground: foreground\.kind, view \}\)/);
    assert.match(hettySurface, /roomProjection\.view === 'desk' && roomFocus\?\.foreground === foreground\.kind/);
    assert.match(hettySurface, /view=\{roomSceneView\}/);
  });
});
