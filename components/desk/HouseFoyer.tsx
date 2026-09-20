'use client';

import { HOUSE, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { HouseMark } from './HouseMark';
import styles from './WorkingDesk.module.css';

/**
 * Claflin foyer — one composition: house wordmark, voice promise, two open-desk doors.
 * Not a marketing homepage. Choosing a door mounts that desk immediately.
 */
export function HouseFoyer({ onEnter }: { onEnter: (id: HouseDeskId) => void }) {
  const openDesks = HOUSE_DESKS.filter(desk => isOpenDesk(desk.id));
  const planned = HOUSE_DESKS.filter(desk => !isOpenDesk(desk.id));

  return (
    <section className={styles.foyer} aria-labelledby="foyer-title">
      <div className={styles.foyerMark}>
        <HouseMark className={styles.houseMark} />
        <p className={styles.eyebrow}>CLAFLIN &amp; CO.</p>
        <h1 id="foyer-title">{HOUSE.tagline}</h1>
        <p className={styles.foyerPromise}>{HOUSE.promise}</p>
        <p className={styles.foyerNote}>
          One house. Specialist desks. Different markets. A visit is not a trade — nothing files without your review.
        </p>
      </div>
      <ul className={styles.foyerDoors} role="list">
        {openDesks.map(desk => (
          <li key={desk.id}>
            <button
              type="button"
              className={styles.foyerDoor}
              data-desk={desk.id}
              onClick={() => onEnter(desk.id)}
            >
              <span className={styles.foyerDoorName}>{desk.name}</span>
              <span className={styles.foyerDoorMarket}>{desk.market}</span>
              <span className={styles.foyerDoorAccess}>{desk.access}</span>
              <span className={styles.foyerDoorApproach}>{desk.approach}</span>
              <span className={styles.foyerDoorCue}>Open the desk →</span>
            </button>
          </li>
        ))}
      </ul>
      {planned.length > 0 && (
        <p className={styles.foyerPlanned}>
          Later rooms — {planned.map(d => `${d.shortName} (${d.market})`).join(' · ')} — remain planned.
        </p>
      )}
    </section>
  );
}
