/** Complete intent from a partial Jesse draft, or null — same rule the
 *  desk's session applies before it will price anything. */
import type { JesseDraft, JesseIntent } from '../solana/contracts';
import { isJesseIntent } from '../solana/contracts';

export function draftIntent(draft: JesseDraft): JesseIntent | null {
  const candidate = {
    instrumentId: draft.instrumentId,
    side: draft.side,
    unit: draft.unit,
    amount: draft.amount,
  };
  return isJesseIntent(candidate) ? candidate : null;
}
