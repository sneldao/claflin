import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseDirectory } from '../components/desk/HouseDirectory';

function renderDirectoryInEnv(env: Record<string, string>) {
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/tests/');
    require.extensions['.css'] = (m) => { m.exports = new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : String(k) }); };
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { HouseDirectory } = await import('./components/desk/HouseDirectory.tsx');
    process.stdout.write(renderToStaticMarkup(createElement(HouseDirectory, { activeDeskId: 'jesse', onVisit: () => {} })));
  `;
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--eval', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

describe('house directory capability copy', () => {
  it('does not advertise Jesse live settlement when the capability is off', () => {
    const html = renderToStaticMarkup(createElement(HouseDirectory, {
      activeDeskId: 'jesse',
      onVisit: () => {},
    }));
    assert.match(html, /Jesse quotes on Solana for paper records/);
    assert.doesNotMatch(html, /can settle live/);
    assert.match(html, /Switching desks does not carry an approval with you\./);
  });

  it('advertises live settlement only when Jesse is open and the flag is on', () => {
    const html = renderDirectoryInEnv({ NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true' });
    assert.match(html, /Jesse quotes on Solana and can settle live when you choose/);
  });
});
