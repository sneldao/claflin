import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { lampFor, litDesks, readInstruction, turretReply } from '../lib/desk/turret';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { resetContainer, getRootElement } from './jsdom-setup';

const OPEN = ['hetty', 'jesse'] as const;

describe('turret reading (pure)', () => {
  it('stays idle until the sentence names something', () => {
    for (const said of ['', '   ', 'buy for 100 USDC']) {
      const reading = readInstruction(said);
      assert.equal(reading.kind, 'empty', `“${said}” names no product`);
      assert.equal(lampFor(reading, 'hetty'), 'idle');
      assert.equal(turretReply(reading, OPEN), null);
    }
  });

  it('lights both lines for Apple and names both products — never picks a rail', () => {
    const reading = readInstruction('buy Apple for 100 USDC');
    assert.deepEqual(litDesks(reading, OPEN), ['hetty', 'jesse']);
    const reply = turretReply(reading, OPEN)!;
    assert.match(reply, /AAPLc on Base \(Hetty\)/);
    assert.match(reply, /AAPLx on Solana \(Jesse\)/);
    assert.match(reply, /Pick a line\./);
  });

  it('lights one line for a single-rail product and says nothing extra', () => {
    const reading = readInstruction('buy Tesla');
    assert.deepEqual(litDesks(reading, OPEN), ['jesse']);
    assert.equal(lampFor(reading, 'hetty'), 'quiet');
    assert.equal(turretReply(reading, OPEN), null, 'the lamp already says it');
  });

  it('says plainly when no line carries it, with what the book covers', () => {
    const reading = readInstruction('buy dogecoin');
    assert.equal(reading.kind, 'unmatched');
    assert.equal(lampFor(reading, 'hetty'), 'quiet');
    assert.equal(lampFor(reading, 'jesse'), 'quiet');
    assert.match(turretReply(reading, OPEN)!, /^No line carries that yet\. The house book covers .*AAPL/);
  });
});

describe('house turret (component)', () => {
  let root: Root | null = null;
  let micCalls = 0;
  let micDescriptor: PropertyDescriptor | undefined;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetContainer();
    micCalls = 0;
    (globalThis as any).fetch = () => Promise.reject(new Error('no network in tests'));
    micDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => { micCalls += 1; return Promise.reject(new Error('Permission denied')); } },
    });
  });

  afterEach(async () => {
    if (root) { await act(async () => root!.unmount()); root = null; }
    (globalThis as any).fetch = originalFetch;
    if (micDescriptor) Object.defineProperty(window.navigator, 'mediaDevices', micDescriptor);
    else delete (window.navigator as any).mediaDevices;
  });

  async function mount() {
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, { onEnter: () => {} })));
  }

  async function type(value: string) {
    const input = getRootElement().querySelector('.instructionSearch input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new (window as any).Event('input', { bubbles: true }));
    });
  }

  const lamps = () => Object.fromEntries(
    Array.from(getRootElement().querySelectorAll('[data-lamp]'))
      .map(el => [el.querySelector('h2')?.textContent ?? '', el.getAttribute('data-lamp')]),
  );

  it('SSR paints one talk button, the lines, and unlit planned lines', () => {
    const html = renderToStaticMarkup(createElement(HouseFoyer, { onEnter: () => {} }));
    assert.equal((html.match(/data-talk/g) ?? []).length, 1, 'one primary talk action');
    assert.match(html, /Hold to talk/);
    assert.match(html, /Press and hold to talk \(or hold Space\)\. Or just type\./);
    assert.match(html, /LINE 1/);
    assert.match(html, /data-lamp="planned"/);
    assert.match(html, /Robinhood Chain · coming soon/);
  });

  it('lamps follow the words: Apple lights both, Tesla lights Jesse only', async () => {
    await mount();
    assert.deepEqual(lamps(), { Hetty: 'idle', Jesse: 'idle', Isabel: 'planned', Jay: 'planned' });

    await type('buy Apple for 100 USDC');
    assert.equal(lamps().Hetty, 'match');
    assert.equal(lamps().Jesse, 'match');
    assert.match(getRootElement().textContent ?? '', /Two lines carry this, as separate products/);

    await type('buy Tesla');
    assert.equal(lamps().Hetty, 'quiet');
    assert.equal(lamps().Jesse, 'match');
  });

  it('never touches the microphone until the caller holds the line', async () => {
    await mount();
    await type('buy Apple');
    assert.equal(micCalls, 0);
  });

  it('Space in the instruction field types a space — it is not the talk key', async () => {
    await mount();
    const input = getRootElement().querySelector('.instructionSearch input') as HTMLInputElement;
    await act(async () => {
      input.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    });
    assert.equal(micCalls, 0);
  });

  it('a release before the mic arrives still ends the hold — never stuck listening', async () => {
    let grant: (stream: unknown) => void = () => {};
    const track = { stop: () => {}, addEventListener: () => {} };
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => { micCalls += 1; return new Promise(resolve => { grant = resolve; }); } },
    });
    class FakeRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: unknown = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    const originalRecorder = (globalThis as any).MediaRecorder;
    (globalThis as any).MediaRecorder = FakeRecorder;
    try {
      await mount();
      const down = () => window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      const up = () => window.dispatchEvent(new (window as any).KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      await act(async () => { down(); });
      await act(async () => { up(); });
      await act(async () => {
        grant({ getTracks: () => [track], getAudioTracks: () => [track] });
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const talk = getRootElement().querySelector('[data-talk]')!;
      assert.equal(talk.getAttribute('aria-pressed'), 'false', 'the line is not left listening');
      assert.match(getRootElement().textContent ?? '', /too short to hear/);
    } finally {
      (globalThis as any).MediaRecorder = originalRecorder;
    }
  });

  it('holding Space asks for the mic; a denial falls back to typing, honestly', async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(micCalls, 1);
    const page = getRootElement().textContent ?? '';
    assert.match(page, /Microphone is blocked/);
    assert.match(page, /type the instruction/i);
    assert.ok(getRootElement().querySelector('.instructionSearch input'), 'typing still available');
  });
});
