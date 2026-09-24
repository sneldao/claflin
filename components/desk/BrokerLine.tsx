'use client';

import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { signatureLine } from '@/lib/desk-notes';
import { getHouseDesk, type HouseDeskId } from '@/lib/house';
import type { DiscussionCaption as Caption } from '@/lib/hetty/discussion';
import styles from './WorkingDesk.module.css';

/** The broker's take — shared by the desk plate and the foyer card. */
export function BrokerTake({ deskId, take, className }: { deskId: HouseDeskId; take: string | null | undefined; className?: string }) {
  if (!take) return null;
  const broker = getHouseDesk(deskId)?.shortName ?? 'The broker';
  return (
    <div className={className ?? styles.lineTake}>
      <p className={styles.lineTakeEyebrow}>{broker}’s take</p>
      <p className={styles.lineTakeText}>{take}</p>
      <p className={styles.lineTakeNote}>A way of looking — not advice.</p>
    </div>
  );
}

/** Idle hero on the desk call panel — the broker's voice before the line is
 *  open: signature line and, when the tape gives one, their take.
 *  In Room (`compact`) the plate says nothing at all — the mast already
 *  named the broker and the ring button carries the action. */
export function BrokerLinePlate({ deskId, take, compact = false }: { deskId: HouseDeskId; take?: string | null; compact?: boolean }) {
  const signature = signatureLine(deskId);
  if (compact) return null;
  return (
    <div className={styles.linePlate}>
      {signature && (
        <blockquote className={styles.lineSignature}>
          <p>{signature.text}</p>
          <cite>— {signature.attribution}</cite>
        </blockquote>
      )}
      {BROKER_VOICE[deskId] && <p className={styles.lineLens}>{BROKER_VOICE[deskId]!.lens}</p>}
      <BrokerTake deskId={deskId} take={take} />
    </div>
  );
}

/** The last four lines of the discussion, in order — the tape of the call.
 *  Presentational only; lifecycle and storage stay in the call panels. */
export function LineCaptions({ captions, brokerName, applied, discussion }: {
  captions: readonly Caption[];
  brokerName: string;
  applied: string | null;
  discussion: string | null;
}) {
  const recent = captions.slice(-4);
  return (
    <>
      {recent.map((caption, i) => (
        <p key={`${caption.at}-${i}`} className={styles.captionLine} data-voice={caption.role === 'agent' ? 'broker' : 'caller'}>
          <span>{caption.role === 'user' ? 'You' : brokerName}.</span> {caption.text}
        </p>
      ))}
      {applied && <p className={styles.captionApplied}>{applied}</p>}
      {discussion && <p className={styles.captionApplied}>{discussion}</p>}
    </>
  );
}
