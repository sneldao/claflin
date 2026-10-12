import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isHalleyLaunchIntent, type HalleyDraft } from '../lib/meteora/contracts';
import { CURVE_HINTS, CURVE_WEIGHT_SHAPES, HALLEY_EXAMPLE, HOUSE_SUPPLY, applyDraftEdit, isBlankDraft, launchStep, missingLaunchFields, stageLabel, usesHouseEconomics } from '../lib/meteora/plate';
import { PRESET_WEIGHTS } from '../lib/meteora/dbc';
import { LAUNCH_CURVE_PRESETS } from '../lib/meteora/contracts';

const blank: HalleyDraft = {
  name: null, symbol: null, anchorSymbol: null, quoteSymbol: null,
  curve: null, supply: null, graduationQuote: null,
};

describe('Halley first-use guidance', () => {
  it('keeps the surface syntactically valid, beyond source-text assertions', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: 'HalleyDeskSurface.tsx',
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')), []);
  });
  it('offers a valid editable example without requesting or filing anything', () => {
    assert.equal(isHalleyLaunchIntent(HALLEY_EXAMPLE), true);
    assert.deepEqual(missingLaunchFields(HALLEY_EXAMPLE), []);
    assert.equal(isBlankDraft(HALLEY_EXAMPLE), false);
  });
  it('pencils house defaults on a quote change, quote-aware and never over the hand', () => {
    const named: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK' };
    const usdc = applyDraftEdit(named, {}, { quoteSymbol: 'USDC' });
    assert.equal(usdc.draft.supply, HOUSE_SUPPLY);
    assert.equal(usdc.draft.graduationQuote, '150');
    assert.equal(usdc.draft.anchorSymbol, null, 'a USDC quote does not choose an anchor for the caller');
    assert.equal(usdc.pencil.supply, 'house');
    assert.deepEqual(missingLaunchFields(usdc.draft), [], 'name + quote is enough to draw the curve');
    assert.ok(usesHouseEconomics(usdc.draft, usdc.pencil));
    /* 150 USDC must never silently become 150 NVDAx. */
    const pair = applyDraftEdit(usdc.draft, usdc.pencil, { quoteSymbol: 'NVDAx' });
    assert.equal(pair.draft.graduationQuote, '1');
    assert.equal(pair.draft.anchorSymbol, 'NVDA');
    /* The caller's own numbers survive a quote change. */
    const hand = applyDraftEdit(usdc.draft, usdc.pencil, { supply: '5000', graduationQuote: '900' });
    const kept = applyDraftEdit(hand.draft, hand.pencil, { quoteSymbol: 'AAPLx' });
    assert.equal(kept.draft.supply, '5000');
    assert.equal(kept.draft.graduationQuote, '900');
    assert.ok(!usesHouseEconomics(kept.draft, kept.pencil));
    /* Edits that don't change the quote never refill a cleared field. */
    const cleared = applyDraftEdit(usdc.draft, usdc.pencil, { supply: null });
    assert.equal(cleared.draft.supply, null);
  });

  it('never rewrites a value the caller wrote, even when it matches the house', () => {
    const named: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK' };
    const quoted = applyDraftEdit(named, {}, { quoteSymbol: 'USDC' });
    /* The caller types their own 150 — the same string the house would have
       pencilled. It is theirs, so a later quote change must not rescale it. */
    const typed = applyDraftEdit(quoted.draft, quoted.pencil, { graduationQuote: '150' });
    assert.equal(typed.pencil.graduationQuote, 'caller');
    const switched = applyDraftEdit(typed.draft, typed.pencil, { quoteSymbol: 'NVDAx' });
    assert.equal(switched.draft.graduationQuote, '150', 'a caller 150 stays 150, not 1 NVDAx');
    assert.ok(!usesHouseEconomics(switched.draft, switched.pencil));
  });

  it('respects a declined anchor instead of quietly restoring one', () => {
    const named: HalleyDraft = { ...blank, name: 'Basilisk', symbol: 'BASILISK' };
    /* "No anchor, unanchored" writes a null — the field is now the caller's. */
    const declined = applyDraftEdit(named, {}, { anchorSymbol: null });
    assert.equal(declined.pencil.anchorSymbol, 'caller');
    const later = applyDraftEdit(declined.draft, declined.pencil, { quoteSymbol: 'NVDAx' });
    assert.equal(later.draft.anchorSymbol, null, 'an equity-pair quote must not undo a declined anchor');
    /* An anchor that was never written is still the house's to suggest. */
    const untouched = applyDraftEdit(named, {}, { quoteSymbol: 'NVDAx' });
    assert.equal(untouched.draft.anchorSymbol, 'NVDA');
    assert.equal(untouched.pencil.anchorSymbol, 'house');
    /* And an anchor the caller chose by hand survives any quote change. */
    const chosen = applyDraftEdit(named, {}, { anchorSymbol: 'TSLA', quoteSymbol: 'NVDAx' });
    assert.equal(chosen.draft.anchorSymbol, 'TSLA');
  });

  it('lists missing fields in form order and allows an unanchored draft', () => {
    assert.deepEqual(missingLaunchFields(blank), ['tracker name', 'symbol', 'quote asset', 'supply', 'graduation line']);
    assert.deepEqual(missingLaunchFields({ ...HALLEY_EXAMPLE, anchorSymbol: null, curve: null }), []);
    assert.equal(isBlankDraft(blank), true);
    assert.equal(isBlankDraft({ ...blank, anchorSymbol: 'NVDA' }), false);
  });
  it('progress follows the document stage rather than claiming a launch occurred', () => {
    assert.equal(launchStep('draft', blank), 1);
    assert.equal(launchStep('draft', { ...blank, name: 'Tracker', symbol: 'TEST' }), 2);
    assert.equal(launchStep('draft', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('estimating', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('review', HALLEY_EXAMPLE), 3);
    assert.equal(launchStep('saved', HALLEY_EXAMPLE), 'done');
    assert.equal(stageLabel('draft'), 'DRAFT');
    assert.equal(stageLabel('review'), 'REVIEW');
  });
  it('does not promise a fixed price or a steep tail from liquidity weights', () => {
    assert.match(CURVE_HINTS.flat, /does not mean a fixed price/);
    assert.match(CURVE_HINTS.exponential, /liquidity weight/);
    assert.match(CURVE_HINTS['equity-pair'], /both marks are observed/);
  });
  it('wires visible hints, paper boundaries and example edits into the surface', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    for (const id of ['halley-name-hint', 'halley-symbol-hint', 'halley-anchor-hint', 'halley-curve-hint', 'halley-supply-hint', 'halley-grad-hint']) {
      assert.ok(source.includes(`id="${id}"`));
      assert.ok(source.includes(`aria-describedby="${id}"`));
    }
    assert.match(source, /halley\.edit\(\{ \.\.\.HALLEY_EXAMPLE \}\)/);
    assert.match(source, /Paper only: no token is minted/);
    assert.match(source, /Still needed:/);
    assert.match(source, /<HalleyPlate stage=\{viewed \? 'saved'/);
    assert.doesNotMatch(source, /CURVE_LABELS/);
  });
  it('offers an explicit paper/live choice above the work, answered by the runtime probe', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /aria-label="Launch path"/);
    assert.match(source, /aria-pressed=\{mode === 'live'\}/);
    assert.match(source, /aria-pressed=\{mode === 'paper'\}/);
    assert.match(source, /Create a real token/);
    assert.match(source, /Explore on paper/);
    /* The status endpoint is authoritative — the build flag alone never
       shows live, and failure closes to paper. */
    assert.match(source, /\/api\/desk\/halley\/live\/status/);
    assert.match(source, /setLiveStatus\('unavailable'\)/);
    assert.doesNotMatch(source, /HALLEY_LIVE_CLIENT_ENABLED/);
    /* Live is the default only after the probe answers enabled — and a
       later failure closes the rendered path back to paper, even over a
       live selection or a call-pinned mode. */
    assert.match(source, /halleyLiveIntent\(modeChosen, liveStatus, liveWasEnabled\)/);
    assert.match(source, /liveIntent && liveStatus === 'enabled' \? 'live' : 'paper'/);
    /* The wallet ceremony stays mounted once live was seen — a mid-flight
       probe flip closes its controls instead of unmounting it. */
    assert.match(source, /liveIntent && liveWasEnabled && !viewed/);
    assert.match(source, /closed=\{liveStatus !== 'enabled'\}/);
    /* Mode switching waits for a connected or connecting call, same rule
       as view switching. */
    assert.match(source, /End or cancel the call before changing modes/);
    /* The voice line is told the selected mode. */
    assert.match(source, /deskMode=\{mode\}/);
    assert.match(source, /<HalleyPlate[^>]*mode=\{mode\}/);
    /* While the wallet ceremony runs, review controls and mode changes wait. */
    assert.match(source, /disabled=\{liveBusy\} onClick=\{halley\.revise\}/);
    assert.match(source, /disabled=\{liveBusy\} onClick=\{halley\.cancel\}/);
    assert.match(source, /The wallet ceremony is in motion — let it settle before changing modes/);
  });
  it('keeps one continuous draft → review → wallet journey in live mode', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /Review projected launch/);
    assert.match(source, /See paper projection/);
    assert.match(source, /Continue to wallet review/);
    assert.match(source, /href="#halley-live"/);
    /* Paper filing stays possible and never becomes a live prerequisite. */
    assert.match(source, /File a paper launch/);
    /* The ceremony mounts only on the selected live path after a live
       probe answer, and is fed the unexpired reviewed intent only. */
    assert.match(source, /liveIntent && liveWasEnabled && !viewed/);
    assert.match(source, /intent=\{reviewIntent\}/);
    assert.match(source, /!expired\s*\?\s*estimate\.intent\s*:\s*null/s);
    assert.match(source, /stale=\{halley\.state\.stage === 'review' && expired\}/);
    assert.match(source, /onBusyChange=\{setLiveBusy\}/);
    /* Stage headings guide the same seven fields — nothing added. */
    for (const heading of ['Name the tracker', 'Anchor the opening', 'Set the economics']) {
      assert.match(source, new RegExp(`<h3 className=\\{plate\\.stageHeading\\}>${heading}</h3>`));
    }
    /* The heading class spans the whole fields grid — it can never push
       a label/control pair into the wrong column. */
    const css = readFileSync(new URL('../components/desk/HalleyPlate.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.stageHeading \{[^}]*grid-column: 1 \/ -1/s);
    assert.match(source, /starting reference — never a peg/);
    assert.match(source, /an economic term of the token/);
  });
  it('keeps the slip one-thing-per-screen: three folds, no self-pinning', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    /* Each stage heading lives in its own step summary — no section is
       left loose inside another step's fold. */
    for (const [n, heading] of [[1, 'Name the tracker'], [2, 'Anchor the opening'], [3, 'Set the economics']] as const) {
      assert.match(source, new RegExp(`id="halley-step-${n}" open=\\{isOpen\\('halley-step-${n}'\\)\\} onToggle=\\{onStepToggle\\('halley-step-${n}'\\)\\}>\\s*<summary className=\\{plate\\.stepSummary\\}><h3 className=\\{plate\\.stageHeading\\}>${heading}</h3>`));
    }
    /* Programmatic open changes also fire toggle; the handler must release
       the pin when the state agrees with the step function. */
    assert.match(source, /open === autoOpen\[id\]/);
  });
  it('never shows a live path done from a paper filing alone', () => {
    const plate = readFileSync(new URL('../components/desk/HalleyPlate.tsx', import.meta.url), 'utf8');
    /* Live step three is the wallet ceremony, plainly named. */
    assert.match(plate, /Review and sign with your wallet/);
    /* Paper step three is the projection review, plainly named. */
    assert.match(plate, /number === 3 \? 'Review the paper projection'/);
    /* On the live path, a paper-saved stage still reads as step three
       open — nothing counts as live-done. */
    assert.match(plate, /mode === 'live' && stage === 'saved' \? 3 : launchStep\(stage, draft\)/);
    /* Paper keeps its saved-means-done reading. */
    assert.equal(launchStep('saved', HALLEY_EXAMPLE), 'done');
    /* The live stamp names the signer; it never claims the mint happened. */
    assert.match(plate, /Live path · your wallet signs the mint/);
  });
  it('shows a wallet preflight on the live draft only, with a link to the ceremony', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /mode === 'live' && halley\.state\.stage === 'draft' && \(/);
    assert.match(source, /Before you draw the 60-second estimate: connect your Solana wallet and confirm you may launch/);
    assert.match(source, /You will review fresh figures before any signature/);
    assert.match(source, /href="#halley-live">Set up wallet first/);
    assert.match(source, /plate\.preflight/);
    const css = readFileSync(new URL('../components/desk/HalleyPlate.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.preflight \{[^}]*border-left: 2px solid var\(--desk-brass\)[^}]*background: var\(--desk-paper-light\)/s);
  });
  it('carries the mode-specific foot and a legible projected curve', () => {
    const source = readFileSync(new URL('../components/desk/HalleyDeskSurface.tsx', import.meta.url), 'utf8');
    assert.match(source, /TRACKER TOKENS ARE NOT STOCK OWNERSHIP · \{mode === 'live' \? 'ONLY YOUR WALLET CAN CREATE A TOKEN' : 'PAPER BY DEFAULT'\}/);
    /* The lead's flat-path layout — a zero-span path sits at mid-height. */
    assert.match(source, /span === 0 \? 15 : 28 - \(\(price - min\) \/ span\) \* 24/);
    const css = readFileSync(new URL('../components/desk/WorkingDesk.module.css', import.meta.url), 'utf8');
    /* The projected path is opaque paper ink, traced once to a solid line. */
    assert.match(css, /\.launchCurve \{[^}]*color: var\(--desk-paper-ink\)/s);
    assert.match(css, /\.launchCurve path \{[^}]*stroke-width: 2px/s);
    assert.match(css, /stroke-dasharray: 200;\s*\n?\s*stroke-dashoffset: 200/);
    assert.match(css, /\.launchCurveResting \{[^}]*stroke: var\(--desk-paper-muted\)/s);
    const plateCss = readFileSync(new URL('../components/desk/HalleyPlate.module.css', import.meta.url), 'utf8');
    assert.match(plateCss, /\.stageHeading \{[^}]*grid-column: 1 \/ -1;[^}]*color: #6b5a35/s);
  });
  it('draws every chip glyph from the same weights the launch config sends', () => {
    for (const preset of LAUNCH_CURVE_PRESETS) {
      assert.deepEqual([...CURVE_WEIGHT_SHAPES[preset]], PRESET_WEIGHTS[preset]);
    }
  });
});
