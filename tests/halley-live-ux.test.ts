import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  canPrepareHalleyLaunch,
  halleyLiveIntent,
  halleyLiveIntentEquals,
  halleyLiveRecordHeading,
  halleyProposalBound,
  halleySubmitOutcome,
  liveStatusFromResponse,
} from '../lib/meteora/live-status';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function transpiles(path: string) {
  const result = ts.transpileModule(source(path), {
    fileName: path,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
}

describe('halley live launch seam', () => {
  it('stays syntactically valid beyond source-text assertions', () => {
    transpiles('components/desk/HalleyLiveLaunch.tsx');
    transpiles('components/desk/HalleyCall.tsx');
    transpiles('components/desk/HalleyPlate.tsx');
  });

  it('prepares only the unexpired reviewed intent and freezes on stale terms', () => {
    const s = source('components/desk/HalleyLiveLaunch.tsx');
    /* No prepare without an intent prop — the draft never reaches the
       ceremony directly. */
    assert.match(s, /disabled=\{!canPrepare\}/);
    /* Signing is bound to the proposal's own revision and every term. */
    assert.match(s, /halleyProposalBound\(proposal, revision, intent, address\)/);
    /* A revision, intent, or wallet change retires the prepared proposal. */
    assert.match(s, /halleyProposalBound\(proposal, revision, intent, account\) \? proposal : null/);
    assert.match(s, /Reconnect the wallet that prepared this launch, or prepare a new proposal/);
    /* Stale terms block preparation and signing, with a refresh path. */
    assert.match(s, /estimate under review has lapsed/);
    assert.match(s, /onRefreshEstimate/);
    /* A lapsed review offers a refresh, never Prepare or Sign. */
    assert.match(s, /disabled=\{stale \|\| !intent \|\| closed\}/);
    assert.match(s, />\s*Fresh estimate\s*<\/button>/);
  });

  it('survives a re-estimate without remounting the ceremony', () => {
    const s = source('components/desk/HalleyDeskSurface.tsx');
    /* The live section is not keyed on the estimate — a late draft edit
       re-renders it, it does not unmount it. */
    const liveSection = s.slice(s.indexOf('<HalleyLiveLaunch'));
    assert.doesNotMatch(liveSection.slice(0, liveSection.indexOf('/>')), /key=/);
  });

  it('reports the ceremony busy state to the parent instead of being DOM-queried', () => {
    const s = source('components/desk/HalleyLiveLaunch.tsx');
    assert.match(s, /onBusyChange\?\.\(busy\)/);
    assert.match(s, /phase === 'preparing' \|\| phase === 'signing' \|\| phase === 'submitting'/);
  });

  it('only calls the token created once the chain confirmed', () => {
    const s = source('components/desk/HalleyLiveLaunch.tsx');
    assert.match(s, /phase === 'confirmed' && proposal && \(/);
    assert.match(s, /<CreatedTokenCard/);
    assert.match(s, /TOKEN CREATED · MAINNET/);
    assert.match(s, /Copy token link/);
    /* Full addresses, not truncations, on the created card. */
    assert.match(s, /<code>\{proposal\.baseMint\}<\/code>/);
    /* Explorer mint links resolve under /token/, matching the server. */
    assert.match(s, /solscan\.io\/token\/\$\{proposal\.baseMint\}/);
    assert.doesNotMatch(s, /solscan\.io\/account\/\$\{proposal\.baseMint\}/);
    /* Confirmed ledger rows link the mint; unconfirmed never say created. */
    assert.match(s, /r\.status === 'confirmed' && r\.baseMint && \(/);
    assert.match(s, /[Tt]he mint is not confirmed\. Reconcile/);
    assert.match(s, /mint not confirmed/);
    /* The record is written at signature time with intent display fields. */
    assert.match(s, /name: proposal\.intent\.name/);
    assert.match(s, /curve: proposal\.intent\.curve/);
    /* Non-confirmed outcomes show only what the chain proved — planned
       mint/pool are text, signature transactions link out. */
    assert.match(s, /Planned mint/);
    assert.match(s, /links\.solscanUrl \|\| links\.configSolscanUrl/);
    assert.match(s, /halleyLiveRecordHeading\(phase\)/);
    /* Ledger rows link the pool only for confirmed launches. */
    assert.match(s, /r\.status === 'confirmed' && \(\s*\n?\s*<a href=\{`https:\/\/solscan\.io\/account\/\$\{r\.pool\}`\}/);
    /* The copy timer is released on unmount. */
    assert.match(s, /clearTimeout\(copyTimer\.current\)/);
    /* The wallet remains the signer — voice never appears here. */
    assert.doesNotMatch(s, /voice|ConvAI/);
  });

  it('cannot mint a duplicate — prepare is phase-gated, signing is locked', () => {
    const s = source('components/desk/HalleyLiveLaunch.tsx');
    /* Prepare refuses outside idle/review/failed — never mid-flight or
       after an uncertain or confirmed outcome. */
    assert.match(s, /canPrepareHalleyLaunch\(phase, true, false, true, true,/);
    assert.match(s, /canPrepareHalleyLaunch\(\s*\n?\s*phase, intent !== null, stale/);
    /* Sign runs only from review, against the reviewed intent, once. */
    assert.match(s, /phase !== 'review' \|\| signLock\.current/);
    assert.match(s, /signLock\.current = true/);
    assert.match(s, /signLock\.current = false;\s*\n\s*setPhase\('review'\)/);
    /* A dead connection after signatures is 'unknown', never a retryable
       failure that could double-mint. */
    assert.match(s, /catch \(err\) \{\s*\n\s*signLock\.current = false;\s*\n\s*setPhase\('unknown'\)/);
    /* A closed path disables new work but keeps the terminal record. */
    assert.match(s, /live launch path has closed/);
    assert.match(s, /stale \|\| !intent \|\| closed/);
    /* A bound proposal hides Prepare; an unbound review offers a revised
       prepare — and a rapid double event cannot start two prepares. */
    assert.match(s, /!\(phase === 'review' && bound\)/);
    assert.match(s, /Prepare revised launch/);
    assert.match(s, /prepareLock\.current = true/);
    assert.match(s, /finally \{\s*\n?\s*prepareLock\.current = false/);
  });

  it('offers a way back to the slip when nothing is under review', () => {
    const s = source('components/desk/HalleyLiveLaunch.tsx');
    assert.match(s, /!intent && !stale && \(/);
    assert.match(s, /request a fresh\s+60-second estimate/);
    assert.doesNotMatch(s, /figures refresh after readiness/);
    assert.match(s, /href="#instruction">Back to the launch slip/);
  });

  it('keeps the wallet ceremony closed to voice edits while it runs', () => {
    const s = source('components/desk/HalleyCall.tsx');
    assert.match(s, /busy: \(\) => busyRef\.current/);
    const tools = source('lib/meteora/desk-tools.ts');
    const guards = tools.match(/if \(ceremonyBusy\(\)\) return CEREMONY_BUSY;/g) ?? [];
    assert.ok(guards.length >= 10, `expected busy guards on every mutating tool, found ${guards.length}`);
  });
});

describe('halley live status classification', () => {
  it('reads the endpoint honestly — 403 disabled is not unavailable', () => {
    assert.equal(liveStatusFromResponse(200, { enabled: true }), 'enabled');
    assert.equal(liveStatusFromResponse(403, { enabled: false }), 'disabled');
    assert.equal(liveStatusFromResponse(200, { enabled: false }), 'disabled');
    assert.equal(liveStatusFromResponse(200, {}), 'unavailable');
    assert.equal(liveStatusFromResponse(200, null), 'unavailable');
    assert.equal(liveStatusFromResponse(500, { enabled: true }), 'unavailable');
    assert.equal(liveStatusFromResponse(0, null), 'unavailable');
  });

  it('the surface maps a failed fetch to unavailable, never the build flag', () => {
    const s = source('components/desk/HalleyDeskSurface.tsx');
    assert.match(s, /liveStatusFromResponse\(res\.status, body\)/);
    assert.match(s, /\.catch\(\(\) => \{ if \(!cancelled\) setLiveStatus\('unavailable'\); \}\)/);
    assert.doesNotMatch(s, /HALLEY_LIVE_CLIENT_ENABLED/);
  });
});

describe('halley live ceremony gates', () => {
  it('prepares only from quiet phases with a valid reviewed intent', () => {
    for (const phase of ['idle', 'review', 'failed'] as const) {
      assert.equal(canPrepareHalleyLaunch(phase, true, false, true, true), true, phase);
    }
    for (const phase of ['connecting', 'preparing', 'signing', 'submitting', 'confirmed', 'partial', 'unknown'] as const) {
      assert.equal(canPrepareHalleyLaunch(phase, true, false, true, true), false, phase);
    }
    assert.equal(canPrepareHalleyLaunch('idle', false, false, true, true), false);
    assert.equal(canPrepareHalleyLaunch('idle', true, true, true, true), false);
    assert.equal(canPrepareHalleyLaunch('idle', true, false, false, true), false);
    assert.equal(canPrepareHalleyLaunch('idle', true, false, true, false), false);
    /* A bound proposal under review blocks a second prepare; an unbound
       one may be revised. */
    assert.equal(canPrepareHalleyLaunch('review', true, false, true, true, true), false);
    assert.equal(canPrepareHalleyLaunch('review', true, false, true, true, false), true);
    assert.equal(canPrepareHalleyLaunch('idle', true, false, true, true, true), true);
  });

  it('keeps the ceremony mounted closed when a default-live probe closes, never on explicit paper', () => {
    assert.equal(halleyLiveIntent(null, 'enabled', true), true);
    assert.equal(halleyLiveIntent(null, 'disabled', true), true);
    assert.equal(halleyLiveIntent(null, 'unavailable', true), true);
    assert.equal(halleyLiveIntent('live', 'disabled', true), true);
    assert.equal(halleyLiveIntent('paper', 'enabled', true), false);
    assert.equal(halleyLiveIntent(null, 'disabled', false), false);
    assert.equal(halleyLiveIntent(null, 'checking', false), false);
  });

  it('binds a proposal to revision, intent, and the preparing wallet', () => {
    const intent = {
      name: 'NVDA tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC',
      curve: 'flat', supply: '1000000000', graduationQuote: '150',
    };
    const proposal = { revision: 7, wallet: 'Wa11et', intent };
    assert.equal(halleyProposalBound(proposal, 7, intent, 'Wa11et'), true);
    assert.equal(halleyProposalBound(proposal, 8, intent, 'Wa11et'), false);
    assert.equal(halleyProposalBound(proposal, 7, intent, '0ther'), false);
    assert.equal(halleyProposalBound(proposal, 7, { ...intent, supply: '1' }, 'Wa11et'), false);
    assert.equal(halleyProposalBound(proposal, 7, null, 'Wa11et'), false);
    assert.equal(halleyProposalBound(null, 7, intent, 'Wa11et'), false);
    assert.equal(halleyProposalBound(proposal, 7, intent, null), false);
  });

  it('binds a proposal to every reviewed term, not the revision alone', () => {
    const intent = {
      name: 'NVDA tracker', symbol: 'NVDAT', anchorSymbol: 'NVDA', quoteSymbol: 'USDC',
      curve: 'flat', supply: '1000000000', graduationQuote: '150',
    };
    assert.equal(halleyLiveIntentEquals(intent, { ...intent }), true);
    assert.equal(halleyLiveIntentEquals(intent, { ...intent, supply: '999' }), false);
    assert.equal(halleyLiveIntentEquals(intent, { ...intent, anchorSymbol: null }), false);
    assert.equal(halleyLiveIntentEquals(intent, { ...intent, curve: 'exponential' }), false);
  });

  it('treats HTTP errors and unexpected submit responses as unknown after signing', () => {
    assert.equal(halleySubmitOutcome(false, 'failed'), 'unknown');
    assert.equal(halleySubmitOutcome(false, 'confirmed'), 'unknown');
    assert.equal(halleySubmitOutcome(true, undefined), 'unknown');
    assert.equal(halleySubmitOutcome(true, 'confirmed'), 'confirmed');
    assert.equal(halleySubmitOutcome(true, 'partial'), 'partial');
    assert.equal(halleySubmitOutcome(true, 'failed'), 'failed');
  });

  it('names unconfirmed outcomes by what the chain proved', () => {
    assert.equal(halleyLiveRecordHeading('partial'), 'Config only — pool not confirmed');
    assert.equal(halleyLiveRecordHeading('unknown'), 'Pending chain check');
    assert.equal(halleyLiveRecordHeading('failed'), 'Checked — launch failed');
    assert.equal(halleyLiveRecordHeading('confirmed'), null);
  });
});

describe('halley voice mode wiring', () => {
  it('sends the call-rung mode as a dynamic variable, frozen at session start', () => {
    const s = source('components/desk/HalleyCall.tsx');
    assert.match(s, /desk_mode: callModeRef\.current/);
    assert.doesNotMatch(s, /desk_mode: 'paper'/);
    assert.match(s, /deskMode\?: 'paper' \| 'live'/);
    /* The session's mode is snapped when the line opens — a later status
       flip cannot recontextualize it. */
    assert.match(s, /callModeRef\.current = modeRef\.current/);
    assert.match(s, /mode: \(\) => callModeRef\.current/);
    assert.match(s, /halleyOpeningLine\(d\.state, d\.foreground, callModeRef\.current\)/);
  });

  it('pins the effective mode the moment a call rings, before status resolves', () => {
    const s = source('components/desk/HalleyDeskSurface.tsx');
    assert.match(s, /pinModeForCall/);
    assert.match(s, /onRingingChange=\{handleRinging\}/);
    assert.match(s, /onLiveChange=\{handleLineLive\}/);
    /* Pinning captures the rendered effective mode — a late probe never
       flips a rung call, and a call-pinned live still fails closed on
       screen when the probe answer goes away. */
    assert.match(s, /setModeChosen\(m => m \?\? mode\)/);
    assert.doesNotMatch(s, /liveStatusRef/);
    /* The call is told its pinned mode and its ring state. */
    assert.match(s, /liveBusy=\{liveBusy\}/);
  });

  it('keeps voice free of any signing path in either mode', () => {
    const s = source('components/desk/HalleyCall.tsx');
    for (const forbidden of ['signTransaction', 'live/prepare', 'live/submit', 'sendTransaction']) {
      assert.ok(!s.includes(forbidden), forbidden);
    }
  });
});
