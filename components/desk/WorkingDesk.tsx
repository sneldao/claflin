'use client';

import { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { OPEN_DESK_ID, getHouseDesk } from '@/lib/house';
import { DeskObjects } from './BrokerageRoom';
import { ClosedDesk } from './ClosedDesk';
import { DeskRoom } from './DeskRoom';
import { HettyDeskSurface } from './HettyDeskSurface';
import { JesseDeskSurface } from './JesseDeskSurface';
import { HouseFoyer } from './HouseFoyer';
import styles from './WorkingDesk.module.css';

export function WorkingDesk() {
  const desk = useTradingDesk();

  if (desk.entryPhase === 'pending') {
    return (
      <DeskRoom
        deskId={OPEN_DESK_ID}
        activeDesk={getHouseDesk(OPEN_DESK_ID)!}
        open={false}
        onSwitchDesk={desk.switchDesk}
      >
        <div className={styles.foyerPending} aria-busy="true" aria-label="Opening the house">
          <p className={styles.eyebrow}>CLAFLIN &amp; CO.</p>
        </div>
      </DeskRoom>
    );
  }

  if (desk.entryPhase === 'foyer') {
    return (
      <DeskRoom
        deskId={OPEN_DESK_ID}
        activeDesk={getHouseDesk(OPEN_DESK_ID)!}
        open={false}
        onSwitchDesk={desk.enterDesk}
      >
        <HouseFoyer onEnter={desk.enterDesk} />
      </DeskRoom>
    );
  }

  if (desk.deskId === 'hetty' && desk.open) {
    return <HettyDeskSurface desk={desk} />;
  }

  if (desk.deskId === 'jesse' && desk.open) {
    return <JesseDeskSurface desk={desk} />;
  }

  return (
    <DeskRoom
      deskId={desk.deskId}
      activeDesk={desk.activeDesk}
      open={false}
      onSwitchDesk={desk.switchDesk}
    >
      <div className={styles.mode}>
        <strong>PLANNED DESK</strong>
        <span>Not open for quotation or recording.</span>
        <span className={styles.modeMarket}>{desk.activeDesk.market.toUpperCase()} · {desk.activeDesk.name.toUpperCase()}</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO.</span></div>
        <DeskObjects />
        <ClosedDesk desk={desk.activeDesk} onReturn={() => desk.switchDesk('hetty')} />
      </div>
    </DeskRoom>
  );
}
