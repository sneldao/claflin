'use client';

import type { DeskInstrumentStage } from '@/lib/desk-instrument';
import { DeskInstrument } from './DeskInstrument';
import { RECEIVER_CUE_LEAD, RECEIVER_CUE_TAIL } from '@/lib/desk/ui-copy';
import styles from './WorkingDesk.module.css';

/** Shared receiver affordance — Compact and Room both show it. */
export function ReceiverShell({
  stage,
  label,
  reviewing,
  brokerName,
  lineTargetId,
  live,
}: {
  stage: DeskInstrumentStage;
  label: string;
  reviewing: boolean;
  brokerName: string;
  lineTargetId: string;
  live: boolean;
}) {
  return (
    <div className={styles.instrumentShell} data-stage={stage}>
      <div className={styles.instrument} data-stage={stage}>
        <DeskInstrument
          eager
          poster="/desk-receiver.webp"
          stage={stage}
          label={label}
          reviewing={reviewing}
          brokerName={brokerName}
          lineTargetId={lineTargetId}
        />
      </div>
      {!live && (
        <p className={styles.receiverCue}>
          {RECEIVER_CUE_LEAD} <kbd>H</kbd>{RECEIVER_CUE_TAIL}
        </p>
      )}
    </div>
  );
}
