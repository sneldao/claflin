/**
 * One way to move inside a desk: scroll a target into view, honoring
 * prefers-reduced-motion, then optionally hand focus to a field without
 * scrolling again. Every desk surface, the working tray and the footer CTA
 * go through here so the behavior cannot drift between desks.
 */
export function scrollToDeskTarget(id: string, opts?: { focusId?: string }): void {
  if (typeof window === 'undefined') return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (opts?.focusId) document.getElementById(opts.focusId)?.focus({ preventScroll: true });
}
