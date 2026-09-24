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

  it('keeps Jesse Room line-led beyond an empty draft', () => {
    const surface = source('components/desk/JesseDeskSurface.tsx');
    assert.match(surface, /const lineLed = roomView && !reviewActive/);
    assert.match(surface, /const blankSlip = lineLed && !jesseLive && !instructionStarted/);
    assert.match(surface, /data-line-first=\{lineLed/);
    assert.match(surface, /blankSlip=\{blankSlip\}/);
    assert.match(surface, /quietEvidence=\{roomView\}/);
    assert.match(surface, /Type instead/);
    assert.match(surface, /BlotterHearables/);
    assert.match(surface, /ReceiverShell/);
    assert.ok(
      surface.indexOf('<JesseCall jesse=') < surface.indexOf('<JesseTicket'),
      'line mounts before the ticket',
    );
  });

  it('keeps the Jesse slip written, provenance-marked, and slip-led in review', () => {
    const surface = source('components/desk/JesseDeskSurface.tsx');
    assert.match(surface, /const slipLed = roomView && reviewActive/);
    assert.match(surface, /data-slip-led=\{slipLed/);
    assert.match(surface, /RoomTape/);
    assert.match(surface, /onLineApplied/);
    assert.match(surface, /onParsed/);
    assert.match(source('components/desk/JesseTicket.tsx'), /WrittenSlip/);
  });

  it('keeps Hetty Room line-led beyond an empty draft', () => {
    const surface = source('components/desk/HettyDeskSurface.tsx');
    assert.match(surface, /const lineLed = roomView && !reviewActive/);
    assert.match(surface, /const blankSlip = lineLed && !hettyLive && !instructionStarted/);
    assert.match(surface, /data-line-first=\{lineLed/);
    assert.match(surface, /blankSlip=\{blankSlip\}/);
    assert.match(surface, /BlotterHearables/);
    assert.match(surface, /ReceiverShell/);
    assert.ok(
      surface.indexOf('<HettyCall desk=') < surface.indexOf('<TradeTicket'),
      'line mounts before the ticket',
    );
  });

  it('keeps the Hetty slip written, provenance-marked, and slip-led in review', () => {
    const surface = source('components/desk/HettyDeskSurface.tsx');
    assert.match(surface, /const slipLed = roomView && reviewActive/);
    assert.match(surface, /data-slip-led=\{slipLed/);
    assert.match(surface, /RoomTape/);
    assert.match(surface, /onLineApplied/);
    assert.match(surface, /onDictated/);
    assert.match(surface, /provenanceFromFields/);
    assert.match(surface, /trackSuperseded/);
    assert.match(source('components/desk/TradeTicket.tsx'), /WrittenSlip/);
    assert.match(source('components/desk/TradeTicket.tsx'), /HETTY_VOCAB/);
  });

  it('shares one slip action vocabulary across both desks', () => {
    assert.match(source('lib/desk/ui-copy.ts'), /export const SLIP_ACTIONS/);
    assert.match(source('components/desk/JesseTicket.tsx'), /SLIP_ACTIONS/);
    assert.match(source('components/desk/TradeTicket.tsx'), /SLIP_ACTIONS/);
  });

  it('collapses Solana evidence behind one Room drawer', () => {
    const ticket = source('components/desk/JesseTicket.tsx');
    assert.match(ticket, /quietEvidence/);
    assert.match(ticket, /evidenceDrawer/);
    assert.match(ticket, /The two markets/);
  });

  it('drops idle speak-your-instruction call notes', () => {
    assert.doesNotMatch(source('components/desk/JesseCall.tsx'), /Speak your instruction/);
    assert.doesNotMatch(source('components/desk/HettyCallSession.tsx'), /Speak your instruction/);
  });

  it('keeps blank blotter slips until there is intent', () => {
    assert.match(source('components/desk/JesseTicket.tsx'), /BLANK_SLIP_TITLE\.jesse/);
    assert.match(source('components/desk/TradeTicket.tsx'), /BLANK_SLIP_TITLE\.hetty/);
    assert.match(source('components/desk/TradeTicket.tsx'), /WrittenSlip/);
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
    assert.doesNotMatch(foyer, /FOYER_LEDE/);
    assert.match(foyer, /FOYER_BOUNDARY/);
    assert.match(foyer, /Type instead/);
  });
});
