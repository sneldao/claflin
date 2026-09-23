/**
 * The venue-vs-reference gap as signed basis points. '—' when there is no
 * real figure; the slip and the tape share this so they never disagree on
 * formatting.
 */
export function formatBps(raw: string | null, style: 'upper' | 'lower' = 'upper'): string {
  const value = Number(raw);
  if (raw === null || !Number.isFinite(value)) return '—';
  const unit = style === 'lower' ? 'bps' : 'BPS';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} ${unit}`;
}
