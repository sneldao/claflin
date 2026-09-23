import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * House presence contract — foyer, Hetty, and Jesse share one grammar:
 * ring first, blank slip until intent, one boundary line, no Lucide hero chrome.
 */
describe('house presence grammar', () => {
  it('shares blotter, receiver, and room clock pieces', () => {
    assert.match(source('components/desk/BlotterHearables.tsx'), /Things the desk hears/);
    assert.match(source('components/desk/ReceiverShell.tsx'), /RECEIVER_CUE_LEAD/);
    assert.match(source('components/desk/RoomMarketClock.tsx'), /roomMarketClock/);
  });

  it('puts the line first in Jesse Room when the slip is blank', () => {
    const surface = source('components/desk/JesseDeskSurface.tsx');
    assert.match(surface, /data-line-first=\{lineFirst/);
    assert.match(surface, /blankSlip=\{lineFirst\}/);
    assert.match(surface, /BlotterHearables/);
    assert.match(surface, /ReceiverShell/);
    assert.ok(surface.indexOf('<JesseCall ') < surface.indexOf('<JesseTicket '), 'line mounts before the ticket');
  });

  it('puts the line first in Hetty Room when the slip is blank', () => {
    const surface = source('components/desk/HettyDeskSurface.tsx');
    assert.match(surface, /data-line-first=\{lineFirst/);
    assert.match(surface, /blankSlip=\{lineFirst\}/);
    assert.match(surface, /BlotterHearables/);
    assert.match(surface, /ReceiverShell/);
    assert.ok(surface.indexOf('<HettyCall ') < surface.indexOf('<TradeTicket'), 'line mounts before the ticket');
  });

  it('keeps blank blotter slips until there is intent', () => {
    assert.match(source('components/desk/JesseTicket.tsx'), /BLANK_SLIP_TITLE\.jesse/);
    assert.match(source('components/desk/TradeTicket.tsx'), /BLANK_SLIP_TITLE\.hetty/);
    assert.match(source('components/desk/TradeTicket.tsx'), /HAND_FORM_SUMMARY/);
  });

  it('says the line foot once from shared copy', () => {
    const copy = source('lib/desk/ui-copy.ts');
    assert.match(copy, /export const LINE_FOOT/);
    assert.match(copy, /export const FOYER_BOUNDARY/);
    assert.match(source('components/desk/JesseCall.tsx'), /LINE_FOOT/);
    assert.match(source('components/desk/HettyCallSession.tsx'), /LINE_FOOT/);
    assert.doesNotMatch(source('components/desk/JesseCall.tsx'), /Voice fills the slip/);
    assert.doesNotMatch(source('components/desk/HettyCallSession.tsx'), /Voice fills the slip/);
  });

  it('locks the Stocklana judge URL to Room view', () => {
    const pack = source('docs/STOCKLANA_SUBMISSION.md');
    assert.match(pack, /\?desk=jesse&view=room/);
    assert.match(pack, /Ring first/);
  });

  it('keeps foyer Ring as hero without Lucide chrome', () => {
    const foyer = source('components/desk/HouseFoyer.tsx');
    assert.doesNotMatch(foyer, /from 'lucide-react'/);
    assert.match(foyer, /FOYER_LEDE/);
    assert.match(foyer, /FOYER_BOUNDARY/);
    assert.match(foyer, /Type instead/);
  });
});
