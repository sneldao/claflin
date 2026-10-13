/**
 * What a caption shows of a spoken turn. Voice agents emit delivery cues —
 * `[slow]`, `[sad]`, `[warmly]` — that steer the voice and were never meant
 * to be read. Strip them wherever a turn is stored or shown.
 */
const DELIVERY_CUE = /\[(?:[a-z][a-z' -]{0,30})\]\s*/gi;

export function spokenText(text: string): string {
  return text.replace(DELIVERY_CUE, '').replace(/\s{2,}/g, ' ').trim();
}

/** A turn that carries words, not a pause ("...") or a stray cue. */
export function isSpokenTurn(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(spokenText(text));
}
