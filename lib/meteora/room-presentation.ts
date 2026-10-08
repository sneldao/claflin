import type { NightDeskStage, NightDeskView } from '../night-desk-fixtures';
import type { PlateStage } from './plate';
import type { DeskForegroundKind } from '../desk/contracts';

/** Scene posture follows the paper document; it never implies a deployed mint. */
export function projectHalleyToRoom({ stage, foreground, live }: {
  stage: PlateStage;
  foreground: DeskForegroundKind;
  live: boolean;
}): { stage: NightDeskStage; view: NightDeskView } {
  if (foreground === 'missing') return { stage: 'arrival', view: 'ledger' };
  if (foreground === 'archive' || foreground === 'receipt' || stage === 'saved') {
    return { stage: 'filed', view: 'ledger' };
  }
  if (foreground === 'quotation' || stage === 'review') {
    return { stage: 'quote', view: 'review' };
  }
  if (stage === 'estimating' || live) {
    return { stage: 'conversation', view: 'desk' };
  }
  return { stage: 'arrival', view: 'desk' };
}
