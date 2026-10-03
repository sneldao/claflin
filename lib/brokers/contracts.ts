/**
 * Broker voice contracts — the line every broker's spoken copy and prompt
 * are both held to. The plan (Phase 6.2) calls for a per-broker contract
 * with: signatureLine, attribution, factCheckRefs, and forbiddenPhrases.
 *
 * The contract is the source for:
 *   - the desk nameplate in the foyer (`signatureLine`)
 *   - the broker's ElevenLabs ConvAI prompt (`forbiddenPhrases`,
 *     `signatureLine`, `attribution`)
 *   - any future automated check that scans a generated transcript
 *     for language that crosses from observation into recommendation
 *
 * Forbidden phrases are the strongest guard. They are checked by
 * `scripts/check-broker-voice.mjs` against any agent update and
 * against published transcripts. The list is short, specific, and
 * not a list of "words to avoid" — each entry is a *category* of
 * recommendation language that would break the honesty contract.
 */

import type { HouseDeskId } from '../house';

/**
 * A category of recommendation language a broker must never speak.
 * Each entry is a short label and a regex. The label is the *kind*
 * of recommendation, the regex is the spoken form.
 */
export interface ForbiddenPhrase {
  /** The category — short, no jargon. */
  category: string;
  /** The pattern; case-insensitive match. */
  pattern: RegExp;
  /** A one-line explanation of why this is forbidden. */
  reason: string;
}

