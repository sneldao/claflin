import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESK_FILMS } from '../lib/desk-films';
import { DeskFilm } from '../components/desk/DeskFilm';
import { RoomPresentation } from '../components/desk/RoomPresentation';
import { HOUSE_DESKS } from '../lib/house';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const jesse = HOUSE_DESKS.find(desk => desk.id === 'jesse')!;
const hetty = HOUSE_DESKS.find(desk => desk.id === 'hetty')!;

const renderRoom = (desk: typeof jesse) => renderToStaticMarkup(createElement(RoomPresentation, {
  desk,
  stage: 'arrival',
  view: 'desk',
  presentation: 'room',
  onPresentation: () => {},
  onSwitchDesk: () => {},
  onLeaveDesk: () => {},
}, createElement('div')));

describe('desk film', () => {
  it('has a card for jesse and none for desks without one', () => {
    assert.ok(DESK_FILMS.jesse, 'jesse card registered');
    assert.match(DESK_FILMS.jesse!.src, /jesse-card/);
    assert.match(DESK_FILMS.jesse!.transcript, /bucket shops/);
    assert.ok(!DESK_FILMS.hetty && !DESK_FILMS.isabel && !DESK_FILMS.halley);
  });

  it('renders the chip only where a card exists', () => {
    const jesseChip = renderToStaticMarkup(createElement(DeskFilm, { deskId: 'jesse' }));
    assert.match(jesseChip, /The film/);
    const hettyChip = renderToStaticMarkup(createElement(DeskFilm, { deskId: 'hetty' }));
    assert.equal(hettyChip, '');
  });

  it('reaches the room nav and the compact nav', () => {
    assert.match(renderRoom(jesse), /The film/);
    assert.doesNotMatch(renderRoom(hetty), /The film/);
    assert.match(source('components/desk/DeskRoom.tsx'), /<DeskFilm deskId=\{deskId\}/);
    /* the film never preloads the bytes — poster only until chosen */
    const film = source('components/desk/DeskFilm.tsx');
    assert.match(film, /poster=\{film\.poster\}/);
    assert.match(film, /aria-modal="true"/);
  });
});
