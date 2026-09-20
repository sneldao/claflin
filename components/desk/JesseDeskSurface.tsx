'use client';

import { useCallback, useEffect, useState } from 'react';
import { DeskInstrument } from './DeskInstrument';
import { DeskObjects } from './BrokerageRoom';
import { DeskRoom } from './DeskRoom';
import { JesseTicket } from './JesseTicket';
import { JesseLedger } from './JesseLedger';
import { JesseCommandBar } from './JesseCommandBar';
import { JesseCall } from './JesseCall';
import { useJesseDesk } from '@/lib/solana/useJesseDesk';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import { SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { signalLine } from '@/lib/trading/line-signal';
import styles from './WorkingDesk.module.css';

type Desk = ReturnType<typeof useTradingDesk>;

/**
 * Jesse's seated Solana desk — ticket, ledger, evidence, and typed/spoken
 * commands all drive the same controller session.
 */
export function JesseDeskSurface({ desk }: { desk: Desk }) {
  const jesse = useJesseDesk();
  const [spoken, setSpoken] = useState<string | null>(null);
  const [jesseLive, setJesseLive] = useState(false);

  const reviewActive = jesse.foreground.kind === 'quotation'
    || jesse.foreground.kind === 'receipt'
    || jesse.foreground.kind === 'archive';
  const stage = jesseLive
    ? (jesse.inFlight === 'quote' ? 'conversation' : reviewActive ? 'confirmation' : 'conversation')
    : jesse.inFlight === 'quote'
      ? 'conversation'
      : reviewActive
        ? 'confirmation'
        : 'arrival';
  const selected = SOLANA_INSTRUMENTS.find(s => s.id === jesse.state.draft.instrumentId);
  const instrumentLabel = jesse.foreground.kind === 'missing'
    ? 'RECORD UNAVAILABLE'
    : jesse.foreground.kind === 'archive'
      ? 'FILED RECORD · READ ONLY'
      : jesseLive
        ? (selected ? `${selected.symbol} · ON THE LINE` : 'JESSE · ON THE LINE')
        : selected
          ? `${selected.symbol} · ${jesse.foreground.kind === 'pending' || jesse.inFlight === 'quote' ? 'REQUESTING ESTIMATE' : jesse.foreground.kind === 'quotation' ? 'ESTIMATE ON THE SLIP' : 'PAPER TRADING / NO LIVE ORDERS'}`
          : 'JESSE · SOLANA PAPER';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'h' && e.key !== 'H') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      signalLine();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sayToDesk = useCallback((phrase: string) => {
    setSpoken(phrase);
    if (phrase === 'buy $100 of Apple') {
      const apple = SOLANA_INSTRUMENTS.find(s => s.symbol === 'AAPLx');
      if (apple) {
        jesse.edit({ instrumentId: apple.id, side: 'buy', unit: 'USDC', amount: '100' }, 'amount');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('instruction')?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      return;
    }
    signalLine();
  }, [jesse]);

  return (
    <DeskRoom
      deskId={desk.deskId}
      activeDesk={desk.activeDesk}
      open
      lineLive={jesseLive}
      deskStage={jesse.state.stage}
      onSwitchDesk={desk.switchDesk}
      navExtras={
        <>
          <a href="#instruction">Your ticket</a>
          <a href="#jesse-line">The line</a>
          <a href="#paper-ledger">Your record</a>
        </>
      }
    >
      <div className={styles.mode}>
        <strong>PAPER TRADING</strong>
        <span>Real Jupiter estimates, no real funds move. Kept in this browser.</span>
        <span className={styles.modeMarket}>XSTOCKS · SOLANA · JUPITER</span>
      </div>
      {jesse.state.stage === 'draft' && !jesse.state.draft.instrumentId && (
        <div className={styles.introduction} id="introduction">
          <p className={styles.eyebrow}>JESSE LIVERMORE · SOLANA</p>
          <h1>Before you trade, <span>read the tape.</span></h1>
          <p>Say or type an xStock instruction. Jesse quotes Jupiter, shows the market evidence when it is available, and waits for you to file the paper record.</p>
          <div className={styles.voiceSay} role="group" aria-label="Things you can say — tap one and the desk hears it">
            <span className={styles.voiceSayLead}>Say it — or tap it</span>
            <button type="button" onClick={() => sayToDesk('buy $100 of Apple')}>“buy $100 of Apple”</button>
            <button type="button" onClick={() => { setSpoken('compare Apple'); const apple = SOLANA_INSTRUMENTS.find(s => s.symbol === 'AAPLx'); if (apple) { jesse.edit({ instrumentId: apple.id }, 'instrument'); void jesse.compare(); } }}>“compare Apple”</button>
          </div>
        </div>
      )}
      <div className={styles.grid} data-review={reviewActive ? 'true' : 'false'} data-ledger="true" data-foreground={jesse.foreground.kind} data-live={jesseLive ? 'true' : 'false'}>
        <div className={styles.deskSurface} aria-hidden="true"><span>CLAFLIN &amp; CO. · SOLANA</span></div>
        <DeskObjects />
        <JesseTicket jesse={jesse} spokenLine={spoken} />
        <JesseLedger jesse={jesse} />
        <aside className={styles.support} aria-label="Jesse’s desk">
          <JesseCall jesse={jesse} onLiveChange={setJesseLive} onUserSpoken={setSpoken} />
          <JesseCommandBar jesse={jesse} onHeard={setSpoken} />
          <div className={styles.instrumentShell} data-stage={stage}>
            <div className={styles.instrument} data-stage={stage}>
              <DeskInstrument eager poster="/desk-receiver.webp" stage={stage} label={instrumentLabel} reviewing={reviewActive} />
            </div>
            {!jesseLive && (
              <p className={styles.receiverCue}>
                Lift the receiver — or press <kbd>H</kbd>. Speak first; the form is only how the desk writes it down.
              </p>
            )}
          </div>
          <div className={styles.deskInscription}>
            <span>The pit is downstairs.</span>
            <p>This desk is for deciding.</p>
          </div>
          <details className={styles.aboutHetty}>
            <summary>About Jesse Livermore</summary>
            <div className={styles.popoverPanel}>
              <p>Jesse Livermore is an AI character inspired by the historical trader, not the person himself or a licensed human broker. He helps you distinguish the xStock from the equity reference and read an exact Solana paper quote. He does not make the decision for you. This release is paper-only; he cannot place a live order.</p>
            </div>
          </details>
        </aside>
      </div>
    </DeskRoom>
  );
}
