import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The live box carries "real funds move when you sign". It must bring its
   own paper, and every ink inside it must clear WCAG AA on that paper —
   on the dark room, paper-muted text measured 2.46:1. */

const tokens = readFileSync(new URL('../styles/desk-craft.css', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = tokens.match(new RegExp(`--${name}:\\s*(?:var\\(--[\\w-]+,\\s*)?(#[0-9a-fA-F]{6})`));
  assert.ok(match, `token --${name} has a hex value`);
  return match[1]!;
}

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm'));
  assert.ok(match, `${selector} rule exists`);
  return match[1]!;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function colorOf(body: string): string {
  const value = body.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1]?.trim() ?? '';
  const named = value.match(/var\(--([\w-]+)\)/)?.[1];
  return named ? token(named) : value;
}

describe('live consent contrast', () => {
  const paper = token('desk-paper');

  it('the live box paints its own paper', () => {
    assert.match(rule('.liveBox'), /background:\s*var\(--desk-paper\)/);
  });

  for (const selector of ['.liveConsent', '.liveMeta', '.liveTitle', '.liveTitle > span', '.liveRowLabel', '.liveBox .eyebrow']) {
    it(`${selector} clears AA (4.5:1) on the live box paper`, () => {
      const ratio = contrast(colorOf(rule(selector)), paper);
      assert.ok(ratio >= 4.5, `${selector} is ${ratio.toFixed(2)}:1`);
    });
  }

  it('the consent sentence is full ink and legible size', () => {
    const body = rule('.liveConsent');
    assert.equal(colorOf(body), token('desk-paper-ink'));
    assert.ok(Number(body.match(/font-size:\s*(\d+)px/)?.[1]) >= 12);
  });
});
