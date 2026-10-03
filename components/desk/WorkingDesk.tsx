'use client';

import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { HOUSE_DESKS, isOpenDesk } from '@/lib/house';
import { DeskObjects } from './BrokerageRoom';
import { ClosedDesk } from './ClosedDesk';
import { DeskRoom } from './DeskRoom';
import { HettyDeskSurface } from './HettyDeskSurface';
import { IsabelDeskSurface } from './IsabelDeskSurface';
import { HalleyDeskSurface } from './HalleyDeskSurface';
import { JesseDeskSurface } from './JesseDeskSurface';
import { HouseFoyer } from './HouseFoyer';
import { HouseSceneProvider } from './HouseScene';
import styles from './WorkingDesk.module.css';

export function WorkingDesk() {
  return (
    <HouseSceneProvider>
      <WorkingDeskContent />
    </HouseSceneProvider>
  );
}

function WorkingDeskContent() {
  const desk = useTradingDesk();

  if (desk.entryPhase === 'pending') {
    /* Destination not yet resolved — the foyer shell renders with the scene
       held still so a desk URL never boots WebGL in this pass-through. */
    return <HouseFoyer onEnter={desk.enterDesk} sceneLive={false} />;
  }

  if (desk.entryPhase === 'foyer') {
    return <HouseFoyer onEnter={desk.enterDesk} sceneLive />;
  }

  if (desk.deskId === 'hetty' && desk.open) {
    return <HettyDeskSurface desk={desk} />;
  }

  if (desk.deskId === 'jesse' && desk.open) {
    return <JesseDeskSurface desk={desk} />;
  }

  if (desk.deskId === 'isabel' && desk.open) {
    return <IsabelDeskSurface desk={desk} />;
  }

  if (desk.deskId === 'halley' && desk.open) {
    return <HalleyDeskSurface desk={desk} />;
  }

  return (
    <DeskRoom
      deskId={desk.deskId}
      activeDesk={desk.activeDesk}
      open={false}
      onSwitchDesk={desk.switchDesk}
      onLeaveDesk={desk.leaveDesk}
    >
      <div className={styles.mode}>
        <strong>PLANNED DESK</strong>
        <span>Not open for quotation or recording.</span>
        <span className={styles.modeMarket}>{desk.activeDesk.market.toUpperCase()} · {desk.activeDesk.name.toUpperCase()}</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        <ClosedDesk desk={desk.activeDesk}
          returnTo={HOUSE_DESKS.find(d => isOpenDesk(d.id)) ?? null}
          onReturn={() => {
            const fallback = HOUSE_DESKS.find(d => isOpenDesk(d.id));
            if (fallback) desk.switchDesk(fallback.id);
            else desk.leaveDesk();
          }}
        />
      </div>
    </DeskRoom>
  );
}
