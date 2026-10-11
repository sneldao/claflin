import './jsdom-setup';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESK_FILMS } from '../lib/desk-films';
import { HouseDesks } from '../components/desk/HouseDesks';
import { HOUSE_DESKS } from '../lib/house';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const renderDesks = () => renderToStaticMarkup(createElement(HouseDesks, {
  desks: HOUSE_DESKS,
  deskHref: (id: string) => `/?desk=${id}`,
  onOpen: () => () => {},
}));

describe('desk film', () => {
  it('has a card for jesse, hetty and tennie and none for desks without one', () => {
    assert.ok(DESK_FILMS.jesse, 'jesse card registered');
    assert.match(DESK_FILMS.jesse!.src, /jesse-card/);
    assert.match(DESK_FILMS.jesse!.transcript, /bucket shop/);
    assert.match(DESK_FILMS.jesse!.transcript, /reputedly/);
    assert.ok(DESK_FILMS.jesse!.hook && DESK_FILMS.jesse!.namesake);
    assert.ok(DESK_FILMS.hetty, 'hetty card registered');
    assert.match(DESK_FILMS.hetty!.src, /hetty-card/);
    assert.match(DESK_FILMS.hetty!.transcript, /whaling fortune/);
    assert.match(DESK_FILMS.hetty!.namesake, /Hetty Green/);
    assert.ok(DESK_FILMS.hetty!.hook);
    assert.ok(DESK_FILMS.tennie, 'tennie card registered');
    assert.match(DESK_FILMS.tennie!.src, /tennie-card/);
    assert.match(DESK_FILMS.tennie!.transcript, /Woodhull, Claflin/);
    assert.match(DESK_FILMS.tennie!.namesake, /Tennie Claflin/);
    assert.ok(DESK_FILMS.tennie!.hook);
    assert.ok(DESK_FILMS.halley, 'halley card registered');
    assert.match(DESK_FILMS.halley!.src, /halley-card/);
    assert.match(DESK_FILMS.halley!.namesake, /Edmond Halley/);
    assert.equal(DESK_FILMS.halley!.length, '45 s');
    assert.match(DESK_FILMS.halley!.hook, /wallet that decides/);
    assert.match(DESK_FILMS.halley!.transcript, /not a share/);
    assert.match(DESK_FILMS.halley!.transcript, /mark is not a peg/);
    assert.match(DESK_FILMS.halley!.transcript, /Only your wallet/);
    assert.equal(Object.keys(DESK_FILMS).length, 4);
  });

  it('turns the foyer card over only where a film exists', () => {
    const html = renderDesks();
    /* the reel tab and the portrait kicker each appear once per card */
    /* three flip-card reel tabs plus Halley's direct-plate reel control */
    assert.equal((html.match(/The reel ·/g) ?? []).length, 4);
    assert.equal((html.match(/A portrait ·/g) ?? []).length, 3);
    assert.equal((html.match(/Run the reel/g) ?? []).length, 4);
    assert.equal((html.match(/launchPlateReelLabel/g) ?? []).length, 1);
    /* the verso is inert until the card turns */
    assert.match(html, /aria-hidden="true"/);
    /* nothing autoplays: the overlay mounts only on the watch action */
    assert.doesNotMatch(html, /<video/);
    assert.doesNotMatch(html, /aria-modal/);
  });

  it('lives on the card, not the nav', () => {
    const card = source('components/desk/HouseDesks.tsx');
    assert.match(card, /DESK_FILMS\[desk\.id\]/);
    assert.match(card, /FilmOverlay/);
    assert.match(card, /aria-expanded=\{flipped\}/);
    assert.doesNotMatch(source('components/desk/RoomPresentation.tsx'), /DeskFilm/);
    assert.doesNotMatch(source('components/desk/DeskRoom.tsx'), /DeskFilm/);
    /* the film never preloads the bytes — poster only until chosen */
    const overlay = source('components/desk/FilmOverlay.tsx');
    assert.match(overlay, /poster=\{film\.poster\}/);
    assert.match(overlay, /aria-modal="true"/);
    assert.match(overlay, /preload="metadata"/);
  });

  it('runs Halley’s reel straight from the launch plate, still on choice', () => {
    const card = source('components/desk/HouseDesks.tsx');
    /* the plate reads its own film entry and mounts the overlay itself */
    const plate = card.slice(card.indexOf('function LaunchPlate'));
    assert.match(plate, /DESK_FILMS\[desk\.id\]/);
    assert.match(plate, /launchPlateReel/);
    assert.match(plate, /setWatching\(true\)/);
    assert.match(plate, /<FilmOverlay film=\{film\}/);
    /* nothing renders a video before the caller asks */
    const html = renderDesks();
    assert.doesNotMatch(html, /<video/);
    assert.doesNotMatch(html, /halley-card-v1\.mp4/);
  });

  it('portals the overlay to the body so house chrome can’t cover it', () => {
    const overlay = source('components/desk/FilmOverlay.tsx');
    assert.match(overlay, /createPortal/);
    assert.match(overlay, /document\.body/);
    /* the dialog exists only while mounted — no portal in the SSR markup */
    const html = renderDesks();
    assert.doesNotMatch(html, /filmOverlay/);
  });
});
