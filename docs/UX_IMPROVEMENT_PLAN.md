# UX Improvement Plan — Design / UI / Utility / Friendliness

**Source:** Design review rating 7.4/10 (Product 8.0, UI 7.5, UX 7.0, Utility 6.5, Friendliness 7.0).
**Goal:** 8.5/10 — same honest house, understood in 30s, distinct rooms, complete numbers, Room works in hand.
**Constraints:** Paper default; voice never signs; mode said once; no duplicate `title=`; no wallet gate on paper; no framework migration; reduced-motion + forced-colors + aria-live keep passing.

## Progress tracker

- [ ] Phase 0 — Baseline + instrumentation (0.5 wk) — **0.5 run 2026-10-21; baseline is one visit, not yet a baseline**
- [x] Phase 1 — Teach faster: comprehension + cognitive load (1.5 wk) — code shipped; exit gate not yet measurable (see below)
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
- [x] 0.5 Baseline funnel report --days=7 — run 2026-10-21; see docs/FUNNEL_METRICS.md "Baseline". One visit in 90 days, so the +20% comparison still has no "before".

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
- 2026-10-21 (Phase 0.5): funnel baseline run for the first time. The whole 90-day retention window holds one visit (2026-10-03, jesse via link) — the 7-day window is empty. Instrumentation verified working, not broken: the funnel client ships in the deployed `app/page` chunk and a probe batch wrote and was cleaned from `funnel:counts`. Baseline written to docs/FUNNEL_METRICS.md as a floor of one. The +20% gate therefore still has no "before" and needs a week of traffic, not more credentials.
- 2026-10-21 (build fix): the Phase 1 gap explainer's bare `[data-gap-trigger]` selectors were impure CSS Modules and failed `next build`, breaking the Build, Docker and Browser acceptance CI jobs on main. Scoped to `.wireGap`. The test suite could not catch it — purity is a build-time rule. Production build now compiles; `check:room-budget` ran against it and passed on the second run (first run tripped the documented SwiftShader timing noise, 948ms vs 272ms baseline).
- 2026-10-21 (pre-existing e2e failure, confirmed): Browser acceptance still fails on `e2e/halley-layout.spec.ts` — "live path: review hands off to the wallet, note under the button" cannot find the "Continue to wallet review" link. Reproduced on `c5183aa`, the commit before Phase 1, so it is **not** caused by the gap explainer or the CSS fix. The 1440px width test also times out on a loaded runner but passes locally. Halley owns this; it is not a Phase 1–4 item.
- 2026-10-21 (halley-layout e2e fixed): the spec had been red since it landed (9ee089b) — two independent causes, both in the spec, not the desk. (1) Starvation: the spec never pinned graphics, so CI's software rasteriser ran the full WebGL room and starved Playwright's actionability checks — every timeout was a visible element whose `boundingBox`/click never went stable (1440px test; the filed test's `summary` click). It now does what `journey.spec` does — `reducedMotion: 'reduce'` — plus a stored `mode:'room'` preference so the Room layout under test is kept (reduced motion would otherwise prefer Compact). (2) Live path: CI never enables live, so "Continue to wallet review" could never exist; the status route is now stubbed per test (`{enabled:true}` for the live-path test — the only authority for the client, per the route's contract; `{enabled:false}` elsewhere). All 4 tests pass locally against the production build in ~20s.

## Phase 1 — what shipped, and what is still open

Phase 1's *code* is done. Its *exit gate* is not yet measurable, and the two
reasons are both Phase 0/Phase 5 work, not Phase 1 work:

- **"Example play → first quote +20%"** needs a before/after funnel
  comparison. Item 0.5 has now run (2026-10-21) and the baseline is
  written down in docs/FUNNEL_METRICS.md — but it is **one visit in the
  whole 90-day retention window**, so it is a floor, not a "before" you
  can measure +20% against. The comparison becomes drawable only once
  the house has a week of real traffic. Until then +20% can be neither
  claimed nor denied.
- **"5-user test names token/rail/record"** is the Phase 5 study. The
  instrumentation it depends on is in place (`example_call_played`,
  `offering_dossier_opened`, `gap_explainer_opened` are all emitted and
  reported); the study itself has not been run.

So the honest reading: Phase 1 built the teaching, and it built the
measurement that will later prove the teaching. Neither the +20% nor the
comprehension result exists yet. Do not report Phase 1 as *proven* until
0.5 has a baseline to compare against.

### Why the gap explainer is a Phase 1 item, not a Phase 3 one

A gap reading ("+93.3 bps vs stock") with no explanation is the single
most misreadable thing on the page. A visitor who does not already know
what a gap is reads it as a signal to act — which is exactly the
behaviour the house forbids everywhere else. Teaching it costs one
dialog, so it belongs in "teach faster" rather than in "real utility".

The trigger is a **sibling** of the mark's button, never a child. A
second control nested inside the mark's button is invalid HTML, and the
mark's `aria-label` would swallow the gap's own label — a screen-reader
visitor would never hear what the gap means. The explainer names what the
gap is *and what it is not*: not an estimate to trade on, not a
prediction, not a signal to act.

## Next phases — sequence and what unblocks each

| Phase | Scope | Blocked on | Gate |
|---|---|---|---|
| **0.5** | Baseline funnel report `--days=7` | Done 2026-10-21 — but the baseline is one visit; re-run after a week of traffic | Baseline written down before any Phase 2 change |
| **2** | Distinct rooms: per-desk accent vars, per-desk tour poses, per-desk hero order | Nothing — can start now | 5-second screenshot sort, 4/4 rooms distinct, no new payload |
| **3** | Real utility: 3A Hetty stock reference (Pyth Pro, honest fallback), 3B live hardening | 3A needs a stock-reference source decision (FOYER_LINE §9 open decision) | Hetty gap observed >95%, live devnet demo, paper stays default |
| **4** | Mobile-certify Room: lightweight default on coarse/save-data, tape rAF pause, 40px targets + safe-area | Nothing (a production build now compiles, and `check:room-budget` runs against it) | JS <350kb gz, first frame <1.8s throttled, iOS/Android video |
| **5** | 5-user moderated study, weekly Market Letter cadence | Phase 1's teaching must exist first (it does); study recruiting | 4/5 users answer token/rail/money/record + gap |

**Recommended order:** 2 → 5 → 3 → 4, with 0.5 re-run before 3 and 4.

- **0.5 is done, and it changed the plan.** It ran on 2026-10-21 and
  found one visit in the entire retention window, so the +20% gate still
  has no "before". The report needs no further unblocking — only
  traffic. Re-run it after a week of real visitors and replace the
  baseline section before Phase 3 and Phase 4 land, since both change
  what the funnel sees.
- **Phase 2 first.** It is self-contained, needs no external dependency,
  and carries no new payload — the cheapest real improvement in the plan.
- **Phase 5 (the study) third, not last.** It is listed last in the plan
  but it is the only phase that *proves* Phase 1, and it has the longest
  lead time. The failures it surfaces must land as `ui-copy.ts` copy
  fixes, which is why it wants the teaching in place (it is) and why it
  wants to run before Phase 3 adds new surface to critique.
- **Phase 3 third-to-last.** It is the largest and the most honest-risk
  item: 3A changes what a number *is* (a real stock reference rather
  than a dash), so it deserves a stable measurement base and a settled
  product, not a moving target.
- **Phase 4 last.** It is performance and certification work — mechanical
  once the feature set stops changing, and cheapest to do against a
  final payload. Doing it before Phase 3 means measuring a payload that
  is about to grow.
