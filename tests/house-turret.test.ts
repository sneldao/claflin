import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { lampFor, litDesks, readInstruction, turretReply } from '../lib/desk/turret';
import { HouseFoyer } from '../components/desk/HouseFoyer';
import { resetContainer, getRootElement } from './jsdom-setup';

const OPEN = ['hetty', 'jesse', 'isabel'] as const;

describe('turret reading (pure)', () => {
  it('stays idle until the sentence names something', () => {
    for (const said of ['', '   ', 'buy for 100 USDC']) {
      const reading = readInstruction(said);
      assert.equal(reading.kind, 'empty', `“${said}” names no product`);
      assert.equal(lampFor(reading, 'hetty'), 'idle');
      assert.equal(turretReply(reading, OPEN), null);
    }
  });

  it('lights every open line for Apple and names each product — never picks a rail', () => {
    const reading = readInstruction('buy Apple for 100 USDC');
    assert.deepEqual(litDesks(reading, OPEN), ['hetty', 'jesse', 'isabel']);
    const reply = turretReply(reading, OPEN)!;
    assert.match(reply, /3 lines carry this/);
    assert.match(reply, /AAPLc on Base \(Hetty\)/);
    assert.match(reply, /AAPLx on Solana \(Jesse\)/);
    assert.match(reply, /AAPL on Robinhood Chain \(Isabel\)/);
    assert.match(reply, /Choose a product below\./);
  });

  it('lights the typed-only line too — Tesla sits on Jesse and Isabel', () => {
    const reading = readInstruction('buy Tesla');
    assert.deepEqual(litDesks(reading, OPEN), ['jesse', 'isabel']);
    assert.equal(lampFor(reading, 'hetty'), 'quiet');
    assert.match(turretReply(reading, OPEN)!, /Two lines carry this/);
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
    assert.equal((html.match(/data-talk/g) ?? []).length, 2, 'the talk bar and its handset copy');
    assert.match(html, /class="handset" data-shown="false" aria-hidden="true"/, 'the handset stays hidden until the bar scrolls away');
    assert.match(html, /Hold to dictate/);
    assert.match(html, /Hold to dictate an instruction, or type\. Then choose a product\./);
    assert.match(html, /LINE 1/);
    assert.match(html, /data-lamp="planned"/);
    assert.match(html, /Arbitrum · coming soon/);
  });

  it('lamps follow the words: Apple lights all three, Tesla lights Jesse and Isabel', async () => {
    await mount();
    /* Isabel's LINE 3 is a real line now — it lamps, it takes an
       instruction, and her "Talk" affordance rings the ElevenLabs agent. */
    assert.deepEqual(lamps(), { Hetty: 'idle', Jesse: 'idle', Isabel: 'idle', Jay: 'planned' });
    const isabelLine = Array.from(getRootElement().querySelectorAll('[data-lamp]')).find(el => el.textContent?.includes('Isabel'));
    assert.ok(isabelLine, 'Isabel has a line');
    assert.doesNotMatch(isabelLine!.textContent ?? '', /typed only/);
    assert.match(isabelLine!.textContent ?? '', /Talk with Isabel/);
    assert.match(isabelLine!.textContent ?? '', /Type instead/);

    await type('buy Apple for 100 USDC');
    assert.equal(lamps().Hetty, 'match');
    assert.equal(lamps().Jesse, 'match');
    assert.equal(lamps().Isabel, 'match');
    assert.match(getRootElement().textContent ?? '', /3 lines carry this, as separate products/);

    await type('buy Tesla');
    assert.equal(lamps().Hetty, 'quiet');
    assert.equal(lamps().Jesse, 'match');
    assert.equal(lamps().Isabel, 'match');
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

  it('a quick tap of Space scrolls the page and never asks for the mic', async () => {
    await mount();
    const scrolls: number[] = [];
    const original = window.scrollBy;
    (window as any).scrollBy = (options: ScrollToOptions) => { scrolls.push(options.top ?? 0); };
    try {
      await act(async () => {
        window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
        window.dispatchEvent(new (window as any).KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
        window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', shiftKey: true, bubbles: true, cancelable: true }));
        window.dispatchEvent(new (window as any).KeyboardEvent('keyup', { code: 'Space', key: ' ', shiftKey: true, bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
      });
      assert.equal(micCalls, 0, 'a tap is a scroll, not a call');
      assert.equal(scrolls.length, 2);
      assert.ok(scrolls[0]! > 0 && scrolls[1]! < 0, 'Space pages down, Shift+Space pages up');
    } finally {
      (window as any).scrollBy = original;
    }
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
      /* Held past the tap threshold, then let go before the mic arrives. */
      await act(async () => { down(); await new Promise(resolve => setTimeout(resolve, 300)); });
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

  it('offers a named product to continue with when the instruction names one', async () => {
    const entered: { desk: string; offering?: string }[] = [];
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (desk: string, offering?: string) => { entered.push({ desk, offering }); },
    })));
    await type('buy Tesla');
    const matches = getRootElement().querySelector('[aria-label="Matching products"]');
    assert.ok(matches, 'a named product gets its own choice region');
    assert.match(matches!.textContent ?? '', /Continue with TSLAx/);
    const button = Array.from(matches!.querySelectorAll('button')).find(b => /Continue with/.test(b.textContent ?? ''))!;
    await act(async () => { button.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true })); });
    assert.equal(entered.length, 1);
    assert.equal(entered[0]?.desk, 'jesse');
    assert.ok(entered[0]?.offering, 'the chosen offering rides along');
    assert.equal(micCalls, 0, 'typing and choosing never ask for the mic');
  });

  it('requires an explicit pick when an instruction names several products — Enter does not choose', async () => {
    const entered: { desk: string; offering?: string }[] = [];
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (desk: string, offering?: string) => { entered.push({ desk, offering }); },
    })));
    await type('buy Apple');
    const matches = getRootElement().querySelector('[aria-label="Matching products"]');
    assert.ok(matches);
    assert.match(matches!.textContent ?? '', /Choose the product you mean/);
    const buttons = Array.from(matches!.querySelectorAll('button')).filter(b => /Continue with/.test(b.textContent ?? ''));
    assert.ok(buttons.length > 1, 'each candidate offers its own continuation');
    const form = getRootElement().querySelector('form.talkBar') as HTMLFormElement;
    assert.ok(form, 'the talk bar is a form');
    await act(async () => {
      form.dispatchEvent(new (window as any).Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(entered.length, 0, 'Enter never picks between products');
  });

  it('Enter continues only a single product on a single desk — never a guess at a line', async () => {
    const entered: { desk: string; offering?: string }[] = [];
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (desk: string, offering?: string) => { entered.push({ desk, offering }); },
    })));
    const form = () => getRootElement().querySelector('form.talkBar') as HTMLFormElement;

    /* SPY sits on Isabel's book alone — every Jesse name is cross-listed. */
    await type('buy SPY');
    assert.equal(getRootElement().querySelectorAll('[aria-label="Matching products"] button').length >= 1, true);
    await act(async () => {
      form().dispatchEvent(new (window as any).Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(entered.length, 1, 'one product on one desk continues on Enter');
    assert.equal(entered[0]?.desk, 'isabel');
    assert.ok(entered[0]?.offering);

    entered.length = 0;
    await type('buy Apple');
    await act(async () => {
      form().dispatchEvent(new (window as any).Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(entered.length, 0, 'several products refuse Enter');
  });

  it('keeps the words’ origin: typed stays typed', async () => {
    const entered: { intent?: { instruction?: { text: string; source: string } } | null }[] = [];
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (_desk: string, _offering: string | undefined, intent: any) => { entered.push({ intent }); },
    })));
    await type('buy Tesla');
    const matches = getRootElement().querySelector('[aria-label="Matching products"]')!;
    const button = Array.from(matches.querySelectorAll('button')).find(b => /Continue with/.test(b.textContent ?? ''))!;
    await act(async () => { button.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true })); });
    assert.equal(entered[0]?.intent?.instruction?.source, 'typed');
    assert.equal(entered[0]?.intent?.instruction?.text, 'buy Tesla');
  });

  it('refuses continuation for unsupported instructions but still lets the caller erase and explore', async () => {
    const entered: { desk: string }[] = [];
    resetContainer();
    root = createRoot(getRootElement());
    await act(async () => root!.render(createElement(HouseFoyer, {
      onEnter: (desk: string) => { entered.push({ desk }); },
    })));

    await type('buy Apple when it dips');
    const page = getRootElement();
    assert.match(page.textContent ?? '', /one immediate buy or sell instruction/);
    assert.equal(page.querySelector('[aria-label="Matching products"]'), null, 'no continuation choices for an unsafe instruction');
    assert.equal(Array.from(page.querySelectorAll('button')).some(b => /Talk with/.test(b.textContent ?? '')), false, 'no broker line offered');
    assert.equal(Array.from(page.querySelectorAll('a')).some(a => /Type instead/.test(a.textContent ?? '')), false, 'no desk continuation links');
    for (const a of Array.from(page.querySelectorAll('a')).filter(a => /Open .*’s desk/.test(a.textContent ?? ''))) {
      assert.equal(a.getAttribute('aria-disabled'), 'true', 'board desk links are disabled for an unsafe instruction');
    }
    const form = page.querySelector('form.talkBar') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new (window as any).Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(entered.length, 0, 'Enter cannot act on an unsupported instruction');

    await type('sell 5 Apple and buy 10 Tesla');
    assert.equal(entered.length, 0, 'a multileg instruction cannot click through');

    await type('');
    assert.equal(lamps().Hetty, 'idle', 'erasing restores the exploratory line');
    await type('buy Tesla');
    const matches = getRootElement().querySelector('[aria-label="Matching products"]');
    assert.ok(matches, 'a clean instruction continues normally after an unsafe one');
    const button = Array.from(matches!.querySelectorAll('button')).find(b => /Continue with/.test(b.textContent ?? ''))!;
    await act(async () => { button.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true })); });
    assert.equal(entered.length, 1);
  });

  it('holding Space asks for the mic; a denial falls back to typing, honestly', async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    assert.equal(micCalls, 1);
    const page = getRootElement().textContent ?? '';
    assert.match(page, /Microphone is blocked/);
    assert.match(page, /type the instruction/i);
    assert.ok(getRootElement().querySelector('.instructionSearch input'), 'typing still available');
  });
});
