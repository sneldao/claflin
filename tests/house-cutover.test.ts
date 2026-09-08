import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUSE, HOUSE_DESKS, RETIRED_CLIENT_PATHS, isRetiredMarketplaceApi } from '../lib/house';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('one canonical house', () => {
  it('starts with Hetty, paper-only execution, live voice, and planned desks marked planned', () => {
    assert.equal(HOUSE_DESKS[0].id, 'hetty');
    assert.deepEqual(HOUSE_DESKS.map(d => d.market), ['Base', 'Solana', 'Robinhood Chain', 'Arbitrum']);
    assert.equal(HOUSE.liveExecutionEnabled, false);
    assert.equal(HOUSE.voiceConversationEnabled, true);
    assert.ok(HOUSE_DESKS.slice(1).every(d => d.status === 'planned'));
  });
  it('renders the desk at root with no onboarding, directory, or automatic call entry', () => {
    const home = source('app/page.tsx');
    assert.match(home, /WorkingDesk/);
    assert.doesNotMatch(home, /Onboarding|DiscoverTab|ActiveCall|useWallet|startCall|useSearchParams|useStreak/);
    const layout = source('app/layout.tsx');
    assert.doesNotMatch(layout, /AppProviders|WidgetEngine|WalletProvider|localStorage/);
  });
  it('does not leave legacy client flows accessible via their old page routes', () => {
    const config = source('next.config.js');
    const redirectSources = ['/admin/:path*', '/broker/:id', '/dashboard', '/demo', '/list-your-broker', '/marketplace', '/profile', '/widget-probe'];
    for (const sourcePattern of redirectSources) {
      assert.ok(config.includes(`{ source: '${sourcePattern}', destination: '/', permanent: true }`), sourcePattern);
    }
    const desk = source('app/desk/page.tsx');
    assert.match(desk, /permanentRedirect\('\/'\)/);
    assert.doesNotMatch(desk, /useWallet|OnboardingFlow|Header|AgentRegistration|useEffect/);
  });
  it('has no developer navigation or directory selling points in the desk', () => {
    const desk = source('components/desk/WorkingDesk.tsx');
    assert.doesNotMatch(desk, /href="\/desk-study"|Broker directory|Exact instrument|token decimals|per minute|Start a free call|Live access|useEligibility|YOUR AI BROKER|WELCOME TO CLAFLIN|A CONSIDERED APPROACH/);
    assert.match(desk, /The pit is/);
    assert.match(desk, /About Hetty/);
    assert.match(desk, /PAPER TRADING/);
    assert.match(desk, /Hear the floor/);
    assert.doesNotMatch(desk, /startCall|auto-ring|autoRing/);
  });
  it('retires marketplace distribution without intercepting quote or webhook infrastructure', () => {
    for (const path of ['/api/agents', '/api/agents/', '/api/agents/general_helper', '/api/sdk/register', '/api/ratings']) assert.equal(isRetiredMarketplaceApi(path), true);
    for (const path of ['/api/stocks/quote', '/api/webhooks/elevenlabs', '/api/payments/settle', '/api/agentship']) assert.equal(isRetiredMarketplaceApi(path), false);
    assert.match(source('proxy.ts'), /isRetiredMarketplaceApi/);
  });
  it('aligns metadata, manifest, and error copy without fabricated call state', () => {
    assert.match(source('app/layout.tsx'), /HOUSE.title/);
    const manifest = JSON.parse(source('public/manifest.json'));
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.name, HOUSE.title);
    assert.doesNotMatch(source('app/error.tsx'), /Mascot|paged|crackled|Ring again/);
  });
});
