# UX Improvement Plan — Design / UI / Utility / Friendliness

**Source:** Design review rating 7.4/10 (Product 8.0, UI 7.5, UX 7.0, Utility 6.5, Friendliness 7.0).
**Goal:** 8.5/10 — same honest house, understood in 30s, distinct rooms, complete numbers, Room works in hand.
**Constraints:** Paper default; voice never signs; mode said once; no duplicate `title=`; no wallet gate on paper; no framework migration; reduced-motion + forced-colors + aria-live keep passing.

## Progress tracker

- [ ] Phase 0 — Baseline + instrumentation (0.5 wk)
- [x] Phase 1 — Teach faster: comprehension + cognitive load (1.5 wk)
- [ ] Phase 2 — Distinct rooms, not nameplates (1 wk)
- [ ] Phase 3 — Real utility: Hetty gap + live readiness (2 wk)
- [ ] Phase 4 — Mobile-certify Room + performance (1 wk)
- [ ] Phase 5 — Prove friendliness: study + cadence (0.5 wk parallel)

## Phase 0 — Baseline + instrumentation
**Exit gate:** funnel shows instruction to return drop-off per desk before UI changes.

- [x] 0.1 Add funnel events: `example_call_played`, `offering_dossier_opened`, `gap_explainer_opened` (enums only)
- [x] 0.2 Emit from UI: example-call Play, RowDetails expand, gap explainer open
- [x] 0.3 Freeze visual baselines: Playwright chromium + room-budget before
- [x] 0.4 Gates green: typecheck, desk-copy, broker-voice, test, comprehension
- [ ] 0.5 Baseline funnel report --days=7

## Phase 1 — Teach faster (highest EV)
**Exit gate:** example play to first quote +20%; 5-user test names token/rail/record.

- [x] 1A Land + label example call (Foyer Line Phase 3, honest staged label)
- [x] 1B Progressive disclosure foyer (folded book, mandate index, Why this desk?)
- [x] 1C Plain-language + legibility (Grade 8 facts, kicker floor, AI broker disclosure)
- [x] 1D Wire-gap explainer on the live tape (gap disclosure → house paper dialog)

## Phase 2 — Distinct rooms
**Exit gate:** 5-sec screenshot sort 4/4; no new payload.

- [ ] Per-desk room-accent vars via existing data-desk
- [ ] Distinct setTour poses per desk; keep still-to-WebGL swap
- [ ] Reorder hero per desk (Hetty board, Jesse gap, Halley curve)

## Phase 3 — Real utility
**Exit gate:** Hetty gap observed >95%; live devnet demo; paper stays default.

- [ ] 3A Hetty stock reference — kill the dash (Pyth Pro, honest fallback)
- [ ] 3B Live harden (dual-gate, eligibility drawer on live-toggle only, ledger states)

## Phase 4 — Mobile Room
**Exit gate:** JS <350kb gz, first-frame <1.8s throttled, iOS/Android video.

- [ ] lightweight default on coarse/save-data; still CSS first, WebGL after idle
- [ ] Tape rAF pause when hidden; 1 copy on <760px; 40px targets + safe-area
- [ ] Measure: check-room-budget, iPhone 14 + Pixel 7 Room journeys

## Phase 5 — Prove it
**Exit gate:** 4/5 users answer token/rail/money/record + gap.

- [ ] 5-user moderated study; failures to ui-copy.ts copy fixes only
- [ ] Pre-publish Market Letter cadence (weekly until reliable)

## Verification (every PR)
typecheck, check-desk-copy, check-broker-voice, test, playwright chromium, check-room-budget.

## Log
- 2026-10-20: Plan created from 7.4/10 review. Phase 0 started.
- 2026-10-20 (Phase 0 partial): funnel extended to tennie+halley, 3 comprehension events added + emitted, report prints comprehension line, funnel tests 20/20, comprehension 90/90, typecheck + copy gates clean. Existing room-budget metrics (2026-10-05) kept as before-baseline. 0.5 funnel report needs Redis creds.
- 2026-10-20 (Phase 1): wire-gap explainer landed on the live tape — the gap is its own button beside the mark (siblings, never nested), opens a house paper dialog, emits `gap_explainer_opened` once per visit attributed to the mark's desk. 1A example call label/play, 1B rail note + "Why this desk?", 1C legibility floor also in. Gates: typecheck, desk-copy, broker-voice, css-token-scope, comprehension 90/90, full suite 1591/1591. Room budget needs a production build (not run here).
<!-- PART2 -->
