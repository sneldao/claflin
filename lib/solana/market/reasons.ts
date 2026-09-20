/**
 * Plain-English reason sentences for MarketComparison reason codes.
 * Reviewed copy — never invent a number when evidence is unavailable.
 */
import type { ComparisonReasonCode } from './compare';

const SENTENCES: Record<ComparisonReasonCode, string> = {
  'unverified-unit-basis':
    'The xStock unit basis is not yet verified, so Jesse will not show a numerical comparison.',
  'feed-mismatch':
    'The token and equity feeds could not be aligned for this instrument.',
  'token-unavailable':
    'The xStock price feed is unavailable right now.',
  'equity-unavailable':
    'The underlying equity feed is unavailable right now.',
  'token-stale':
    'The xStock observation is too stale for a live comparison.',
  'equity-stale':
    'The equity observation is too stale for a live comparison.',
  'future-timestamp-invalid':
    'A feed timestamp was in the future and could not be trusted.',
  'future-skew-uncertain':
    'Feed timing was too skewed to compare the two observations.',
  'generation-gap-exceeded':
    'The token and equity prices were generated too far apart to compare.',
  'session-not-regular':
    'The equity market is not in regular session.',
  'confidence-excessive':
    'Feed confidence was too wide for a comparable reading.',
  'confidence-unknown':
    'Feed confidence was missing, so the comparison stayed unavailable.',
  'nonpositive-price':
    'A non-positive price arrived from a feed and was refused.',
  'multiplier-unavailable':
    'The scaled-unit multiplier could not be read for this comparison.',
  'equity-older-than-7-days':
    'The last equity observation is older than seven days.',
};

export function reasonCodeSentence(code: string): string {
  return SENTENCES[code as ComparisonReasonCode]
    ?? 'Market evidence for this instrument is unavailable right now.';
}
