'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, FileText, LineChart } from 'lucide-react';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { HouseDesk } from '@/lib/house';
import { HouseDirectory } from './HouseDirectory';
import { HouseMark } from './HouseMark';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import type { HouseDeskId } from '@/lib/house';
import type { DeskPresentation } from '@/lib/desk-presentation';
import styles from './WorkingDesk.module.css';
import sceneStyles from '../night-desk/NightDesk.module.css';

/**
 * Room view chrome — NightDeskScene plus HTML work overlays for the active desk.
 * Children are semantic ticket/line/ledger. Scene never authorizes.
 */
export function RoomPresentation({
  desk,
  stage,
  view,
  onView,
  presentation,
  onPresentation,
  onSwitchDesk,
  navExtras,
  children,
}: {
  desk: HouseDesk;
  stage: NightDeskStage;
  view: NightDeskView;
  onView: (view: NightDeskView) => void;
  presentation: DeskPresentation;
  onPresentation: (mode: DeskPresentation) => void;
  onSwitchDesk: (id: HouseDeskId) => void;
  navExtras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`${sceneStyles.study} ${styles.roomView}`}
      data-desk={desk.id}
      data-presentation="room"
      data-stage={stage}
      data-view={view}
    >
      <NightDeskScene view={view} stage={stage} />

      <header className={styles.roomViewHeader}>
        <Link href="/" className={styles.brand} aria-label="Claflin home">
          <HouseMark className={styles.houseMark} />
          <span>
            <strong>CLAFLIN</strong>
            <small>{desk.shortName.toUpperCase()} · {desk.market.toUpperCase()} · ROOM</small>
          </span>
        </Link>
        <nav aria-label="Desk navigation" className={styles.roomViewNav}>
          <HouseDirectory activeDeskId={desk.id} onVisit={onSwitchDesk} />
          {navExtras}
          <div className={styles.presentationToggle} role="group" aria-label="Desk view">
            <button
              type="button"
              className={styles.presentationButton}
              aria-pressed={presentation === 'room'}
              onClick={() => onPresentation('room')}
            >
              Room
            </button>
            <button
              type="button"
              className={styles.presentationButton}
              aria-pressed={presentation === 'compact'}
              onClick={() => onPresentation('compact')}
            >
              Compact
            </button>
          </div>
        </nav>
      </header>

      <nav className={sceneStyles.roomLabels} aria-label="Objects in the room">
        <button type="button" className={sceneStyles.objectLabel} onClick={() => onView('evidence')}>
          <LineChart size={13} />The two markets
        </button>
        <button type="button" className={sceneStyles.objectLabel} onClick={() => onView('review')}>
          <FileText size={13} />Your instruction
        </button>
        <button type="button" className={sceneStyles.objectLabel} onClick={() => onView('ledger')}>
          <BookOpen size={13} />The ledger
        </button>
      </nav>

      <div className={styles.roomViewOverlay}>
        <p className={styles.roomViewKicker} role="status">
          Same paper and line · layout only
        </p>
        {children}
      </div>
    </div>
  );
}
