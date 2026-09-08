/**
 * Shareable paper-trade links. The record itself is local, but the intent
 * is shareable: ?intent=<alias>&side=<buy|sell>&amount=<n> prefills the
 * recipient's ticket — the viral loop is "try this trade yourself".
 */

export function shareUrl(intent: { instrumentId: string; side: 'buy' | 'sell'; amount: string }, symbol: string): string {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('intent', symbol.toLowerCase());
  url.searchParams.set('side', intent.side);
  if (intent.amount) url.searchParams.set('amount', intent.amount);
  return url.toString();
}

export function shareText(intent: { side: 'buy' | 'sell'; amount: string }, quote: { inputAmount: string; inputSymbol: string; outputAmount: string; outputSymbol: string }): string {
  const verb = intent.side === 'buy' ? 'bought' : 'sold';
  return `I paper-${verb} ${quote.outputAmount} ${quote.outputSymbol} for ${quote.inputAmount} ${quote.inputSymbol} on Hetty's desk — live onchain quotes, nothing at risk. Try the same trade:`;
}

/** Shares via the native sheet where available, else copies to clipboard. Returns how it was delivered. */
export async function shareRecord(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return 'copied';
    } catch { return 'failed'; }
  }
}
