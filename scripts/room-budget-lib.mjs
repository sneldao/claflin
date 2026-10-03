/** Compare like-for-like measured views. Missing measurements never pass. */
export function budgetRegressions(previous, current, tolerance = 0.15) {
  const failures = [];
  for (const view of ['compact', 'room']) {
    const measured = current?.views?.[view];
    if (!measured || !Number.isFinite(measured.firstPaintMs) || measured.firstPaintMs <= 0
      || !Number.isFinite(measured.jsGzipBytes) || measured.jsGzipBytes <= 0
      || !Number.isFinite(measured.fpsMedian) || measured.fpsMedian <= 0
      || !Number.isFinite(measured.frameIntervalP95Ms) || measured.frameIntervalP95Ms <= 0) {
      failures.push(`${view}: measurements are missing`);
      continue;
    }
    const baseline = previous?.views?.[view];
    if (!baseline) continue;
    if (baseline.renderer !== measured.renderer) {
      failures.push(`${view}: renderer changed; record a separate baseline for this hardware`);
      continue;
    }
    for (const field of ['firstPaintMs', 'webglMountMs', 'jsGzipBytes', 'frameIntervalP95Ms']) {
      if (baseline[field] > 0 && measured[field] > baseline[field] * (1 + tolerance)) {
        failures.push(`${view}.${field}: ${measured[field]} exceeds ${baseline[field]} by more than ${tolerance * 100}%`);
      }
    }
    if (baseline.fpsMedian > 0 && measured.fpsMedian < baseline.fpsMedian * (1 - tolerance)) {
      failures.push(`${view}.fpsMedian: ${measured.fpsMedian} is below the baseline ${baseline.fpsMedian}`);
    }
  }
  return failures;
}

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
}
