import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:3000/',
});

(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).self = dom.window;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

dom.window.cancelAnimationFrame = (id: number) => clearTimeout(id);
dom.window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;

/* Components reach browser globals bare — not through window — so effects
   mounted under createRoot need them on globalThis too. */
(globalThis as any).requestAnimationFrame = dom.window.requestAnimationFrame;
(globalThis as any).cancelAnimationFrame = dom.window.cancelAnimationFrame;
(globalThis as any).MutationObserver = dom.window.MutationObserver;
if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
(dom.window as any).IntersectionObserver = (globalThis as any).IntersectionObserver;

dom.window.matchMedia = (query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
  addListener: () => {},
  removeListener: () => {},
} as MediaQueryList);

const require = createRequire(import.meta.url);
require.extensions['.css'] = (module: { exports: unknown }) => {
  module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
};

export function resetContainer() {
  dom.window.document.body.innerHTML = '<div id="root"></div>';
}

export function getRootElement() {
  return dom.window.document.getElementById('root')!;
}

export function setViewport(width: number, height = 812) {
  (dom.window as any).innerWidth = width;
  (dom.window as any).innerHeight = height;
  (dom.window as any).outerWidth = width;
  (dom.window as any).outerHeight = height;
  (dom.window as any).screen = { width, height };
}
