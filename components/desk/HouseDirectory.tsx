'use client';

import { useEffect, useRef, useState } from 'react';
import { DESK_CAPABILITIES, HOUSE_DESKS, isOpenDesk, type HouseDeskId } from '@/lib/house';
import { getEducationTopic } from '@/lib/education';
import { EducationTopicTrigger } from './EducationTopic';
import styles from './WorkingDesk.module.css';

export function HouseDirectory({ activeDeskId, onVisit, onHome }: { activeDeskId: HouseDeskId; onVisit: (id: HouseDeskId) => void; onHome?: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);

  /* <details> does not dismiss itself — Escape returns focus to the summary,
     a tap outside folds the paper away. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      rootRef.current?.querySelector('summary')?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const participation = getEducationTopic('participation');
  const jesseLive = isOpenDesk('jesse') && DESK_CAPABILITIES.jesse.live;
  return <details ref={rootRef} className={styles.houseDirectory} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>The house</summary>
    <div className={styles.directoryPaper}>
      <p className={styles.directoryTitle}>Claflin &amp; Co.</p>
      <p className={styles.directoryNote}>
        Pick a market desk. Talk or type a trade. Review the estimate — paper by default, live when you choose.
      </p>
      <ul>
        {onHome && (
          <li>
            <button
              type="button"
              className={styles.directoryDesk}
              onClick={() => {
                onHome();
                setOpen(false);
              }}
            >
              <div>
                <strong>The foyer</strong>
                <span>Offerings · the house method</span>
              </div>
              <small>Home</small>
            </button>
          </li>
        )}
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
