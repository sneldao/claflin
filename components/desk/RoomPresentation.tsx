'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import type { NightDeskStage, NightDeskView } from '@/lib/night-desk-fixtures';
import type { HouseDesk, HouseDeskId } from '@/lib/house';
import { HouseDirectory } from './HouseDirectory';
import { HouseMark } from './HouseMark';
import { RoomMarketClock } from './RoomMarketClock';
import { useHouseGraphics, useHouseScene } from './HouseScene';
import { GraphicsControl } from './GraphicsControl';
import { NightDeskScene } from '../night-desk/NightDeskScene';
import { DeskAuthChip } from './DeskAuthChip';
import { useMarketClock } from '@/lib/use-market-clock';
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
  presentation,
  onPresentation,
  onSwitchDesk,
  onLeaveDesk,
  showPaperImport = false,
  anonymousCount = 0,
  importStatus = 'idle',
  onImportAnonymous,
  tape,
  tapeAt = null,
  children,
}: {
  desk: HouseDesk;
  stage: NightDeskStage;
  view: NightDeskView;
  presentation: DeskPresentation;
  onPresentation: (mode: DeskPresentation) => void;
  onSwitchDesk: (id: HouseDeskId) => void;
  onLeaveDesk: () => void;
  showPaperImport?: boolean;
  anonymousCount?: number;
  importStatus?: 'idle' | 'pending' | 'done' | 'failed';
  onImportAnonymous?: () => void;
  /** Reference-tape freshness from the active desk — warms the shared lamp. */
  tape?: 'fresh' | 'stale';
  /** Reading timestamp — a new value re-prints the lamp's fresh glow. */
  tapeAt?: number | null;
  children: ReactNode;
}) {
  const sharedScene = useHouseScene({ visible: true, layout: 'room', view, stage, still: false, tape, tapeAt });
  const graphics = useHouseGraphics();
  const clock = useMarketClock();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || !active?.isConnected) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, []);
  return (
    <div
      className={`${sceneStyles.study} ${styles.roomView}`}
      data-desk={desk.id}
      data-presentation="room"
      data-shared-scene={sharedScene ? 'true' : undefined}
      data-stage={stage}
      data-view={view}
      data-tape={tape}
    >
      {!sharedScene && <NightDeskScene view={view} stage={stage} tape={tape} tapeAt={tapeAt} still={!graphics.ready || graphics.lightweight} />}

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
            <small>{desk.shortName.toUpperCase()} · {desk.market.toUpperCase()}</small>
          </span>
        </Link>
        <div className={styles.roomViewMast}>
          <RoomMarketClock clock={clock} />
          <nav aria-label="Desk navigation" className={styles.roomViewNav}>
            <HouseDirectory activeDeskId={desk.id} onVisit={onSwitchDesk} onHome={onLeaveDesk} />
            <GraphicsControl />
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
            <DeskAuthChip
              showPaperImport={showPaperImport}
              anonymousCount={anonymousCount}
              importStatus={importStatus}
              onImportAnonymous={onImportAnonymous}
            />
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={styles.roomViewOverlay}>
        {children}
      </main>
    </div>
  );
}
