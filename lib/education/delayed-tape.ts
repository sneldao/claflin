/**
 * “The delayed tape” — a short, labelled historical exercise.
 *
 * Decisions use only information available at each step. There is no live
 * wallet path, no profit leaderboard, and no claim that the prints are
 * today’s market. Reached from the tape explanation, not from the main desk.
 */

export const DELAYED_TAPE_VERSION = 1 as const;

export type DelayedTapeChoice = 'buy' | 'stand_aside' | 'sell_short_idea';

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
    'You will see a short sequence of delayed prints. Decide with only what is on the page at each step. Standing aside is a complete answer. Nothing here connects to a live desk or a real venue.',
} as const;

export const DELAYED_TAPE_STEPS: readonly DelayedTapeStep[] = [
  {
    id: 'open',
    available: 'Print 1 (delayed): the last sale of “Eastern Rail” shows 42. The parlor posts it as the tape.',
    withheld: 'You do not yet know the bid, the offer, the size behind the print, or whether the print is already minutes old.',
    prompt: 'With only this print, what do you do?',
    choices: [
      { id: 'buy', label: 'Act as if 42 is yours to take' },
      { id: 'stand_aside', label: 'Stand aside — a print is not an offer' },
      { id: 'sell_short_idea', label: 'Assume the next print must be lower' },
    ],
  },
  {
    id: 'second',
    available: 'Print 2 (still delayed): Eastern Rail 44. The room murmurs that the stock is “running.”',
    withheld: 'You still have no executable size. The parlor has not bought or sold the shares for you.',
    prompt: 'The second print is higher. What changes?',
    choices: [
      { id: 'buy', label: 'Chase the advance on the parlor’s tape' },
      { id: 'stand_aside', label: 'Wait — excitement is not a quotation' },
      { id: 'sell_short_idea', label: 'Fade the move without a venue' },
    ],
  },
  {
    id: 'gap',
    available: 'The machine pauses. Someone says the wire is behind. Another insists the last price “must still be good.”',
    withheld: 'The true next sale — and whether any market would have filled you — remains unknown.',
    prompt: 'When the tape goes quiet, what is still true?',
    choices: [
      { id: 'buy', label: 'Treat the last print as a live offer' },
      { id: 'stand_aside', label: 'Refuse to invent a price in the gap' },
      { id: 'sell_short_idea', label: 'Assume a crash you have not seen' },
    ],
  },
];

export const DELAYED_TAPE_REVEAL: DelayedTapeReveal = {
  whatActuallyPrinted:
    'When the wire caught up, Eastern Rail printed 39 on an exchange the parlor never reached. Customers who “bought at 42” were settling a difference against the shop — they never owned the rail.',
  lesson:
    'A delayed print is a story about someone else’s trade. An estimate on Claflin’s slip is a different object: time-limited, venue-specific, and only actionable when the product says so. Paper mode labels the simulation; a bucket shop often did not.',
  debriefPrompt:
    'In your own words: what did you know at each step, what did you invent, and why might standing aside be the disciplined answer? There is no score.',
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

/** Soft debrief — values reasoning, including choosing not to trade. */
export function delayedTapeDebrief(choices: readonly DelayedTapeChoice[]): string {
  const aside = choices.filter(c => c === 'stand_aside').length;
  if (aside === choices.length) {
    return 'You treated every print as information, not permission. That reading matches the lesson.';
  }
  if (aside > 0) {
    return 'You stood aside at least once. Notice which prints tempted action, and whether the missing bid/offer should have stopped you sooner.';
  }
  return 'You acted on prints alone. The reveal is not a grade — it asks whether any of those acts had an executable market behind them.';
}
