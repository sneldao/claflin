'use client';

import type { MouseEvent } from 'react';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { signatureLine } from '@/lib/desk-notes';
import { LINE_IDENTITY } from '@/lib/desk/ui-copy';
import foyerStyles from './HouseFoyer.module.css';

/** Who each broker is named for — dates fact-checked, not flavour text. */
const NAMESAKE: Partial<Record<HouseDeskId, string>> = {
  hetty: 'Hetty Green (1834–1916)',
  jesse: 'Jesse Livermore (1877–1940)',
};

/**
 * Meet the desks — character after comprehension. The only foyer section
 * where history leads; each card says plainly that the broker is AI.
 */
export function HouseDesks({ desks, deskHref, onOpen }: {
  desks: readonly HouseDesk[];
  deskHref: (id: HouseDeskId) => string;
  onOpen: (id: HouseDeskId) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (desks.length === 0) return null;
  return (
    <section className={foyerStyles.desks} id="house-desks" aria-labelledby="house-desks-title">
      <div className={foyerStyles.sectionIntro}>
        <p className={foyerStyles.kicker}>THE DESKS</p>
        <h2 id="house-desks-title">Meet the brokers.</h2>
      </div>
      <div className={foyerStyles.deskCards}>
        {desks.map(desk => {
          const voice = BROKER_VOICE[desk.id];
          const line = signatureLine(desk.id);
          return (
            <article key={desk.id} className={foyerStyles.deskCard}>
              <p className={foyerStyles.deskMeta}>{LINE_IDENTITY} · {voice?.rail ?? desk.market}</p>
              <h3 className={foyerStyles.deskName}>{desk.shortName}</h3>
              {voice && <p className={foyerStyles.deskLens}>{voice.lens}</p>}
              {line && (
                <blockquote className={foyerStyles.deskQuote}>
                  <p>{line.text}</p>
                  <cite>— {line.attribution}</cite>
                </blockquote>
              )}
              <p className={foyerStyles.deskNamesake}>
                Named for {NAMESAKE[desk.id] ?? desk.name}
                {voice ? `, “${voice.epithet}”` : ''}. An AI character, not the historical person, and no substitute for advice.
              </p>
              <a className={foyerStyles.deskOpen} href={deskHref(desk.id)} onClick={onOpen(desk.id)}>
                Visit {desk.shortName}’s desk
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
