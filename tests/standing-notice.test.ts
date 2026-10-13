import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The standing notice makes factual claims about a deployment: which desks can
 * settle live, and under what caps. A claim there that drifts from the code is
 * worse than no claim, so the notice's copy is asserted against the same
 * modules the page renders from, in a subprocess with controlled env.
 *
 * The page is a server component importing next/link and a CSS module, neither
 * of which renders under tsx — so the claims are tested at the data layer
 * (standingCapability) and the page is checked to read from it.
 */

const pageSource = readFileSync(new URL('../app/standing/page.tsx', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');
const standingSource = readFileSync(new URL('../lib/desk/standing.ts', import.meta.url), 'utf8');
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Import standingCapability with a given env — the flags bake at module load. */
function capabilityInEnv(env: Record<string, string>): string {
  const script = `
    const { standingCapability } = await import('./lib/desk/standing.ts');
    process.stdout.write(JSON.stringify(standingCapability()));
  `;
  return execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe('the standing notice', () => {
  it('reports no live capability when every client flag is off', () => {
    const cap = JSON.parse(capabilityInEnv({
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'false',
      NEXT_PUBLIC_LIVE_EXECUTION_ENABLED: 'false',
      NEXT_PUBLIC_HALLEY_LIVE_ENABLED: 'false',
    }));
    assert.deepEqual(cap.liveDesks, []);
    assert.equal(cap.jesseCaps, null);
    assert.equal(cap.halleyCaps, null);
    assert.equal(cap.verdict, 'none — paper only');
    /* Every desk must be named paper, including the three that can go live. */
    assert.deepEqual(cap.paperDesks, [
      'Hetty (Base)', 'Jesse (Solana)', 'Tennie (Robinhood Chain)', 'Halley (Meteora launches)',
    ]);
  });

  it('reports Jesse live and reads the caps from the live module, not by hand', () => {
    const cap = JSON.parse(capabilityInEnv({
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true',
      NEXT_PUBLIC_LIVE_EXECUTION_ENABLED: 'false',
    }));
    assert.deepEqual(cap.liveDesks, ['Jesse']);
    /* The numbers come from JESSE_LIVE_LIMITS, so a cap change cannot leave
       the page claiming a stale one. */
    assert.match(cap.jesseCaps, /^capped at 250 USDC per buy and 10 tokens per sell$/);
    assert.equal(cap.verdict, 'Jesse live');
  });

  it('reports Halley live and reads the curve cap from the live module', () => {
    const cap = JSON.parse(capabilityInEnv({
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'false',
      NEXT_PUBLIC_LIVE_EXECUTION_ENABLED: 'false',
      NEXT_PUBLIC_HALLEY_LIVE_ENABLED: 'true',
    }));
    assert.deepEqual(cap.liveDesks, ['Halley']);
    /* The number comes from HALLEY_SWAP_LIMITS, so a cap change cannot leave
       the page claiming a stale one. */
    assert.match(cap.halleyCaps, /^curve buys capped at 10000 quote units per order$/);
    assert.equal(cap.verdict, 'Halley live');
    assert.ok(!cap.paperDesks.includes('Halley (Meteora launches)'));
  });

  it('never claims Tennie can settle live — no flag may promote her', () => {
    const cap = JSON.parse(capabilityInEnv({
      NEXT_PUBLIC_JESSE_LIVE_ENABLED: 'true',
      NEXT_PUBLIC_LIVE_EXECUTION_ENABLED: 'true',
      NEXT_PUBLIC_HALLEY_LIVE_ENABLED: 'true',
    }));
    assert.ok(!cap.liveDesks.includes('Tennie'));
    assert.ok(cap.paperDesks.includes('Tennie (Robinhood Chain)'));
  });

  it('reads its capability copy from the standing module, never inline', () => {
    assert.match(pageSource, /standingCapability\(\)/);
    assert.match(pageSource, /STANDING_UNANSWERED/);
    assert.match(pageSource, /STANDING_ELIGIBILITY/);
    /* No hand-typed caps or desk names in the page body. */
    assert.doesNotMatch(pageSource, /250 USDC|10 tokens/);
  });

  it('prints the unresolved broker-dealer question rather than smoothing it over', () => {
    assert.match(standingSource, /regulated broker-dealer/);
    assert.match(pageSource, /unresolved/);
    assert.match(pageSource, /no live path is opened to customers/);
  });

  it('labels eligibility honestly and keeps the US restriction intact', () => {
    /* The strings live in the module so the page and the test read one copy. */
    assert.match(standingSource, /headline: 'not offered to US persons'/);
    assert.match(standingSource, /mechanism: 'self-declaration'/);
    assert.match(standingSource, /standing: 'not a legal determination'/);
    /* Never a claim that the house determines eligibility. */
    assert.match(pageSource, /does not determine your eligibility/);
  });

  it('states plainly that Claflin is not a brokerage and takes no custody', () => {
    assert.match(pageSource, /not a brokerage service/);
    assert.match(pageSource, /not investment advice/);
    assert.match(pageSource, /Claflin holds no keys to your funds/);
  });
});