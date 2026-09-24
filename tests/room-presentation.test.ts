import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HOUSE_DESKS } from '../lib/house';
import { RoomPresentation } from '../components/desk/RoomPresentation';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const jesse = HOUSE_DESKS.find(desk => desk.id === 'jesse')!;
const hetty = HOUSE_DESKS.find(desk => desk.id === 'hetty')!;

const render = (desk: typeof jesse) => renderToStaticMarkup(createElement(RoomPresentation, {
  desk,
  stage: 'arrival',
  view: 'desk',
  presentation: 'room',
  onPresentation: () => {},
  onSwitchDesk: () => {},
  onLeaveDesk: () => {},
}, createElement('div', { id: 'on-desk' })));

describe('room presentation', () => {
  it('renders no floating room object labels for either desk', () => {
    for (const desk of [hetty, jesse]) {
      const html = render(desk);
      assert.doesNotMatch(html, /roomLabels|objectLabel|aria-label="Objects in/);
      assert.doesNotMatch(html, /The two markets|The working tray|Your instruction|The ledger/);
    }
  });

  it('names the desk once in the mast and drops the ROOM suffix', () => {
    const html = render(jesse);
    const mast = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.match(mast, /JESSE · SOLANA/);
    assert.doesNotMatch(mast, /· ROOM/);
  });

  it('keeps the desk navigation and view switch in the mast', () => {
    const html = render(jesse);
    assert.match(html, /aria-label="Desk navigation"/);
    assert.match(html, />View</);
    assert.match(html, /Compact/);
  });

  it('buries Room/Compact chrome and drops the object-label plumbing', () => {
    const room = source('components/desk/RoomPresentation.tsx');
    assert.doesNotMatch(room, /from 'lucide-react'/);
    assert.doesNotMatch(room, /Same paper and line/);
    assert.doesNotMatch(room, /roomLabels|objectLabel|useHouseSceneAnchors|onAnchors/);
    assert.match(room, /className=\{styles\.viewSwitch\}/);
    /* The market clock moved into the mast. */
    assert.match(room, /useMarketClock/);
    assert.match(room, /<RoomMarketClock clock=\{clock\} \/>/);
    assert.doesNotMatch(source('components/desk/JesseDeskSurface.tsx'), /RoomMarketClock/);
    assert.doesNotMatch(source('components/desk/HettyDeskSurface.tsx'), /RoomMarketClock/);
  });
});
