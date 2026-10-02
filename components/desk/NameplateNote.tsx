import { BROKER_AI_DISCLAIMER, BROKER_VOICE } from '@/lib/desk/broker-voice';
import type { HouseDeskId } from '@/lib/house';
import styles from './NameplateNote.module.css';

/**
 * The nameplate — the namesake line on a desk card or room plate, opening
 * into the reviewed namesake story for whoever cares to look. A plain
 * <details>: no script, no chrome, disclosure stays opt-in.
 *
 * The disclaimer stays in the always-visible summary; the bio behind the
 * fold carries none of it — voice draws the same text through brokerBio()
 * so the story can never drift between surfaces.
 */
export function NameplateNote({ deskId, namedFor }: { deskId: HouseDeskId; namedFor: string }) {
  const voice = BROKER_VOICE[deskId];
  const name = voice?.namedFor ?? namedFor;
  if (!voice?.bio) {
    return (
      <p className={styles.nameplate}>
        Named for {name}. {BROKER_AI_DISCLAIMER}
      </p>
    );
  }
  return (
    <details className={styles.nameplate}>
      <summary>
        Named for {name}
        {voice.epithet ? `, “${voice.epithet}”` : ''}. {BROKER_AI_DISCLAIMER}
      </summary>
      <p className={styles.nameplateBio}>{voice.bio}</p>
    </details>
  );
}
