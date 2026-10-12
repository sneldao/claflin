import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The prove-it drawer and the vista captions — disclosure as proof.
 *
 * "Every claim on this page has a receipt" — the footer opens a checklist
 * where each claim links to the thing that proves it. And the three
 * backdrop landings carry one line of furniture-text so the scroll reads
 * as a four-act narration.
 *
 * These read the source (like foyer-rooms) so the contract is checked at
 * PR time without spinning up React. Crucially they also guard honesty:
 * every receipt must point at a real file that exists in the repo, and the
 * devnet signature must be the one the docs actually record. A house that
 * prizes verifiability cannot let a receipt rot into a dead or invented link.
 */

const p = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const foyerSource = readFileSync(p('components/desk/HouseFoyer.tsx'), 'utf8');
const receiptsSource = readFileSync(p('components/desk/foyer-receipts.ts'), 'utf8');
const foyerCss = readFileSync(p('components/desk/HouseFoyer.module.css'), 'utf8');

/** Extract the FOYER_RECEIPTS array literal from the receipts module. */
function receiptsBlock(): string {
  const start = receiptsSource.indexOf('export const FOYER_RECEIPTS');
  assert.ok(start >= 0, 'FOYER_RECEIPTS must be defined');
  const end = receiptsSource.indexOf('];', start);
  assert.ok(end > start, 'FOYER_RECEIPTS must be closed');
  return receiptsSource.slice(start, end);
}

describe('foyer — prove-it drawer', () => {
  it('opens from a footer summary that names the receipts', () => {
    assert.match(foyerSource, /<details className=\{foyerStyles\.receipts\}>/);
    assert.match(foyerSource, /Every claim on this page has a receipt/);
    assert.match(foyerSource, /className=\{foyerStyles\.receiptsSummary\}/);
  });

  it('lists every claim with a note and a link', () => {
    const block = receiptsBlock();
    for (const claim of ['dual flags', '~1,400 tests', 'devnet-verified', 'fail-closed']) {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(block, new RegExp(`claim: '${escaped}'`), `missing receipt: ${claim}`);
    }
    assert.match(foyerSource, /<strong>\{receipt\.claim\}<\/strong>/);
    assert.match(foyerSource, /\{receipt\.note\}/);
    assert.match(foyerSource, /<code>\{receipt\.label\}<\/code>/);
    assert.match(foyerSource, /<a href=\{receipt\.href\} target="_blank" rel="noreferrer">/);
  });

  it('dual-flags receipt points at the real meteora flags file, which is genuinely dual-gated', () => {
    assert.match(receiptsBlock(), /github\.com\/sneldao\/claflin\/blob\/main\/lib\/meteora\/flags\.ts/);
    const flags = readFileSync(p('lib/meteora/flags.ts'), 'utf8');
    // Fail-closed shape: client AND server, both exactly 'true', default off.
    assert.match(flags, /return halleyLiveClientEnabled\(\) && halleyLiveServerEnabled\(\)/);
    assert.match(flags, /process\.env\.NEXT_PUBLIC_HALLEY_LIVE_ENABLED === 'true'/);
    assert.match(flags, /process\.env\.HALLEY_LIVE_ENABLED === 'true'/);
  });

  it('test-count receipt points at the CI workflow that runs the suite', () => {
    assert.match(receiptsBlock(), /github\.com\/sneldao\/claflin\/blob\/main\/\.github\/workflows\/ci\.yml/);
    const ci = readFileSync(p('.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /pnpm test/, 'the CI workflow must actually run the suite');
  });

  it('devnet receipt points at a Solscan devnet tx the docs actually record', () => {
    const sig = receiptsBlock().match(/solscan\.io\/tx\/([A-Za-z0-9]+)\?cluster=devnet/);
    assert.ok(sig, 'a devnet Solscan tx link must be present');
    const doc = readFileSync(p('docs/METEORA_LAUNCH_DESK.md'), 'utf8');
    assert.ok(doc.includes(sig[1]), `the receipt's tx ${sig[1].slice(0, 12)}… must be recorded in METEORA_LAUNCH_DESK.md`);
  });

  it('fail-closed receipt points at the real env-example file', () => {
    assert.match(receiptsBlock(), /github\.com\/sneldao\/claflin\/blob\/main\/\.env\.local\.example/);
    const env = readFileSync(p('.env.local.example'), 'utf8');
    assert.match(env, /HALLEY_LIVE_ENABLED/, 'the env example must document the live flag');
    assert.match(env, /JESSE_LIVE_ENABLED/, 'the env example must document Jesse live flag too');
  });

  it('styles the drawer with house mono/brass tokens and a responsive reflow', () => {
    assert.match(foyerCss, /\.receipts \{/);
    assert.match(foyerCss, /\.receiptsSummary \{/);
    assert.match(foyerCss, /\.receiptsList \{/);
    assert.match(foyerCss, /@media \(max-width: 640px\) \{[\s\S]*?\.receiptsList a \{ grid-template-columns: 1fr; \}/);
  });
});

describe('foyer — vista captions', () => {
  it('gives all three backdrop landings one authored line each', () => {
    assert.match(foyerSource, /every instruction starts as a voice/);
    assert.match(foyerSource, /each desk owes you an estimate/);
    assert.match(foyerSource, /the last inch is yours/);
    const captions = foyerSource.match(/className=\{foyerStyles\.vistaCaption\}/g) ?? [];
    assert.equal(captions.length, 3, 'exactly three vista captions');
  });

  it('styles the caption as quiet furniture-text, not body copy', () => {
    assert.match(foyerCss, /\.vistaCaption \{/);
    assert.match(foyerCss, /\.vistaCaption \{[\s\S]*?font-family: var\(--font-display\)/);
    assert.match(foyerCss, /\.vistaCaption \{[\s\S]*?color: var\(--brass-dim\)/);
  });
});
