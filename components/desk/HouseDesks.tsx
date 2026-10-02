'use client';

import type { MouseEvent } from 'react';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { signatureLine } from '@/lib/desk-notes';
import { LINE_IDENTITY } from '@/lib/desk/ui-copy';
import { NameplateNote } from './NameplateNote';
import foyerStyles from './HouseFoyer.module.css';

function DeskCard({ desk, deskHref, onOpen }: {
  desk: HouseDesk;
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const voice = BROKER_VOICE[desk.id];
  const line = signatureLine(desk.id);
  return (
    <article className={foyerStyles.deskCard}>
      <p className={foyerStyles.deskMeta}>{LINE_IDENTITY} · {voice?.rail ?? desk.market}</p>
      <h3 className={foyerStyles.deskName}>{desk.shortName}</h3>
      {voice && <p className={foyerStyles.deskLens}>{voice.lens}</p>}
      {!voice && <p className={foyerStyles.deskLens}>{desk.approach} Typed instructions only — no line.</p>}
      {line && (
        <blockquote className={foyerStyles.deskQuote}>
          <p>{line.text}</p>
          <cite>— {line.attribution}</cite>
        </blockquote>
      )}
      <NameplateNote deskId={desk.id} namedFor={voice?.namedFor ?? desk.name} />
      <a className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={onOpen(desk.id)}>
        Visit {desk.shortName}’s desk
      </a>
    </article>
  );
}

/**
 * Meet the desks — character after comprehension. The only foyer section
 * where history leads; each card says plainly that the broker is AI.
 *
 * Two kinds of room: tape desks sit in the broker grid — they price, size,
 * and file what already trades. A launch desk makes the instrument, so it
 * stands apart on its own plate; a caller skimming for "who do I trade with"
 * should never mistake it for another line on the same book.
 */
export function HouseDesks({ desks, deskHref, onOpen }: {
  desks: readonly HouseDesk[];
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const tape = desks.filter(desk => desk.kind !== 'launch');
  const launch = desks.filter(desk => desk.kind === 'launch');
  if (tape.length === 0 && launch.length === 0) return null;
  return (
    <section className={foyerStyles.desks} id="house-desks" aria-labelledby="house-desks-title">
      <div className={foyerStyles.sectionIntro}>
        <p className={foyerStyles.kicker}>THE DESKS</p>
        <h2 id="house-desks-title">Meet the brokers.</h2>
      </div>
      {tape.length > 0 && (
        <div className={foyerStyles.deskCards}>
          {tape.map(desk => (
            <DeskCard key={desk.id} desk={desk} deskHref={deskHref} onOpen={onOpen} />
          ))}
        </div>
      )}
      {launch.map(desk => {
        const voice = BROKER_VOICE[desk.id];
        return (
          <article key={desk.id} className={foyerStyles.launchPlate}>
            <p className={foyerStyles.deskMeta}>THE LAUNCH DESK · {voice?.rail ?? desk.market}</p>
            <div className={foyerStyles.launchPlateBody}>
              <h3 className={foyerStyles.deskName}>{desk.shortName}</h3>
              <div className={foyerStyles.launchPlateCopy}>
                {voice && <p className={foyerStyles.deskLens}>{voice.lens}</p>}
                <p className={foyerStyles.launchPlateNote}>
                  Not another line on the same book — the tape desks trade what exists; this desk launches what does not yet.
                </p>
                <NameplateNote deskId={desk.id} namedFor={voice?.namedFor ?? desk.name} />
              </div>
              <a className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={onOpen(desk.id)}>
                Bring {desk.shortName} a launch
              </a>
            </div>
          </article>
        );
      })}
    </section>
  );
}
