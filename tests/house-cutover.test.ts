import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
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
  it('puts the ticket before the room and introduces the line only once', () => {
    const desk = source('components/desk/WorkingDesk.tsx');
    assert.doesNotMatch(desk, /styles\.introduction|<HettyStatus|styles\.hettyPlate|HOUSE_DESKS\.map/);
    assert.equal(desk.match(/<HettyCall desk=/g)?.length, 1);
    assert.ok(desk.indexOf('<TradeTicket desk=') < desk.indexOf('<HettyCall desk='));
    assert.match(source('components/desk/TradeTicket.tsx'), /<h1 id="instruction-title"/);
  });
  it('shows continuity only when there is work, without hiding storage failures', () => {
    const desk = source('components/desk/WorkingDesk.tsx');
    assert.match(desk, /const hasTray = open && desk\.watched\.length > 0/);
    assert.match(desk, /const hasLedger = open && \(desk\.records\.length > 0 \|\| Boolean\(desk\.storageError\)\)/);
    assert.match(desk, /hasLedger && <PaperLedger/);
    assert.match(desk, /hasTray && <div id="on-desk"/);
    assert.doesNotMatch(desk, /hasLedger && <PaperHistory/);
  });
  it('parses the desk stylesheet and resolves its component class references', () => {
    const css = postcss.parse(source('components/desk/WorkingDesk.module.css'));
    const classes = new Set<string>();
    css.walkRules(rule => {
      for (const match of rule.selector.matchAll(/\.([A-Za-z][\w-]*)/g)) classes.add(match[1]);
    });
    for (const component of ['WorkingDesk', 'HettyCall', 'TradeTicket', 'DeskBoard', 'PaperHistory', 'PaperLedger', 'HouseDirectory', 'ClosedDesk', 'BrokerageRoom', 'TickerTape']) {
      for (const match of source(`components/desk/${component}.tsx`).matchAll(/styles\.(\w+)/g)) {
        assert.ok(classes.has(match[1]), `${component}: missing CSS class ${match[1]}`);
      }
    }
    css.walkRules(rule => {
      if (!/\[data-ledger="true"\]/.test(rule.selector) || !/\.ticket/.test(rule.selector)) return;
      if (!rule.nodes?.some(node => node.type === 'decl' && node.prop === 'grid-column' && node.value === '2')) return;
      let at = rule.parent;
      while (at && at.type !== 'root' && at.type !== 'atrule') at = at.parent;
      assert.equal(at?.type, 'atrule');
      assert.equal(at.name, 'media');
      assert.match(at.params, /min-width:\s*761px/);
    });
  });
  it('lets the house directory visit a desk without making planned desks trade', () => {
    const directory = source('components/desk/HouseDirectory.tsx');
    assert.match(directory, /HOUSE_DESKS/);
    assert.match(directory, /Visit · planned/);
    assert.match(directory, /onVisit/);
    assert.match(directory, /<button/);
    assert.doesNotMatch(directory, /requestQuote|Record paper|Ring Hetty|href=/);
    const desk = source('components/desk/WorkingDesk.tsx');
    assert.match(desk, /<ClosedDesk /);
    assert.match(desk, /switchDesk/);
    assert.match(source('components/desk/ClosedDesk.tsx'), /This desk is not open/);
    assert.match(source('components/desk/ClosedDesk.tsx'), /No quote, no paper file, no live order/);
    assert.doesNotMatch(source('components/desk/HettyCall.tsx'), /className=\{styles\.boardTitle\}>Hetty\./);
  });
  it('renders the receiver poster immediately and reveals WebGL only after its first frame', () => {
    const desk = source('components/desk/WorkingDesk.tsx');
    assert.match(desk, /import \{ DeskInstrument \} from '\.\/DeskInstrument'/);
    assert.match(desk, /<DeskInstrument eager poster="\/desk-receiver\.webp"/);
    const receiver = source('components/desk/DeskInstrument.tsx');
    assert.match(receiver, /if \(eager\)/);
    assert.match(receiver, /loading="eager"/);
    assert.match(receiver, /labelRef\.current/);
    const renderer = source('lib/desk-instrument.ts');
    assert.ok(renderer.indexOf('renderer.render(scene, camera)') < renderer.indexOf('onReady?.()'));
    const poster = readFileSync(new URL('../public/desk-receiver.webp', import.meta.url));
    assert.equal(poster.toString('ascii', 8, 12), 'WEBP');
    assert.ok(poster.length < 200_000, 'receiver first paint should stay lightweight');
  });
  it('keeps finished work out of the working tray and files it in one ledger', () => {
    const board = source('components/desk/DeskBoard.tsx');
    assert.doesNotMatch(board, /IN PROGRESS|LAST PAPER|PINNED|hasDraft/);
    assert.match(board, /WATCHING/);
    assert.match(source('lib/trading/desk-documents.ts'), /state\.stage === 'saved'/);
    const ticket = source('components/desk/TradeTicket.tsx');
    assert.match(ticket, /paperOutcomeCopy/);
    assert.match(source('lib/trading/outcomes.ts'), /Filed to your paper ledger/);
    assert.doesNotMatch(ticket, />New instruction</);
    assert.match(ticket, /Start another instruction/);
    assert.match(source('components/desk/PaperLedger.tsx'), /compactPaperEntry/);
    assert.match(source('components/desk/PaperLedger.tsx'), /The archive/);
    assert.match(source('components/desk/TradeTicket.tsx'), /paper-ledger[\s\S]*scrollIntoView/);
    assert.match(source('components/desk/PaperHistory.tsx'), /Open this record/);
  });
  it('can present a quotation slip while the voice line remains connected', () => {
    const receiver = source('components/desk/DeskInstrument.tsx');
    assert.match(receiver, /setReview\(reviewing\)/);
    assert.match(source('components/desk/WorkingDesk.tsx'), /reviewing=\{open && reviewActive\}/);
    const renderer = source('lib/desk-instrument.ts');
    const stageSetter = renderer.slice(renderer.indexOf('setStage(nextStage)'), renderer.indexOf('setReview(reviewing)'));
    assert.doesNotMatch(stageSetter, /slipTarget/);
    assert.match(renderer, /slipTarget = reviewing \? 1 : 0/);
  });
  it('keeps the receiver down until a real voice connection exists', () => {
    const call = source('components/desk/HettyCall.tsx');
    assert.match(call, /onLiveChange\(live\)/);
    assert.doesNotMatch(call, /onLiveChange\(live \|\| connecting\)/);
    const desk = source('components/desk/WorkingDesk.tsx');
    const stage = desk.slice(desk.indexOf('const instrumentStage'), desk.indexOf('const instrumentLabel'));
    assert.doesNotMatch(stage, /loading/);
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
