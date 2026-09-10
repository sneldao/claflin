/**
 * “The delayed tape” — a short, labelled historical exercise.
 *
 * Decisions use only information available at each step. There is no live
 * wallet path, no profit leaderboard, and no claim that the prints are
 * today’s market. Reached from the tape explanation, not from the main desk.
 */

export const DELAYED_TAPE_VERSION = 1 as const;

export type DelayedTapeChoice = 'request_quote' | 'ask_size' | 'wait';

export type DelayedTapeStep = {
  id: string;
  /** What the participant may know at this moment. */
  available: string;
  /** What is deliberately withheld until later. */
  withheld: string;
  prompt: string;
  choices: readonly { id: DelayedTapeChoice; label: string }[];
};

export type DelayedTapeReveal = {
  whatActuallyPrinted: string;
  lesson: string;
  debriefPrompt: string;
};

export const DELAYED_TAPE_INTRO = {
  title: 'The delayed tape',
  label: 'LABELLED SIMULATION · NOT A MARKET · NO WALLET',
  summary:
    'You will see a short sequence of delayed prints. Decide with only what is on the page at each step. Waiting is a complete answer. Nothing here connects to a live desk or a real venue.',
} as const;

const NEUTRAL_CHOICES = [
  { id: 'request_quote' as const, label: 'Request a current quote' },
  { id: 'ask_size' as const, label: 'Ask about available size' },
  { id: 'wait' as const, label: 'Wait' },
];

export const DELAYED_TAPE_STEPS: readonly DelayedTapeStep[] = [
  {
    id: 'open',
    available: 'Print 1 (delayed): the last sale of “Eastern Rail” shows 42. The parlor posts it as the tape.',
    withheld: 'You do not yet know the bid, the offer, the size behind the print, or whether the print is already minutes old.',
    prompt: 'With only this print, what do you do?',
    choices: NEUTRAL_CHOICES,
  },
  {
    id: 'second',
    available: 'Print 2 (still delayed): Eastern Rail 44. The room murmurs that the stock is “running.”',
    withheld: 'You still have no executable size. The parlor has not bought or sold the shares for you.',
    prompt: 'The second print is higher. What do you do next?',
    choices: NEUTRAL_CHOICES,
  },
  {
    id: 'gap',
    available: 'The machine pauses. Someone says the wire is behind. Another insists the last price “must still be good.”',
    withheld: 'The true next sale — and whether any market would have filled you — remains unknown.',
    prompt: 'When the tape goes quiet, what do you do?',
    choices: NEUTRAL_CHOICES,
  },
];

export const DELAYED_TAPE_REVEAL: DelayedTapeReveal = {
  whatActuallyPrinted:
    'When the wire caught up, Eastern Rail printed 39 on an exchange the parlor never reached. Customers who “bought at 42” were settling a difference against the shop — they never owned the rail.',
  lesson:
    'A delayed print is a story about someone else’s trade. An estimate on Claflin’s slip is a different object: time-limited, venue-specific, and only actionable when the product says so. Paper mode labels the simulation; a bucket shop often did not.',
  debriefPrompt:
    'In your own words: what did you know at each step, what information would a quote or size have added, and what did waiting preserve? There is no score.',
};

export type DelayedTapeProgress = {
  stepIndex: number;
  choices: DelayedTapeChoice[];
  complete: boolean;
};

export function initialDelayedTapeProgress(): DelayedTapeProgress {
  return { stepIndex: 0, choices: [], complete: false };
}

export function applyDelayedTapeChoice(
  progress: DelayedTapeProgress,
  choice: DelayedTapeChoice,
): DelayedTapeProgress {
  if (progress.complete) return progress;
  const choices = [...progress.choices, choice];
  const nextIndex = progress.stepIndex + 1;
  if (nextIndex >= DELAYED_TAPE_STEPS.length) {
    return { stepIndex: progress.stepIndex, choices, complete: true };
  }
  return { stepIndex: nextIndex, choices, complete: false };
}

/** Reflection only — choices are not graded. */
export function delayedTapeDebrief(_choices: readonly DelayedTapeChoice[]): string {
  return 'Your choices are recorded for reflection. The reveal is the lesson — there is no score for which path you took. Notice what a current quote or available size would have told you that a delayed print could not.';
}
