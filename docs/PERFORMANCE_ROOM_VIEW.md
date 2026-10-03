# Room view — motion budget

**Status:** Addendum to [PERFORMANCE.md](PERFORMANCE.md), 2026-10. Establishes the budget for the WebGL scene, the reduced-motion end-state contract, and the per-view JS-payload split.

The plan (Phase 0.4) calls out that the pinned-hero + scroll-driven camera + lenis-snap + tape-velocity feed is doing a lot, and that mobile-verify first, then keep; reduce otherwise. This document turns that into a measurable budget.

## Targets

| Profile | First paint (static) | WebGL mount (where mounted) | Render fps (median) | JS payload (gzipped) |
|---|---|---|---|---|
| Desktop Chrome (high) | < 1.2s | < 2.0s | 60 | < 600KB (Room) / < 200KB (Compact) |
| Mid-tier Android Chrome | < 2.0s | < 3.5s | 30 | < 600KB (Room) / < 200KB (Compact) |
| iPhone SE (low) | < 2.5s | not mounted by default | n/a | < 200KB (Compact only) |

The numbers are starting points, not promises. They get refined against measured baselines.

## Recorded headless baseline (2026-10-03, after the per-view split)

Measured at 23:12 UTC in local production mode, 1280×800 headless Chromium with
the ANGLE/SwiftShader software renderer and stubbed provider reads. Not a
deployment or real-device measurement.

| View | First paint (ms) | WebGL mount (ms) | Median fps | JS payload (gzipped bytes) |
|---|---:|---:|---:|---:|
| Compact | 1,076 | not mounted | 59.88 | 1,324,712 |
| Room | 900 | 1,145 | 30.03 | 1,571,612 |

Compact no longer mounts WebGL or fetches the scene/instrument chunks — the
per-view payload split is established at the structural level. The Compact
payload target (<200KB) is not yet met; the remaining weight is framework and
provider SDK code, not the room scene. Room still exceeds its payload budget
and must still be verified on real Android and iOS hardware before claiming
acceptance. The pre-split baseline (Compact and Room both at 1,573,768 bytes
with Compact mounting WebGL at ~1,301ms) was replaced by this one.

The regression gate tolerance policy: payload bytes gate strictly at 15%
(deterministic build-to-build); paint and WebGL mount allow 3× because
same-build runs on this shared machine measured 948→3,660ms paint; frame
fields gate only when both the baseline and the measured run sampled an
active scene — the scene renders on demand, so an idle run measures nothing
about frame cost.

## Per-view split

Target: Compact ships without Three.js; Room lazy-loads the scene. Measure both
views before claiming that the target is met.

Mechanism, reworked 2026-10-03: the shared scene provider boots still, so a
desk URL in Compact never mounts WebGL through the foyer pass-through, and the
receiver's eager Three.js import is tied to Room (`eager={roomView}`) so
Compact fetches the poster only. Measured: Compact's `webglMountMs` stays unset
and its payload drops by ~249KB gzipped; see the recorded baseline below.

- **Compact** (`?view=compact`): the same controller, with a compact working surface.
- **Room** (`?view=room`): the spatial working surface. Reduced motion retains a still presentation.

View and graphics preferences are separate. `GRAPHICS_STORAGE_KEY`
(`claflin.graphics.v1`) remembers the graphics preference per browser; explicit
Room/Compact choices do not grant a different trading capability.

## Reduced-motion end-state contract

For every interactive state the WebGL scene expresses, the reduced-motion path must produce a *composed* end-state, not a stripped WebGL canvas. Concretely:

- Hero pinned (scroll progress 0–1) → no pin; native scroll; static composition shown from the top.
- Tape velocity feeds drift → static tape, no skew, no drift.
- Lamp warm/cool → CSS data-attribute for state, no animated glow.
- Filing ceremony (slam → thud → sheen) → immediate end-state with a one-time caption.
- Camera ride on scroll → static; positions in the document order.

The reduced-motion target is a complete end-state within 200ms after first paint
on a mid-tier Android. `tests/comprehension.test.ts` checks source contracts for
essential labels and roles; it does not measure this latency or certify the
manual/hardware pass. Those checks remain release work.

## Measuring

After `pnpm exec next build --webpack`, run `node scripts/measure-room-budget.mjs`.
It starts the local production server and measures both views in headless Chromium:

- First paint (static) and WebGL mount timestamps
- fps samples (median, p95) over a 5s scroll-through
- JS payload split: gzipped bundle bytes for `/?view=compact` and `/?view=room`
- Draw calls and triangles per sampled frame, and CPU shader-compilation time (not GPU shader cost)

The script writes `metrics.latest.json` to `.room-budget/` (git-ignored). A successful
run promotes that measurement to `metrics.json`; regressions > 15% from the previous
successful baseline fail without replacing it. Missing Chromium or measurements
fail instead of producing a passing placeholder. `--url=http://127.0.0.1:3000`
uses an already-running local production server. Provider reads are stubbed; this
is a rendering measurement, not provider certification.

The hardware gate is a real device:

- Local/CI desktop (Playwright Chromium) — run the measurement command on the production build. The renderer is recorded per view; a headless baseline is not real-device certification.
- One real Android device with Chrome remote debugging — *required* before the World’s Fair submission and before the Stocklana-equivalent release. BrowserStack / Sauce Labs is *not* a substitute; the doc’s position is that the room must be there on a phone, and a phone is a phone.
- One real iOS device with Safari — *required* before the same release.

## What this budget is NOT

- It is not a promise of fps. Devices vary. The numbers are starting points.
- It is not a substitute for the comprehension test (Phase 0.2). A scene that hits its fps budget but loses the user is still a failure.
- It is not a reason to ship an animation that implies data we do not have. The plan’s rule stands: motion that implies a live feed we don’t have is forbidden, even when the budget allows it.