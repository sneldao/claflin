import { HOUSE_DESKS, type HouseDeskId } from './house';

/**
 * Quiet desk notes — one-line indications from the era the house is drawn
 * from: how its financiers worked, and principles that have held. These are
 * atmosphere with substance, not advice. Rules they must obey:
 * - never a recommendation to trade, never tied to a current price;
 * - no fabricated quotes — attributed aphorisms are historically common;
 * - generic notes are clearly not attributed to a person;
 * - the selection is stable for the day (no scroll-of-the-minute churn).
 *
 * Every third day the desk teaches instead of muses: a word of the trade
 * (tape, fill, pit, corner — the vocabulary the desk itself speaks). Word
 * entries define the term descriptively, never prescriptively — what a fill
 * is, never what a good fill is. They carry a `term` label, no attribution,
 * and obey the same rules above.
 */

export type DeskNote = {
  text: string;
  /** Set only when the line carries a historical speaker's words. */
  attribution: string | null;
  /** Set when the note teaches a term of the trade instead of offering an observation. */
  term?: string;
};

const GENERAL_NOTES: readonly string[] = [
  'A clear instruction on paper has settled more arguments than a good memory.',
  'The tape records opinion. The ledger records what actually happened.',
  'A quotation is a question asked of the market — not its answer.',
  'Patience was counted an edge before it was written anywhere.',
  'Every panic in the record was obvious afterward. The desk exists for before.',
  'The house keeps the record so the client can keep the judgment.',
];

const DESK_NOTES: Readonly<Record<HouseDeskId, readonly (DeskNote | string)[]>> = {
  hetty: [
    ...GENERAL_NOTES,
    { text: '“I buy when things are low and no one wants them.”', attribution: 'Hetty Green' },
    'Hetty Green bought in panics and sold in booms, and kept her cash where she could reach it.',
    'Buy so that being early cannot ruin you. Time has compensated the patient more often than the quick.',
    'Count the cost of being wrong before counting the profit of being right.',
  ],
  jesse: [
    ...GENERAL_NOTES,
    { text: '“There is only one side to the stock market; …not the bull side or the bear side, but the right side.”', attribution: 'Jesse Livermore' },
    { text: '“The market is never wrong; opinions often are.”', attribution: 'attributed to Jesse Livermore' },
    'Livermore kept notebooks of his own trades before trusting his opinions about anyone else’s.',
    'The man who is out of the market sees it most clearly. Decide where you will re-enter before you leave.',
  ],
  isabel: [
    ...GENERAL_NOTES,
    'Benham read the roadbed before the timetable: infrastructure first, schedules second.',
    'What a company owns outright survives a bad quarter better than what it merely promises.',
    'A careful reader of annual letters was once considered a dangerous competitor.',
  ],
  arbitrum: [
    ...GENERAL_NOTES,
    'Cooke sold the rails before he sold the ride — distribution first, then the crowd.',
    'During the Civil War, Cooke made a market in national bonds from a single office. The network was the product.',
    'New rails earn trust one settled transaction at a time.',
  ],
};

const GENERAL_WORDS: readonly DeskNote[] = [
  { text: 'The tape: the running print of prices as they happen. To read the tape is to watch what is done, not what is said.', attribution: null, term: 'tape' },
  { text: 'A fill: an order actually executed. Until it fills, an order is only an intention.', attribution: null, term: 'fill' },
  { text: 'The pit: the floor where orders once met by open outcry. The desk sat upstairs; the pit was downstairs.', attribution: null, term: 'pit' },
  { text: 'A quotation: the price a market names in answer to a question. It is an answer, not a promise.', attribution: null, term: 'quotation' },
  { text: 'The blotter: the day’s raw record of every order written, before the ledger makes it official.', attribution: null, term: 'blotter' },
  { text: 'Margin: borrowed money behind an instruction. It enlarges every outcome, including the one not planned for.', attribution: null, term: 'margin' },
];

const DESK_WORDS: Readonly<Record<HouseDeskId, readonly DeskNote[]>> = {
  hetty: [
    ...GENERAL_WORDS,
    { text: 'To corner a market: to hold enough of a thing that everyone who needs it must come to you. Hetty Green cornered the shorts more than once.', attribution: null, term: 'corner' },
    { text: 'Cash: the position that needs no one else’s permission. Hetty Green kept hers where she could reach it.', attribution: null, term: 'cash' },
  ],
  jesse: [
    ...GENERAL_WORDS,
    { text: 'A bucket shop: a parlor that took your wager on prices without ever buying the stock. Livermore learned the tape there before he learned the market.', attribution: null, term: 'bucket shop' },
    { text: 'A line: the list of what you hold at any moment. Livermore kept his in a pocket notebook before he trusted it to memory.', attribution: null, term: 'line' },
  ],
  isabel: [
    ...GENERAL_WORDS,
    { text: 'A seat: membership on an exchange — the right to trade on its floor. Isabel Benham was the first woman to hold one on the New York Stock Exchange.', attribution: null, term: 'seat' },
    { text: 'The annual letter: a company’s own account of itself, once a year. Benham read them more closely than most competitors read anything.', attribution: null, term: 'annual letter' },
  ],
  arbitrum: [
    ...GENERAL_WORDS,
    { text: 'Clearing: the settling of promises between houses after the trading is done. Trust in the rails is built there first.', attribution: null, term: 'clearing' },
    { text: 'A bond drive: selling a nation’s debt one small buyer at a time. Cooke built the network before the market.', attribution: null, term: 'bond drive' },
  ],
};

/** Every third day the desk teaches a word instead of offering a note. */
const WORD_DAY = 2;

/** Stable within a local day and per desk, varied across days and between desks. */
export function deskNoteOfTheDay(deskId: HouseDeskId, date = new Date()): DeskNote {
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  const deskIndex = Math.max(0, HOUSE_DESKS.findIndex(desk => desk.id === deskId));
  // Mixed so the general pool does not repeat verbatim across desks on one day.
  const index = (dayIndex * 31 + deskIndex * 17);
  if (dayIndex % 3 === WORD_DAY) {
    const words = DESK_WORDS[deskId] ?? DESK_WORDS.hetty;
    return words[index % words.length];
  }
  const pool = DESK_NOTES[deskId] ?? DESK_NOTES.hetty;
  const note = pool[index % pool.length] as DeskNote | string;
  return typeof note === 'string' ? { text: note, attribution: null } : note;
}
