'use client';

import { useState } from 'react';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { getEducationTopic } from '@/lib/education';
import { EducationTopicTrigger } from './EducationTopic';
import styles from './WorkingDesk.module.css';

export function HouseDirectory({ activeDeskId, onVisit }: { activeDeskId: HouseDeskId; onVisit: (id: HouseDeskId) => void }) {
  const [open, setOpen] = useState(false);
  const participation = getEducationTopic('participation');
  const jesseLive = isOpenDesk('jesse') && DESK_CAPABILITIES.jesse.live;
  return <details className={styles.houseDirectory} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Desks</summary>
    <div className={styles.directoryPaper}>
      <p className={styles.directoryTitle}>Claflin &amp; Co.</p>
      <p className={styles.directoryNote}>
        Pick a market desk. Talk or type a trade. Review the estimate — paper by default, live when you choose.
      </p>
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
            <div>
              <strong>{desk.name}</strong>
              <span>{desk.market} · {desk.access}</span>
            </div>
            <small>
              {isOpenDesk(desk.id)
                ? desk.id === activeDeskId ? 'Here' : 'Open'
                : desk.id === activeDeskId ? 'Here · planned' : 'Planned'}
            </small>
          </button>
        </li>)}
      </ul>
      {participation && (
        <p className={styles.directoryFoot}>
          Optional house note — not required to trade.{' '}
          <EducationTopicTrigger topic={participation} label="Participation and access" />
        </p>
      )}
      <p className={styles.directoryFoot}>
        Hetty quotes on Base. Jesse quotes on Solana{jesseLive ? ' and can settle live when you choose' : ' for paper records'}. Switching desks does not carry an approval with you.
      </p>
    </div>
  </details>;
}
