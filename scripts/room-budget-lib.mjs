/** Compare like-for-like measured views. Missing measurements never pass.
 *  Payload bytes are deterministic build-to-build — a tight gate. Timing and
 *  frame fields under SwiftShader on a shared machine swing more between runs
 *  of the SAME build than a 15% gate allowed (measured 948→3660ms paint), so
 *  they get a noise-aware tolerance; real regressions (400x stalls) still trip
 *  it. The scene renders on demand: frame fields are gated only when BOTH runs
 *  caught an active scene (draws during sampling) — an idle run measures
 *  nothing about frame cost. The real-device gate in
 *  docs/PERFORMANCE_ROOM_VIEW.md is unchanged. */
const TOLERANCE = {
  jsGzipBytes: 0.15,
  firstPaintMs: 2,
  webglMountMs: 2,
  frameIntervalP95Ms: 2,
};
const FPS_FLOOR = 1 / 3;

function sceneActive(view) {
  return Number(view?.drawCallsPerFrame) > 0;
}

export function budgetRegressions(previous, current, tolerance = TOLERANCE) {
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
    /* A view losing its WebGL renderer entirely (payload split landed) is an
       improvement, not new hardware — compare renderers only when both exist. */
    if (baseline.renderer && measured.renderer && baseline.renderer !== measured.renderer) {
      failures.push(`${view}: renderer changed; record a separate baseline for this hardware`);
      continue;
    }
    for (const field of ['firstPaintMs', 'webglMountMs', 'jsGzipBytes']) {
      const allowance = typeof tolerance === 'number' ? tolerance : tolerance[field];
      if (baseline[field] > 0 && measured[field] > baseline[field] * (1 + allowance)) {
        failures.push(`${view}.${field}: ${measured[field]} exceeds ${baseline[field]} by more than ${allowance * 100}%`);
      }
    }
    /* Frame cost only compares when both runs sampled a rendering scene. */
    if (sceneActive(baseline) && sceneActive(measured)) {
      if (measured.frameIntervalP95Ms > baseline.frameIntervalP95Ms * (1 + TOLERANCE.frameIntervalP95Ms)) {
        failures.push(`${view}.frameIntervalP95Ms: ${measured.frameIntervalP95Ms} exceeds ${baseline.frameIntervalP95Ms} by more than ${TOLERANCE.frameIntervalP95Ms * 100}%`);
      }
      if (measured.fpsMedian < baseline.fpsMedian * FPS_FLOOR) {
        failures.push(`${view}.fpsMedian: ${measured.fpsMedian} is below the noise floor of the baseline ${baseline.fpsMedian}`);
      }
    }
  }
  return failures;
}

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
}
