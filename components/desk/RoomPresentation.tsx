'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { NightDeskAnchors } from '@/lib/night-desk-scene';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { HouseDirectory } from './HouseDirectory';
import { HouseMark } from './HouseMark';
import { useHouseScene, useHouseSceneAnchors } from './HouseScene';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import type { DeskPresentation } from '@/lib/desk-presentation';
import styles from './WorkingDesk.module.css';
import sceneStyles from '../night-desk/NightDesk.module.css';

type RoomObject = {
  view: Extract<NightDeskView, 'evidence' | 'review' | 'ledger'>;
  label: string;
};

const JESSE_OBJECTS: RoomObject[] = [
  { view: 'evidence', label: 'The two markets' },
  { view: 'review', label: 'Your instruction' },
  { view: 'ledger', label: 'The ledger' },
];

const HETTY_OBJECTS: RoomObject[] = [
  { view: 'evidence', label: 'The working tray' },
  { view: 'review', label: 'Your instruction' },
  { view: 'ledger', label: 'The ledger' },
];

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
  onLeaveDesk,
  children,
}: {
  desk: HouseDesk;
  stage: NightDeskStage;
  view: NightDeskView;
  onView: (view: NightDeskView) => void;
  presentation: DeskPresentation;
  onPresentation: (mode: DeskPresentation) => void;
  onSwitchDesk: (id: HouseDeskId) => void;
  onLeaveDesk: () => void;
  children: ReactNode;
}) {
  const sharedScene = useHouseScene({ visible: true, layout: 'room', view, stage, still: false });
  const mainRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const ledgerRef = useRef<HTMLButtonElement>(null);
  const activeViewRef = useRef(view);
  useEffect(() => { activeViewRef.current = view; }, [view]);

  const applyAnchors = useCallback((anchors: NightDeskAnchors) => {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const targets = {
      evidence: evidenceRef.current,
      review: reviewRef.current,
      ledger: ledgerRef.current,
    } as const;
    for (const [key, element] of Object.entries(targets) as Array<[keyof typeof targets, HTMLButtonElement | null]>) {
      if (!element) continue;
      const anchor = anchors[key];
      if (mobile) {
        element.style.left = '';
        element.style.top = '';
        element.style.visibility = '';
        continue;
      }
      element.style.left = `${anchor.x}px`;
      element.style.top = `${anchor.y}px`;
      element.style.visibility = anchor.visible && key !== activeViewRef.current ? 'visible' : 'hidden';
    }
  }, []);
  useHouseSceneAnchors(applyAnchors);

  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || !active?.isConnected) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, []);
  const objects = desk.id === 'jesse' ? JESSE_OBJECTS : HETTY_OBJECTS;
  const objectRefs = { evidence: evidenceRef, review: reviewRef, ledger: ledgerRef } as const;
  return (
    <div
      className={`${sceneStyles.study} ${styles.roomView}`}
      data-desk={desk.id}
      data-presentation="room"
      data-shared-scene={sharedScene ? 'true' : undefined}
      data-stage={stage}
      data-view={view}
    >
      {!sharedScene && <NightDeskScene view={view} stage={stage} onAnchors={applyAnchors} />}

      <header className={styles.roomViewHeader}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Claflin home"
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onLeaveDesk();
          }}
        >
          <HouseMark className={styles.houseMark} />
          <span>
            <strong>CLAFLIN</strong>
            <small>{desk.shortName.toUpperCase()} · {desk.market.toUpperCase()} · ROOM</small>
          </span>
        </Link>
        <nav aria-label="Desk navigation" className={styles.roomViewNav}>
          <HouseDirectory activeDeskId={desk.id} onVisit={onSwitchDesk} onHome={onLeaveDesk} />
          <details className={styles.viewSwitch}>
            <summary>View</summary>
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
          </details>
        </nav>
      </header>

      <nav className={sceneStyles.roomLabels} aria-label={`Objects in ${desk.name}'s room`}>
        {objects.map(object => (
          <button
            key={object.view}
            ref={objectRefs[object.view]}
            type="button"
            className={sceneStyles.objectLabel}
            aria-pressed={view === object.view}
            onClick={() => onView(object.view)}
          >
            {object.label}
          </button>
        ))}
      </nav>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={styles.roomViewOverlay}>
        {children}
      </main>
    </div>
  );
}
