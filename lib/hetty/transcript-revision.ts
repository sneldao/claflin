/** Prefer an existing transcript revision when it is strictly newer than the
 *  incoming checkpoint. Returns the prior revision to keep, or null to write. */
export function keptTranscriptRevision(prior: unknown, incoming: number): number | null {
  const n = Number(prior);
  if (Number.isFinite(n) && n > incoming) return n;
  return null;
}
