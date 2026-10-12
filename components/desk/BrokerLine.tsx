'use client';

import { BROKER_VOICE } from '@/lib/desk/broker-voice';
import { signatureLine } from '@/lib/desk-notes';
import { getHouseDesk, type HouseDeskId } from '@/lib/house';
import type { DiscussionCaption as Caption } from '@/lib/hetty/discussion';
import { NameplateNote } from './NameplateNote';
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
      <NameplateNote
        deskId={deskId}
        namedFor={getHouseDesk(deskId)?.name ?? deskId}
      />
    </div>
  );
}

/** How many turns stand on the tape before receding into the fold. */
export const CAPTION_TAPE = 3;

/** The tape of the call, sized to the panel rather than the conversation:
 *  the newest turn in full, the prior turns clamped and dimmed (the tape
 *  receding), and the whole call behind one fold. Text is never dropped —
 *  clamping is visual, so assistive tech still reads every turn.
 *  Presentational only; lifecycle and storage stay in the call panels. */
export function LineCaptions({ captions, brokerName, applied }: {
  captions: readonly Caption[];
  brokerName: string;
  applied: string | null;
}) {
  const recent = captions.slice(-CAPTION_TAPE);
  const speaker = (c: Caption) => (c.role === 'user' ? 'You' : brokerName);
  return (
    <>
      {recent.map((caption, i) => (
        <p key={`${caption.at}-${i}`} className={styles.captionLine}
          data-voice={caption.role === 'agent' ? 'broker' : 'caller'}
          data-tail={i < recent.length - 1 ? 'true' : undefined}>
          <span>{speaker(caption)}.</span> {caption.text}
        </p>
      ))}
      {applied && <p className={styles.captionApplied}>{applied}</p>}
      {captions.length > CAPTION_TAPE && (
        <details className={styles.captionHistory}>
          <summary>Whole call ({captions.length} lines)</summary>
          <ol>
            {captions.map((c, i) => (
              <li key={`${c.at}-${i}`} data-voice={c.role}>
                <span>{speaker(c)}.</span> {c.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