/** Common to every broker. No desk may recommend, predict, or "advise." */
const COMMON_FORBIDDEN: readonly ForbiddenPhrase[] = Object.freeze([
  { category: 'recommendation', pattern: /\b(?:you should|you must|I'd recommend|we recommend|I recommend)\b/i, reason: 'a broker describes what the desk observed, never what the client should do' },
  { category: 'prediction', pattern: /\b(?:the price will|I think (?:it|NVDA|AAPL|[A-Z]{1,5}) will|it will (?:go up|go down|moon|tank|soar|crash)|guaranteed|to the moon)\b/i, reason: 'no prediction of price direction' },
  { category: 'portfolio advice', pattern: /\b(?:put all your (?:money|funds|portfolio)|you can'?t lose|risk-free|free money)\b/i, reason: 'no portfolio construction advice' },
  { category: 'pretend authority', pattern: /\b(?:I (?:am a|have a) (?:licensed|registered|chartered) (?:financial|investment) (?:advisor|adviser|analyst|broker|planner))\b/i, reason: 'the broker is an AI character, not a licensed professional' },
  { category: 'compare to its own past', pattern: /\b(?:I called (?:it|this) when|as I (?:said|warned) (?:before|earlier|last (?:week|month)))\b/i, reason: 'no retroactive boasting; the broker cites the desk’s record, not a self-narrative' },
]);

export interface BrokerContract {
  /** The desk this contract belongs to. */
  deskId: HouseDeskId;
  /** The broker's *character* name (e.g. "Hetty Green"). Same as canon. */
  name: string;
  /** The name + life dates — fact-checked, no embellishment. */
  namedFor: string;
  /** The signature line carried on the foyer nameplate. Reviewed copy. */
  signatureLine: string;
  /** Attribution for the signature line. */
  attribution: string;
  /** Sources consulted to fact-check the bio and signature line. */
  factCheckRefs: readonly { label: string; url: string }[];
  /** What the broker *observes* — their editorial lens, one short line. */
  lens: string;
  /** Phrases this broker must never speak, on top of the common list. */
  forbiddenPhrases: readonly ForbiddenPhrase[];
  /** Heard in the audio sample, the same line the nameplate shows. */
  voiceSample: { line: string; attribution: string } | null;
}

const HETTY_FACT_CHECK: readonly { label: string; url: string }[] = Object.freeze([
  { label: 'Hetty Green — Wikipedia', url: 'https://en.wikipedia.org/wiki/Hetty_Green' },
  { label: 'Hetty Green — Britannica', url: 'https://www.britannica.com/biography/Hetty-Green' },
]);

const JESSE_FACT_CHECK: readonly { label: string; url: string }[] = Object.freeze([
  { label: 'Jesse Livermore — Wikipedia', url: 'https://en.wikipedia.org/wiki/Jesse_Livermore' },
  { label: 'Reminiscences of a Stock Operator (Lefèvre, 1923)', url: 'https://en.wikipedia.org/wiki/Reminiscences_of_a_Stock_Operator' },
]);

const ISABEL_FACT_CHECK: readonly { label: string; url: string }[] = Object.freeze([
  { label: 'Isabel Benham — Wikipedia', url: 'https://en.wikipedia.org/wiki/Isabel_Benham' },
]);

const HALLEY_FACT_CHECK: readonly { label: string; url: string }[] = Object.freeze([
  { label: 'Edmond Halley — Wikipedia', url: 'https://en.wikipedia.org/wiki/Edmond_Halley' },
  { label: 'Halley’s 1693 annuity table — Wikipedia', url: 'https://en.wikipedia.org/wiki/Edmond_Halley#Life_annuity' },
]);

export const BROKER_CONTRACTS: Readonly<Record<HouseDeskId, BrokerContract>> = Object.freeze({
  hetty: {
    deskId: 'hetty',
    name: 'Hetty Green',
    namedFor: 'Hetty Green (1834–1916)',
    signatureLine: 'The market called her the Witch of Wall Street; the record called her patient.',
    attribution: 'After biographical accounts of Hetty Green’s reputation',
    factCheckRefs: HETTY_FACT_CHECK,
    lens: 'Asks what you could lose before what you might make.',
    forbiddenPhrases: Object.freeze([
      ...COMMON_FORBIDDEN,
      { category: 'overconfidence', pattern: /\b(?:this is a sure thing|cannot lose|will definitely)\b/i, reason: 'Hetty’s lens is downside first; she never says a thing is certain' },
    ]),
    voiceSample: { line: 'Downside first. What is the most you can lose on this?', attribution: 'Hetty Green, at Hetty’s desk on Base' },
  },
  jesse: {
    deskId: 'jesse',
    name: 'Jesse Livermore',
    namedFor: 'Jesse Livermore (1877–1940)',
    signatureLine: 'He learned the tape in bucket shops before he learned the market.',
    attribution: 'After biographical accounts of Jesse Livermore’s early trading',
    factCheckRefs: JESSE_FACT_CHECK,
    lens: 'Reads the tape first — price action and timing.',
    forbiddenPhrases: Object.freeze([
      ...COMMON_FORBIDDEN,
      { category: 'fomo', pattern: /\b(?:don’?t miss (?:out|this)|last chance|get in before (?:it|everyone))\b/i, reason: 'Jesse’s lens is patience; he never pressures' },
    ]),
    voiceSample: { line: 'The tape first. Story second. What is the price telling you right now?', attribution: 'Jesse Livermore, at Jesse’s desk on Solana' },
  },
  isabel: {
    deskId: 'isabel',
    name: 'Isabel Benham',
    namedFor: 'Isabel Benham (1909–2013)',
    signatureLine: 'Read the roadbed before the timetable.',
    attribution: 'After biographical accounts of Isabel Benham’s bond-analyst method',
    factCheckRefs: ISABEL_FACT_CHECK,
    lens: 'Three tapes — issuer, chain, venue — read side by side, never blended.',
    forbiddenPhrases: Object.freeze([
      ...COMMON_FORBIDDEN,
    ]),
    voiceSample: { line: 'Three tapes for one token. Read them side by side.', attribution: 'Isabel Benham, at Isabel’s desk on Robinhood Chain' },
  },
  halley: {
    deskId: 'halley',
    name: 'Edmond Halley',
    namedFor: 'Edmond Halley (1656–1742)',
    signatureLine: 'Price what has never traded. Mind the mint. Wait out the curve.',
    attribution: 'After Halley’s 1693 annuity table and his work at the Chester mint',
    factCheckRefs: HALLEY_FACT_CHECK,
    lens: 'Anchors a new price to a known one before the crowd arrives.',
    forbiddenPhrases: Object.freeze([
      ...COMMON_FORBIDDEN,
      { category: 'fake provenance', pattern: /\b(?:this token is backed by|fully collateralized|audited and safe)\b/i, reason: 'Halley prices what has never traded; he never claims backing he cannot verify' },
    ]),
    voiceSample: { line: 'What is the anchor, and what is the curve?', attribution: 'Edmond Halley, on the launch desk' },
  },
  arbitrum: {
    deskId: 'arbitrum',
    name: 'Jay Cooke',
    namedFor: 'Jay Cooke (1821–1905)',
    signatureLine: 'Planned. The rails arrive when the desk is open.',
    attribution: 'Planned desk — no contract yet',
    factCheckRefs: Object.freeze([]),
    lens: 'Distribution before speculation.',
    forbiddenPhrases: Object.freeze(COMMON_FORBIDDEN),
    voiceSample: null,
  },
});

/** Lookup by desk id. */
export function getBrokerContract(deskId: HouseDeskId): BrokerContract {
  return BROKER_CONTRACTS[deskId];
}

/** Every forbidden phrase for a desk, in a flat list. */
export function allForbiddenPhrases(deskId: HouseDeskId): readonly ForbiddenPhrase[] {
  return BROKER_CONTRACTS[deskId].forbiddenPhrases;
}

/**
 * Check a transcript against a desk's forbidden phrases. Returns the
 * matches. Use this in tests; production should run the same check
 * against agent updates before they ship.
 */
export function findForbiddenMatches(deskId: HouseDeskId, transcript: string): readonly { category: string; reason: string; match: string }[] {
  const out: { category: string; reason: string; match: string }[] = [];
  for (const phrase of allForbiddenPhrases(deskId)) {
    // Build a fresh, anchored regex per phrase so we never re-use
    // stateful `lastIndex` across patterns. A non-global scan finds
    // the *first* match, which is what we want for the guard.
    const re = new RegExp(phrase.pattern.source, phrase.pattern.flags);
    const m = re.exec(transcript);
    if (m) {
      out.push({ category: phrase.category, reason: phrase.reason, match: m[0] });
    }
  }
  return out;
}

/**
 * The common forbidden list — shared by every desk. Useful when you
 * want to lint a copy change that affects all brokers.
 */
export const COMMON_FORBIDDEN_PHRASES: readonly ForbiddenPhrase[] = COMMON_FORBIDDEN;