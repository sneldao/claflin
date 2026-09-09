'use client';

import { useState } from 'react';
import { HOUSE_DESKS, type HouseDeskId } from '@/lib/house';
import styles from './WorkingDesk.module.css';

export function HouseDirectory({ activeDeskId, onVisit }: { activeDeskId: HouseDeskId; onVisit: (id: HouseDeskId) => void }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.houseDirectory} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>The house</summary>
    <div className={styles.directoryPaper}>
      <p className={styles.directoryTitle}>Claflin &amp; Co.</p>
      <p className={styles.directoryNote}>One house. Specialist desks. A visit is not a trade.</p>
      <ul>
        {HOUSE_DESKS.map(desk => <li key={desk.id}>
          <button
            type="button"
            className={styles.directoryDesk}
            aria-current={desk.id === activeDeskId ? 'true' : undefined}
            onClick={() => {
              onVisit(desk.id);
              setOpen(false);
            }}
          >
            <div><strong>{desk.name}</strong><span>{desk.market}</span></div>
            <small>
              {desk.status === 'paper'
                ? desk.id === activeDeskId ? 'Here · paper' : 'Open · paper'
                : desk.id === activeDeskId ? 'Here · planned' : 'Visit · planned'}
            </small>
          </button>
        </li>)}
      </ul>
      <p className={styles.directoryFoot}>Only the Base desk can quote or file paper. Visiting another room cannot carry an approval with you.</p>
    </div>
  </details>;
}
