/**
 * Project live desk work into the Room scene vocabulary (NightDeskScene stages/views).
 * Scene is view-only — never invents quotes or files paper.
 */
import type { NightDeskStage, NightDeskView } from './night-desk-fixtures';
import type { DeskPresentationState } from './solana/contracts';
import type { JesseForeground } from './solana/desk-documents';
import type { JesseDeskStage } from './solana/controller';

export type RoomViewProjection = {
  stage: NightDeskStage;
  view: NightDeskView;
};

type JesseLike = {
  stage: JesseDeskStage;
  presentation: DeskPresentationState;
  foreground: JesseForeground;
  hasComparison: boolean;
  inFlight: 'quote' | 'compare' | null;
};

export function projectJesseToRoom(input: JesseLike): RoomViewProjection {
  const { stage, presentation, foreground, hasComparison, inFlight } = input;

  let roomStage: NightDeskStage = 'arrival';
  if (foreground.kind === 'receipt' || foreground.kind === 'archive' || stage === 'saved') {
    roomStage = 'filed';
  } else if (foreground.kind === 'quotation') {
    roomStage = 'quote';
  } else if (hasComparison || inFlight === 'compare' || presentation.focus === 'evidence') {
    roomStage = 'evidence';
  } else if (inFlight === 'quote' || stage === 'quoting' || foreground.kind === 'pending') {
    roomStage = 'conversation';
  } else if (stage === 'draft' && foreground.kind === 'draft') {
    roomStage = presentation.focus === 'desk' ? 'arrival' : 'conversation';
  } else {
    roomStage = 'conversation';
  }

  let view: NightDeskView = 'desk';
  if (presentation.focus === 'evidence' || roomStage === 'evidence') view = 'evidence';
  else if (presentation.focus === 'instruction' || roomStage === 'quote') view = 'review';
  else if (presentation.focus === 'record' || roomStage === 'filed') view = 'ledger';
  else view = 'desk';

  /* Foreground wins over stale focus when reviewing or filed */
  if (foreground.kind === 'quotation') view = 'review';
  if (foreground.kind === 'receipt' || foreground.kind === 'archive') view = 'ledger';

  return { stage: roomStage, view };
}

type HettyLike = {
  stage: string;
  foregroundKind: string;
  reviewing: boolean;
};

/** Hetty has no duplex evidence stage — map review/file onto the room. */
export function projectHettyToRoom(input: HettyLike): RoomViewProjection {
  if (input.foregroundKind === 'receipt' || input.stage === 'saved') {
    return { stage: 'filed', view: 'ledger' };
  }
  if (input.reviewing || input.stage === 'review') {
    return { stage: 'quote', view: 'review' };
  }
  if (input.stage === 'loading') {
    return { stage: 'conversation', view: 'desk' };
  }
  return { stage: 'arrival', view: 'desk' };
}
