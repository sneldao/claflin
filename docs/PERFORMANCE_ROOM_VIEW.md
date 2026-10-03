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

## Per-view split

The plan: Compact ships without Three.js at all; Room is the only view that lazy-loads the scene. The split lives in `components/desk/HouseScene.tsx` (already lazy via dynamic import inside `NightDeskScene`).

- **Compact** (`?view=compact` or default for visitors on a low-end profile): no WebGL. Static end-state from the fixture study. Same controller.
- **Room** (`?view=room`): WebGL mounts after the static still paints. Reduced motion keeps the still and skips the WebGL mount.

The viewport gate (mobile < 768px defaults to Compact) is enforced client-side after the user opts in via `?view=room` on a flagged device class. The flag is `GRAPHICS_STORAGE_KEY` (`claflin.graphics.v1`) — visitors can opt in to WebGL on mobile and the system will remember the choice per browser.

## Reduced-motion end-state contract

For every interactive state the WebGL scene expresses, the reduced-motion path must produce a *composed* end-state, not a stripped WebGL canvas. Concretely:

- Hero pinned (scroll progress 0–1) → no pin; native scroll; static composition shown from the top.
- Tape velocity feeds drift → static tape, no skew, no drift.
- Lamp warm/cool → CSS data-attribute for state, no animated glow.
- Filing ceremony (slam → thud → sheen) → immediate end-state with a one-time caption.
- Camera ride on scroll → static; positions in the document order.

The reduced-motion path renders in < 200ms after first paint on a mid-tier Android. The contract is verified in `tests/comprehension.test.ts` (the surface must always carry the labels and roles the user relies on, regardless of motion) and in a manual pass.

## Measuring

`scripts/measure-room-budget.mjs` runs a Playwright build in a headed Chromium and records:

- First paint (static) and WebGL mount timestamps
- fps samples (median, p95) over a 5s scroll-through
- JS payload split: gzipped bundle bytes for `/?view=compact` and `/?view=room`
- The renderer's draw call count, triangle count, and shader cost

The script writes `metrics.json` to `.room-budget/` on the repo root. Numbers are committed on every test run; regressions > 15% from the previous baseline fail the build.

The hardware gate is a real device:

- Cloud desktop (Playwright Chromium) — *required* for every PR.
- One real Android device with Chrome remote debugging — *required* before the World’s Fair submission and before the Stocklana-equivalent release. BrowserStack / Sauce Labs is *not* a substitute; the doc’s position is that the room must be there on a phone, and a phone is a phone.
- One real iOS device with Safari — *required* before the same release.

## What this budget is NOT

- It is not a promise of fps. Devices vary. The numbers are starting points.
- It is not a substitute for the comprehension test (Phase 0.2). A scene that hits its fps budget but loses the user is still a failure.
- It is not a reason to ship an animation that implies data we do not have. The plan’s rule stands: motion that implies a live feed we don’t have is forbidden, even when the budget allows it.