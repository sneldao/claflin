import { memo } from 'react';
import styles from './WorkingDesk.module.css';

export const BrokerageRoom = memo(function BrokerageRoom() {
  return <div className={styles.officeArchitecture} aria-hidden="true">
    <div className={styles.glassPartition}><i /><i /><i /><span>CLAFLIN &amp; CO.</span></div>
    <div className={styles.dispatchCabinet}>
      <div className={styles.cabinetCornice} />
      {Array.from({ length: 12 }, (_, i) => <div className={styles.pigeonhole} key={i}><b /><b /><b /></div>)}
      <div className={styles.cabinetFoot} />
    </div>
    <div className={styles.officeSafe}><div><i /><b /><span /></div></div>
  </div>;
});

export const DeskObjects = memo(function DeskObjects() {
  return <div className={styles.deskObjects} aria-hidden="true">
    <div className={styles.correspondence}>
      <i /><i />
      <div className={styles.documentFace}>
        <div className={styles.documentBorder}>
          <span>CLAFLIN &amp; CO.</span>
          <svg viewBox="0 0 120 60" fill="none">
            {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="60" cy="30" rx="27" ry="12" transform={`rotate(${i * 15} 60 30)`} />)}
            <circle cx="60" cy="30" r="10" />
            <path d="M14 18h18M14 23h13M88 37h18M93 42h13" />
          </svg>
          <i /><i /><i /><i />
        </div>
      </div>
      <div className={styles.paperRibbon} />
    </div>
    <div className={styles.closedLedger}>
      <div className={styles.ledgerPages} />
      <div className={styles.ledgerCover}><span>CLAFLIN &amp; CO.</span><b>CORRESPONDENCE</b><i /></div>
      <div className={styles.ledgerSpine}><i /><i /><i /></div>
    </div>
    <div className={styles.inkStand}>
      <svg viewBox="0 0 180 140" fill="none">
        <ellipse cx="90" cy="123" rx="78" ry="13" fill="var(--desk-occlusion)" />
        <path d="M18 103 114 85 161 109 62 132Z" fill="var(--desk-brass-dim)" stroke="var(--desk-brass)" />
        <path d="M25 97 114 81 153 102 62 123Z" fill="var(--desk-walnut)" stroke="var(--desk-brass-dim)" />
        <path d="m62 59 36-6 27 17v29l-37 8-26-16Z" fill="var(--desk-deep)" stroke="var(--desk-brass-dim)" />
        <path d="M63 60 88 76v30M88 76l36-6M67 66v22M93 82v17" stroke="var(--desk-glass)" opacity=".65" />
        <ellipse cx="92" cy="58" rx="23" ry="10" fill="var(--desk-brass-dim)" stroke="var(--desk-brass)" />
        <path d="M69 50v8c0 13 46 13 46 0v-8" fill="var(--desk-walnut-edge)" stroke="var(--desk-brass-dim)" />
        <ellipse cx="92" cy="49" rx="23" ry="10" fill="var(--desk-brass)" />
        <ellipse cx="89" cy="46" rx="15" ry="5" stroke="var(--desk-metal-light)" opacity=".6" />
        <path d="M98 107 154 13" stroke="var(--desk-deep)" strokeWidth="6" strokeLinecap="round" />
        <path d="m98 107-6 12 12-9Z" fill="var(--desk-brass)" />
        <path d="m100 104 12-20" stroke="var(--desk-brass-dim)" strokeWidth="3" />
      </svg>
    </div>
  </div>;
});

export const TapeMachine = memo(function TapeMachine() {
  return <div className={styles.tapeMachine} aria-hidden="true">
    <svg viewBox="0 0 260 240" fill="none">
      <ellipse cx="125" cy="216" rx="100" ry="18" fill="var(--desk-occlusion)" />
      <path d="M32 175v26c0 33 182 33 182 0v-26" fill="var(--desk-walnut)" stroke="var(--desk-brass-dim)" />
      <ellipse cx="123" cy="175" rx="91" ry="26" fill="var(--desk-walnut-edge)" stroke="var(--desk-brass)" />
      <path d="M45 172V85c0-85 156-85 156 0v87c0 29-156 29-156 0Z" fill="var(--desk-luster)" stroke="var(--desk-glass)" />
      <path d="M57 154V84c0-38 20-57 45-64" stroke="var(--desk-glass-light)" strokeWidth="3" opacity=".45" />
      <ellipse cx="123" cy="174" rx="77" ry="21" stroke="var(--desk-metal-light)" opacity=".45" />
      <path d="M72 167V96h16v71m66 0V93h16v74" fill="var(--desk-brass-dim)" stroke="var(--desk-brass)" />
      <path d="M74 96h92M88 127h66M88 146h66" stroke="var(--desk-brass)" strokeWidth="5" />
      <ellipse cx="126" cy="101" rx="34" ry="13" fill="var(--desk-deep)" stroke="var(--desk-brass)" />
      <path d="M94 92v11m63-11v11" stroke="var(--desk-brass)" strokeWidth="4" />
      <ellipse cx="126" cy="91" rx="34" ry="12" fill="var(--desk-brass-dim)" stroke="var(--desk-metal-light)" />
      <path d="M126 77v30m-26-21 9 13m40-13-9 13" stroke="var(--desk-walnut)" strokeWidth="3" />
      <circle cx="125" cy="146" r="14" fill="var(--desk-walnut)" stroke="var(--desk-brass)" strokeWidth="3" />
      <path d="M125 132v28m-14-14h28" stroke="var(--desk-brass-dim)" strokeWidth="2" />
      <path d="M137 148c37 0 28 51 53 51h54v14h-54c-42 0-31-51-53-51Z" fill="var(--desk-paper)" stroke="var(--desk-paper-edge)" />
      <path d="M178 186c14 26 35 12 56 18" stroke="var(--desk-paper-muted)" strokeDasharray="2 5" opacity=".45" />
    </svg>
    <div className={styles.spilledTape}><i /><i /><i /></div>
  </div>;
});
