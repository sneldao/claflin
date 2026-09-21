import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, act, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DeskInstrument } from '../components/desk/DeskInstrument';
import { resetContainer, getRootElement } from './jsdom-setup';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('desk instrument line target', () => {
  let root: Root | null = null;

  beforeEach(() => {
    resetContainer();
    (globalThis as any).MutationObserver = window.MutationObserver;
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    delete (globalThis as any).MutationObserver;
  });

  it('labels Jesse and mirrors the Jesse call panel state', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Fragment, null,
      createElement('section', { id: 'jesse-line', 'data-call': 'live' }),
      createElement(DeskInstrument, {
        stage: 'conversation',
        label: 'JESSE — ON THE LINE',
        brokerName: 'Jesse',
        lineTargetId: 'jesse-line',
        eager: true,
      }),
    )));

    const instrument = getRootElement().querySelector('.instrument');
    assert.equal(instrument?.getAttribute('data-line'), 'live');
    assert.equal(
      getRootElement().querySelector('button')?.getAttribute('aria-label'),
      'Hang up the line with Jesse',
    );
  });

  it('keeps Hetty on her own panel and maps connecting to ringing', async () => {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(Fragment, null,
      createElement('section', { id: 'hetty', 'data-call': 'connecting' }),
      createElement('section', { id: 'jesse-line', 'data-call': 'live' }),
      createElement(DeskInstrument, {
        stage: 'arrival',
        label: 'PAPER TRADING / NO LIVE ORDERS',
        brokerName: 'Hetty',
        lineTargetId: 'hetty',
        eager: true,
      }),
    )));

    const instrument = getRootElement().querySelector('.instrument');
    assert.equal(instrument?.getAttribute('data-line'), 'ringing');
    assert.equal(
      getRootElement().querySelector('button')?.getAttribute('aria-label'),
      'Cancel the ring',
    );
  });

  it('production desk surfaces pass the broker-specific line target', () => {
    assert.match(
      source('components/desk/JesseDeskSurface.tsx'),
      /brokerName="Jesse" lineTargetId="jesse-line"/,
    );
    assert.match(
      source('components/desk/HettyDeskSurface.tsx'),
      /brokerName="Hetty" lineTargetId="hetty"/,
    );
  });
});
