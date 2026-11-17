# UX

**Merged 2026-11-17** from UX_IMPROVEMENT_PLAN, FOYER_LINE and FUNNEL_METRICS (single-source consolidation; full prior text in git history).

One subject in three parts: what the house should feel like, what the foyer is, and how we know either is true.

- [UX improvement plan](#ux-improvement-plan) — the 7.4 → 8.5 review goal, the phases, what landed and what is owed.
- [The foyer is the line](#foyer-line) — foyer anatomy and its build sequence. Its **§ numbers are unchanged** from the former FOYER_LINE.md: code comments and tests citing `docs/FOYER_LINE.md §4.1`, `§4.5`, `§4.7` or `§8` resolve to the same numbered section below.
- [Funnel metrics](#funnel-metrics) — the event source, retention, and the foyer's §8 measures.

Principles and information hierarchy live in [docs/PRODUCT.md](PRODUCT.md) and win any conflict. Architecture: [docs/ARCHITECTURE.md](ARCHITECTURE.md). Desk rosters: [docs/DESKS.md](DESKS.md). Voice path: [docs/VOICE.md](VOICE.md). Running the gates: [docs/OPERATIONS.md](OPERATIONS.md) and [docs/RELEASE_VALIDATION.md](RELEASE_VALIDATION.md). Index: [docs/README.md](README.md).

---

## UX improvement plan {#ux-improvement-plan}

**Source:** design review rating 7.4/10 (Product 8.0, UI 7.5, UX 7.0, Utility 6.5, Friendliness 7.0).
**Goal:** 8.5/10 — same honest house, understood in 30s, distinct rooms, complete numbers, Room works in hand.
**Constraints:** paper default; voice never signs; mode said once; no duplicate `title=`; no wallet gate on paper; no framework migration; reduced-motion + forced-colors + aria-live keep passing.

Status: Phase 0 ran (baseline is one visit, not yet a baseline); Phase 1's code shipped (exit gate not yet measurable); Phases 2–5 not started.

### Phase 0 — Baseline + instrumentation
**Exit gate:** funnel shows instruction to return drop-off per desk before UI changes.

- [x] 0.1 Funnel events: `example_call_played`, `offering_dossier_opened`, `gap_explainer_opened` (enums only); 0.2 emitted from UI (example-call Play, RowDetails expand, gap explainer open)
- [x] 0.3 Visual baselines frozen (Playwright chromium + room-budget before); 0.4 gates green (typecheck, desk-copy, broker-voice, test, comprehension)
- [x] 0.5 Baseline funnel report `--days=7` — run 2026-10-21; see [Funnel metrics](#funnel-metrics) "Baseline". One visit in 90 days, so the +20% comparison still has no "before".

### Phase 1 — Teach faster (highest EV)
**Exit gate:** example play to first quote +20%; 5-user test names token/rail/record.

- [x] 1A Land + label example call (Foyer Line Phase 3, honest staged label)
- [x] 1B Progressive disclosure foyer (folded book, mandate index, Why this desk?)
- [x] 1C Plain-language + legibility (Grade 8 facts, kicker floor, AI broker disclosure)
- [x] 1D Wire-gap explainer on the live tape (gap disclosure → house paper dialog)

**What shipped, and what is still open.** Phase 1's *code* is done; its *exit gate* is not yet measurable, and both reasons are Phase 0/Phase 5 work, not Phase 1 work:

- **"Example play → first quote +20%"** needs a before/after funnel comparison. The baseline ran (2026-10-21) and is written down below — but it is **one visit in the whole 90-day retention window**, a floor, not a "before". The comparison becomes drawable only once the house has a week of real traffic. Until then +20% can be neither claimed nor denied.
- **"5-user test names token/rail/record"** is the Phase 5 study. The instrumentation is in place (all three comprehension events are emitted and reported); the study itself has not been run.

The honest reading: Phase 1 built the teaching, and built the measurement that will later prove the teaching. Do not report Phase 1 as *proven* until both exist.

**Why the gap explainer is a Phase 1 item, not a Phase 3 one.** A gap reading ("+93.3 bps vs stock") with no explanation is the single most misreadable thing on the page. A visitor who does not already know what a gap is reads it as a signal to act — exactly the behaviour the house forbids everywhere else. Teaching it costs one dialog, so it belongs in "teach faster". The trigger is a **sibling** of the mark's button, never a child: a second control nested inside the mark's button is invalid HTML, and the mark's `aria-label` would swallow the gap's own label. The explainer names what the gap is *and what it is not* (see §4.5 below).

### Phase 2 — Distinct rooms
**Exit gate:** 5-sec screenshot sort 4/4; no new payload.

- [ ] Per-desk room-accent vars via existing data-desk
- [ ] Distinct setTour poses per desk; keep still-to-WebGL swap
- [ ] Reorder hero per desk (Hetty board, Jesse gap, Halley curve)

### Phase 3 — Real utility
**Exit gate:** Hetty gap observed >95%; live devnet demo; paper stays default.

- [ ] 3A Hetty stock reference — kill the dash (Pyth Pro, honest fallback)
- [ ] 3B Live harden (dual-gate, eligibility drawer on live-toggle only, ledger states)

### Phase 4 — Mobile Room
**Exit gate:** JS <350kb gz, first-frame <1.8s throttled, iOS/Android video.

- [ ] Lightweight default on coarse/save-data; still CSS first, WebGL after idle
- [ ] Tape rAF pause when hidden; 1 copy on <760px; 40px targets + safe-area; measured via check-room-budget and iPhone 14 + Pixel 7 Room journeys

### Phase 5 — Prove it
**Exit gate:** 4/5 users answer token/rail/money/record + gap.

- [ ] 5-user moderated study; failures to ui-copy.ts copy fixes only
- [ ] Pre-publish Market Letter cadence (weekly until reliable)

### Sequence and what unblocks each

| Phase | Scope | Blocked on | Gate |
|---|---|---|---|
| **0.5** | Baseline funnel report `--days=7` | Done 2026-10-21 — but the baseline is one visit; re-run after a week of traffic | Baseline written down before any Phase 2 change |
| **2** | Distinct rooms: accent vars, tour poses, hero order | Nothing — can start now | 5-second screenshot sort, 4/4 rooms distinct, no new payload |
| **3** | Real utility: 3A stock reference (Pyth Pro, honest fallback), 3B live hardening | 3A needs a stock-reference source decision (§9 open decision below) | Hetty gap observed >95%, live devnet demo, paper stays default |
| **4** | Mobile-certify Room | Nothing (a production build compiles; `check:room-budget` runs against it) | JS <350kb gz, first frame <1.8s throttled, iOS/Android video |
| **5** | 5-user moderated study, weekly Market Letter cadence | Phase 1's teaching must exist first (it does); study recruiting | 4/5 users answer token/rail/money/record + gap |

**Recommended order:** 2 → 5 → 3 → 4, with 0.5 re-run before 3 and 4. Verification on every PR: typecheck, check-desk-copy, check-broker-voice, test, playwright chromium, check-room-budget — what each gate does: [docs/RELEASE_VALIDATION.md](RELEASE_VALIDATION.md).

- **0.5 is done, and it changed the plan.** One visit in the entire retention window, so the +20% gate has no "before". Only traffic unblocks it now. Re-run after a week of real visitors and replace the baseline section before Phases 3 and 4 land, since both change what the funnel sees.
- **Phase 2 first.** Self-contained, no external dependency, no new payload — the cheapest real improvement in the plan.
- **Phase 5 third, not last.** It is the only phase that *proves* Phase 1 and has the longest lead time. Its failures must land as `ui-copy.ts` copy fixes, so it wants the teaching in place (it is) and to run before Phase 3 adds new surface to critique.
- **Phases 3 and 4 last.** 3A changes what a number *is* (a real stock reference rather than a dash), so it deserves a stable measurement base and a settled product; Phase 4 is mechanical once the feature set stops changing, and cheapest against a final payload.

### Log (abridged)

- **2026-10-20:** plan created from the 7.4/10 review; Phase 0 partial — funnel extended to tennie+halley, 3 comprehension events added + emitted, report prints the comprehension line, funnel tests 20/20, comprehension 90/90. Phase 1 the same day: wire-gap explainer on the live tape (sibling button beside the mark, house paper dialog, `gap_explainer_opened` once per visit per desk), plus 1A/1B/1C. Full suite 1591/1591.
- **2026-10-21:** first funnel baseline — one visit (2026-10-03, jesse via link) in the whole 90-day window; instrumentation verified working, needs traffic not credentials. The gap explainer's bare `[data-gap-trigger]` selectors were impure CSS Modules and failed `next build`; scoped to `.wireGap` — purity is a build-time rule the test suite cannot catch. `halley-layout.spec.ts` was red since it landed; fixed in the spec, not the desk (pinned `reducedMotion: 'reduce'` + stored `mode:'room'`; the live-path test stubs the status route, `{enabled:true}`, the only authority for the client).

---

## The foyer is the line {#foyer-line}

**Date:** 2026-09-24 · **Status:** Phases 0–2 and 4 shipped on `main` for the Stocklana submission (copy truth, turret, board, desks/answers/footer/handset). Phase 3 waits on an accepted real recording; Phase 5 funnel source is in ([Funnel metrics](#funnel-metrics)); the pulse still waits on real counters. **Owner:** product lead.

**Decided 2026-09-24:** Space is the house line in the foyer; `H` stays the desk line inside a room. There is no house-level voice agent; dictation plus lamps routes. The example call waits for an accepted real recording (Phase 3).

**Amendments (oldest first):**

- **2026-09-28** — Space opens the line only when held past 250 ms while the talk bar is on screen; a tap still scrolls the page, and once the bar has scrolled away Space is the browser's again.
- **2026-10-02** — Tennie is seated: LINE 3 is a live lamp that lights on her coverage (Robinhood Stock Tokens), with "Talk with Tennie" opening her own ConvAI session. Jay alone remains "coming soon".
- **2026-10-03** — Halley is seated: LINE 4 is the Meteora launch desk on Solana (paper-only: estimates and filed launch records, no live launch path) with his own ConvAI session. Jay is LINE 5, still coming soon.
- **2026-10-03 (b)** — desk `kind` distinguishes rooms: Halley renders as the launch-desk plate below the brokers grid, launch verbs light his lamp by name in the turret, and the directory calls him "Launch desk".
- **2026-10-20** — the live tape's gap explains itself: a sibling button beside the mark, a house paper panel, `gap_explainer_opened` once per visit per desk (UX plan Phase 1).

**TL;DR:** `/` stops being a page *about* voice trading. It becomes a working **dealer turret**: one push-to-talk line into the house, the verified offerings that match what you said light up, the desk writes a slip, and nothing moves until you sign. Everything else on the page (the board, an example call, the slip anatomy, the desks, straight answers) explains that one action. The page is strongest when NYSE is closed, which is most hours of the week.

This section owns **foyer anatomy and its build sequence**. [docs/PRODUCT.md](PRODUCT.md) owns principles and the information hierarchy and wins any conflict.

### §1. The one sentence

> **Pick up the line, say what you want, and the desk writes it up onchain. Nothing moves until you sign.**

Every section below must make that sentence more true or easier to believe. If a section does neither, cut it.

### §2. Why a turret

A trading-floor **dealer turret** is a console of lit direct lines. You press a line to talk, the broker reads the order back, and the order is written on a ticket. It is the original voice-first trading interface, and it matches the house's existing grammar (line, slip, stamp, ledger). It is also a working control, not a mascot, which keeps it within Product Direction's exclusions ("not a spectacular phone as the product").

### §3. Differentiation, stated honestly

| Everyone else | Claflin |
|---|---|
| Hero art, feature cards, "Launch app" | The first screen is the working line |
| Voice as a feature bullet | Voice is the primary gesture; typing is always one key away |
| A static page | The page follows the NYSE session: headline and floor state change at the bell |
| Tokenized-stock price only | Token price **next to** its stock reference, with the gap shown, where the desk observes one |
| "Trade responsibly" small print | Safety as ritual: read-back, expiring quote, your signature, the stamp |

### §4. Anatomy (top to bottom)

Ordered by attention layer. The work comes first; myth comes last.

#### §4.1 The turret (the work; first viewport)

```
CLAFLIN                                     NYSE ● CLOSED · opens in 9h 12m
The floor is dark.
The line is open.
Trade tokenized US stocks by voice, onchain, any hour.        ← plain subhead (FOYER_LEDE)

┌──────────────────────────────────────────────────────────┐
│ ▁▂▃▅▂▁▃▆▃▂   [ HOLD SPACE TO TALK ]      or type ↵        │
│ "Buy Apple for a hundred dollars."                         │
└──────────────────────────────────────────────────────────┘
Paper by default · Only you can sign                          ← FOYER_BOUNDARY, once

◉ LINE 1  HETTY · Base · AI broker      ◉ LINE 2  JESSE · Solana · AI broker
◉ LINE 3  TENNIE · RH Chain · AI broker ◉ LINE 4  HALLEY · Solana · AI broker
○ LINE 5  JAY · not yet seated
```

- **One primary action: the house line.** Hold Space (desktop, when focus is not in a field or button) or press and hold (touch). Release to send. This uses the existing dictation path (`/api/dictation` → `dictation-parser`; see [docs/VOICE.md](VOICE.md)). The words fill the same foyer instruction the input already drives; there is no second parser.
- **Type is the equal fallback.** The instruction input stays; ↵ submits. The whole journey works without a microphone.
- **The mic is used only on the gesture.** No permission prompt on load; the first hold explains the prompt in one line; a denied permission falls back to typing, with an honest note.
- **Lines are lamps, not a chain picker.** Before any instruction, open lines glow evenly. After an instruction, `offeringGroupsForInstruction` decides which lines light:
  - one matching offering → that line lights, and "Talk with {broker}" appears on it;
  - several (AAPLc on Base, AAPLx on Solana, AAPL on Robinhood Chain) → all matching lines light and the house **names each offering**. The caller picks. The house never picks a rail silently;
  - explicit launch verbs (`launch`, `mint`, `issue`, "new token", "tracker token", "bonding curve") → the launch desk's line lights and the reply names the split — a launch is not a tape ask. Checked before the offering book so "launch an NVDA tracker" does not light Jesse's NVDA line. Vaguer wording fails quiet to the book;
  - none → no line lights, and the house says so plainly with the supported names.
- **A resolved tape ask folds the launch slip.** When the book matches, trade intent is declared and origination leaves the room — Halley's slip hides until the line returns home. The clear key (× in the field, or Escape) always restores: lamps idle, the book shut, the slip back.
- **Ringing** hands off to the desk's own ConvAI session via `requestRingOnArrival`. A single house-level voice agent is **out of scope** until per-desk calls are accepted — no third agent with its own honesty surface.
- **Planned desks** stay unlit lamps with "not yet seated" — a directory detail, not a grid, not a clickable room. **"AI broker"** appears on every lit line; human names plus "Ring" must never read as a human on the phone.

#### §4.2 The market-aware headline (weather that carries the argument)

`lib/market-clock.ts` already knows open/closed. It carries **time to next open / close** and state-specific copy:

| Exchange | Kicker | Headline |
|---|---|---|
| Closed (overnight, weekend, holiday) | `NYSE ● CLOSED · opens in 9h 12m` | The floor is dark. / The line is open. |
| Open | `NYSE ● OPEN · closes in 2h 39m` | The floor's loud. / We're still here at 4:01. |
| Unknown calendar year | weekday/hours rule, no countdown | the closed or open copy, without a countdown |

SSR paints a neutral fallback; the client swaps after hydration. At the close the floor behind the office dims — driven by the clock, never by an animation loop, honoured by reduced motion.

#### §4.3 An example call (proof before the ask)

A short call plays **muted with captions** beside the slip it writes. One tap to hear.

- **Labelled as an example**: `EXAMPLE CALL · recorded <date> · prices on the slip are from that call`. Never presented as live; its prices are never styled like tape marks.
- **Source:** a real recorded paper session from Hetty or Jesse, with transcript and the slip it produced — not a marketing script. If no accepted recording exists, ship transcript and slip as static text with the same label, or omit the section.
- **What it must show:** the caller speaks naturally; the broker names **both** offerings when two exist and the caller picks; the broker **reads back** the order; the quote has a visible expiry; the caller says "paper it"; the stamp lands. It ends with the turret pulsing once: "Your line. Hold Space."

#### §4.4 The slip, annotated

One oversized slip. Each field has a plain-English note (tap or hover, always available to assistive technology):

| Field | Note |
|---|---|
| `via NVDAc · Base` | A Coinbase-issued token that tracks NVDA. It is not the share itself. → rights and restrictions |
| gap vs stock reference | What the token is trading at relative to its stock reference, where the desk observes one |
| quote expiry | Venue quotes expire. When the time runs out, you get a fresh quote. A stale price is never filed. |
| Sign & settle | Your wallet signs. Claflin never holds keys or funds. (Shown only when the desk's live gate is on.) |
| File as paper | A simulated record at the real estimate. Kept in this browser; no money moves. |

Copy constraints: "estimate", not "a real price". "Paper record", not "file paper". Use the terms in `SLIP_ACTIONS` and `MODE_HINTS`; do not add new wording for the same facts.

#### §4.5 The board

One dense, scannable table; it replaces seven repeated cards.

`NAME · TOKEN · ISSUER · RAIL · VENUE · TOKEN MARK · STOCK REF · GAP · LINE`

- Shared facts (quote asset USDC, "paper estimate") move to the table caption, not repeated per row.
- Rows expand to show the contract or mint (explorer link), what the token legally is (one sentence per product family), who is eligible, and the source and freshness of each number. That is where "verified" earns its name.
- **Gap honesty:** Jesse has `stockReference.differenceBps` today. Hetty's Chainlink marks do not carry a stock reference, so her gap cell reads `—` with "no stock reference on this rail yet". Never compute a gap from mismatched sources (`lib/desk/board.ts`).
- **The gap explains itself.** A gap reading on the live tape is its own **button beside** the mark — a sibling, never a child of the mark's button. Two controls in one button is invalid HTML, and the mark's `aria-label` would swallow the gap's own label, so a screen-reader visitor would never hear what the gap means. Opening it stands a house paper panel: what the gap is (the venue mark against the desk's stock reference, in basis points) and what it is not — not an estimate to trade on, not a prediction, not a signal to act. Readings are indicative; refresh the tape for fresh ones. The panel opens with focus on its close control; closes on Escape, backdrop, and close button.
- The gap trigger fires `gap_explainer_opened` at most once per visit, attributed to the desk that published the mark (BASE → Hetty, SOL → Jesse, RH → Tennie), so the funnel counts gap comprehension per desk without double-counting.
- Every number carries its source and time (`as of 11:21:04 ET`) or `STALE` / `unavailable`, exactly as the wire does today.
- The scrolling wire moves to a thin tape strip at the foot of the turret and keeps its `aria-hidden` duplicate copy.

#### §4.6 After-hours pulse (optional; real counters only)

"Since the 4:00 PM bell: N calls · N paper records · last slip 2 min ago" ships **only** when those counters come from a real, server-side, per-event source with a documented retention. Until then the section does not exist. No placeholder, estimate or seed number.

#### §4.7 Meet the desks (character after comprehension)

Hetty, Jesse and Tennie get one card each in the brokers grid: AI broker; covers X on Y; how they look at the tape (Hetty: downside first; Jesse: price action and timing; Tennie: reading the rails — fundamental and sector analysis); a fact-checked, attributed line where one exists (Tennie has none — no verified quotes, so no attribution is invented); a short **real** voice sample, or none. This is the only place history leads.

**Halley stands apart.** He is the launch desk — the room that makes the instrument, not a fourth line on the same book — so he leaves the grid for his own plate beneath it: **ink-dipped, not paper** (the tape desks are printed cards; this is the plate they print from), right-aligned against the left-aligned grid, `THE LAUNCH DESK` kicker, and "Bring Halley a launch" where the broker cards say "Visit". The first reach for the plate does not open the door — it stands a paper explainer to the plate's left (what the room makes, what the token is not, and the way back to the tape desks), with "Enter the launch desk" inside. Entry marks the gate seen (`claflin.launchdesk.v1.seen`); return callers get the door directly, and a quiet "What is this desk?" can always reopen the panel. A caller skimming for who to trade with should never mistake origination for another tape line (desk `kind: 'launch'` in `lib/house.ts` drives the split everywhere). Desk detail: [docs/DESKS.md](DESKS.md).

#### §4.8 Straight answers

Written in the house voice as "Questions callers ask": Is this a real share? Can I use this from the US? What does it cost? What if the token drifts from the stock? Can the desk trade without me? ("No. No signature, no trade.") Where does my record live? Answers link to the owning docs and the eligibility copy per product family.

#### §4.9 Footer

"Every slip on the record." (retires "The house keeps the record" — in trading, "the house" is the side that always wins). Legal and risk links, who built this, and "Not yet seated — Jay (Arbitrum)". The copy is generated from the planned-desks list, so it stays correct as desks open.

### §5. Design language (foyer-specific additions)

Material and type follow Product Direction → Art direction (deep green/ink, brass, ivory paper; Fraunces / IBM Plex Sans / JetBrains Mono). The foyer adds:

- **Turret lamps** are the only glowing elements above the fold. Glow carries state (open line / match / planned), dual-coded with text.
- **Sound:** off by default, one visible toggle. Three sounds only: line pickup, an opt-in floor murmur while NYSE is open, and the stamp. No sound during speech.
- **Motion:** slow and physical. Slips slide, stamps land, lamps warm. Nothing floats. Reduced motion shows the end states.
- **The journey layer:** the foyer is walked, not stacked. On desktop with motion allowed, the hero **pins** — the house holds its frame while the tape, the book, and the desks slide past, and the hero's copy lifts and fades (`--hero-exit`) until it steps out of the reading order entirely (`data-away`). Descending rides the scene camera along a curve through the room's poses (desk → evidence → review → ledger); the room stages each stop — the lamp's light follows the walk from blotter to evidence board to the open book, the house warms the deeper you go, a slip lands on the desk once you're inside and files itself beside the ledger at the end. Scroll glides with inertia and settles at room boundaries (proximity snap only — it never claims a gesture mid-room); the room under the reading plane gets a pool of warm lamplight while the rest stay untouched; a brass **register** rides the right edge — one labelled stop per room, the current one lit, each a jump anchor; and the broker cards are dealt, not rendered — each settles onto the table in turn and warms under the lamp as it passes the reading plane. The wire reads the room's pace too: scroll velocity feeds the tape's drift and skew, and a scroll up can pull it backwards a touch. Because the pinned hero's talk bar never leaves the viewport, the line docks as a pill at the foot of the page once the hero yields (the same handset phones already use). Every piece degrades the same way: reduced motion and the lightweight graphics path show composed end states — no pinning, instant poses, no glow, native scroll, a still tape — and the register stays, since it's a marker, not motion.
- **Mobile:** the phone *is* the handset. A full-width hold-to-talk bar sits in thumb reach; the slip rises from the bottom like a receipt. Type stays one tap away.
- **Page furniture:** ledger ground, quotation column, house sheet, marginalia, colophon and posted notice are specced as-built in the artefact notes — responsive (ghost ground and quote column are desktop-only), real data or plainly ornamental.

### §6. Non-negotiables carried from Product Direction

- Voice cannot sign, submit or reconcile. A spoken "yes" never settles live.
- A rail or offering is never chosen silently; similar exposures stay separate.
- Every price shows its source and freshness; examples and fixtures are labelled and never styled as live.
- No microphone, account or wallet is required to see or use the foyer. Paper/live is stated once in the foyer (`FOYER_BOUNDARY`) and once at the consequential action.
- No counters, stats or activity that are not backed by real events.

### §7. Build sequence

| Phase | Scope | Touches | Gate |
|---|---|---|---|
| **0: Copy truth** | Market-aware kicker + countdown; plain subhead (`FOYER_LEDE`); "AI broker" on lines; gap label "vs stock ref"; step-02 "estimate" wording; footer "Every slip on the record." + "Not yet seated" | `lib/market-clock.ts`, `lib/desk/ui-copy.ts`, `HouseFoyer.tsx`, `tests/house-foyer.test.ts`, market-clock tests | Unit + typecheck |
| **1: The turret** | Push-to-talk house line over existing dictation; line lamps lit by offering match; named choice when several match; mic-denied fallback | `HouseFoyer.tsx` (extract `HouseTurret.tsx`), `useDictation` reuse, CSS module | Keyboard/touch/reduced-motion QA; mic-denied path; no mic on load |
| **2: The board** | Table + expandable rows; per-number provenance; honest gap column | `HouseOfferings.tsx` → board, offering metadata | Offering tests; no gap from mismatched sources |
| **3: The slip, annotated + example call** | Annotated slip; labelled example call from an accepted real recording | New foyer section; reuse `WrittenSlip` | Recording accepted and labelled; captions |
| **4: Desks, answers, footer, mobile handset** | §4.7–4.9, §5 mobile | Foyer + CSS | Mobile viewport QA |
| **5: Pulse + metrics** | §4.6 only with real counters; §8 instrumentation | `lib/funnel/*`, `POST /api/funnel`, `scripts/funnel-report.mts` | Documented retention (90-day TTL) |

**Timing:** Stocklana submitted 2026-09-25 16:00 ET; Phases 0–2 shipped for judging. The board's product facts (§4.5) come from the issuers' own documents — Coinbase via the Base guide (reviewed 2026-09-05) and Backed via docs.xstocks.fi's product legal overview (fetched 2026-09-24). Re-check both before any later release.

### §8. How we know it works

Establish baselines first; do not invent targets. Event source, fields and retention: [Funnel metrics](#funnel-metrics) below. The measures:

- Time to first instruction (spoken or typed) on a first visit
- Share of instructions spoken versus typed, and the mic-denied rate
- Instruction → matching offering resolved → desk entered → estimate → paper record, and the share of first sessions that file a paper record
- **After-hours share of instructions.** This tests the core bet: if it is low, the "book doesn't close" argument isn't landing.
- Comprehension check (beta interviews): can the visitor say what the token is, which rail, whether money moved, and where the record lives?

Paid minutes, raw call counts and trading frequency are not success measures.

### §9. Open decisions

- The source for a Base stock reference (so Hetty's gap cell can be filled honestly).
- Which recorded call becomes the example, and who accepts it.

---

## Funnel metrics {#funnel-metrics}

The event source for the foyer's §8 measures. Baselines first; no targets are set here.

### What is sent

`lib/funnel/client.ts` batches events and posts one beacon to `POST /api/funnel` (5 s after the first event, or on page hide). Write-only: there is no HTTP read endpoint — reading happens with the report script, below. Every field is an enum or a boolean (`lib/funnel/events.ts`):

| Event | Fields | Emitted from |
|---|---|---|
| `visit_started` | landing: foyer/desk | `useTradingDesk` entry resolution, once per tab |
| `instruction_given` | source: spoken/typed/picked · matched: none/one/several · lead (first only) | `HouseFoyer` — transcript, 1.5 s typing pause, wire pick, or desk entry |
| `mic_blocked` | reason: denied/no_device/unsupported/interrupted/other | `useDictation` via the turret |
| `desk_entered` | desk · via: foyer/link/returning/switch · carried | `useTradingDesk` |
| `estimate_returned` | desk · outcome: quoted/unavailable | `useDeskDocuments.requestQuote`, Jesse quote port + `run()` |
| `record_filed` | desk | Hetty `save`, Jesse `file-paper` |
| `record_retrieved` | desk · via: ledger/last_filing/foyer/link | ledger buttons, last-filing lines, `?record=` entry |
| `example_call_played` | — | `AnnotatedExampleCall` Play (accepted recording only) |
| `offering_dossier_opened` | — | `HouseOfferings` board row expand |
| `gap_explainer_opened` | desk | `HouseFoyer` wire-gap disclosure (live tape) |

The last three are comprehension aids, not journey steps: they are counted and reported separately from the funnel stages, so they never distort the step counts. `gap_explainer_opened` fires at most once per visit, attributed to the desk that published the mark.

**Never sent:** instruction text, amounts, instruments, record/quote ids, account ids, wallets. The envelope carries a random per-tab `visit` id (sessionStorage, gone when the tab closes) and `newcomer` (true when the browser holds no `claflin.` storage; the client then writes `claflin.seen.v1 = 1`). `hours` (NYSE open/closed) is stamped server-side from `lib/market-clock.ts`.

**Not counted at all:** Global Privacy Control, Do Not Track, or `navigator.webdriver` (Playwright, crawlers). The caller's IP is used only for the in-memory abuse budget and is never stored.

### Storage and retention

| Key | Type | TTL | Content |
|---|---|---|---|
| `funnel:counts:{YYYY-MM-DD}` | Hash | 90 days | `event\|dim=value…` → count |
| `funnel:reach:{YYYY-MM-DD}:{step}:{new\|returning}` | HyperLogLog | 90 days | Approximate unique visits reaching a step; ids cannot be read back |

Both expiring after `RETENTION_DAYS` = 90 (`lib/funnel/store.ts`). Days are UTC. Steps: visited → instructed → matched → entered → quoted → filed → retrieved. No Redis → the route answers 204 and nothing is kept.

### Reading it

```
pnpm exec tsx --env-file=.env.local scripts/funnel-report.mts --days=7 [--json]
```

Caveats: `link` entries include reloads of a desk URL; the mic denied rate is `denied / (spoken instructions + mic failures)`; React StrictMode double-fires entry effects in `next dev` only.

### Baseline — 2026-10-21 (Phase 0.5)First run, `--days=7`: first-time browsers `visited 1 · instructed 0 · matched 0 · entered 1 · quoted 0 · filed 0 · retrieved 0`; returning browsers all zero; instructions 0 · landings desk 1 · desk entries `jesse:link 2`; comprehension aids all zero.

**One visit is not a baseline.** The whole retention window (90 days) holds a single day of data — 2026-10-03, one `visit_started` (landing `desk`) and two `desk_entered` (desk `jesse`, via `link`). The 7-day window is empty, so the figures above and the 90-day figures are the same single visit. The reason is traffic, not instrumentation: the funnel client is present in the deployed `app/page` chunk and the ingest route answers, so a browser visit writes a `funnel:counts` hash.

Because Phase 1's exit gate is a +20% conversion comparison, that comparison cannot be drawn yet. Treat the numbers above as a **floor of one**, not a measurement to improve on. Re-run the report after a week of real traffic and replace this section before making any further funnel-impacting change.

`gap_explainer_opened` has never fired in the wild: the feature shipped on 2026-10-21, after the last recorded visit.

### Instrument depth — the Aerodrome pool probe

Utility is capped at 7 quotable instruments (`tests/pool-unlock.test.ts` pins the count). To see what unlocking the 9 blocked Base names would take, run the read-only probe — `eth_call`s only; it never signs, sends, or edits the catalog:

```
pnpm exec tsx scripts/probe-aerodrome-pools.mts [--symbol=AMZNc] [--json]
BASE_RPC_URL=https://your-node pnpm exec tsx scripts/probe-aerodrome-pools.mts --json
```

Each instrument gets one of four verdicts (`lib/trading/pool-unlock.ts`):

- **UNLOCKABLE (data only)** — decimals resolve and a USDC pool routes through the desk quoter. The script prints a paste-ready `VenuePair`; a human still fills TVL, re-checks the issuer list, and sets `availability: 'quote_candidate'`.
- **POOL FOUND, NOT ROUTABLE / NO USDC POOL** — liquidity exists but needs an adapter (another factory/venue, or liquidity on Uniswap or a v2 pool) — not a catalog edit.
- **BLOCKED** — `decimals()` unreadable; verify the contract against the issuer list first.

Type-check the scripts with `pnpm exec tsc -p tsconfig.scripts.json` (the app `typecheck` covers `.ts`, not `.mts`).
