# Desk Canon

**Status:** Source of truth for desk product identity (name, role, market, kind). Established 2026-10 as part of the wedge→vision plan.

This document is the canonical reference for the desks in the Claflin house. It is the single source of product identity copy. Implementation reads from [`lib/desktop.canon.ts`](../lib/desktop.canon.ts).

## Identity order (who owns what)

The durable identity order, from `PRODUCT_DIRECTION.md` §"Identity", is:

```
Claflin → selected offering, mandate and rail → active desk and broker → current instruction
```

The desk is layer 3. Its identity is the broker (the relationship), not the rail (the settlement network).

## Naming rules

- **Desk = broker.** Hetty, Jesse, Tennie, Halley, Jay are brokers. They are not "the Solana desk" or "the Base desk". The market (Base / Solana / Robinhood Chain / Arbitrum) is a property of the desk, not its identity.
- **Venue ≠ desk.** When a desk settles on a specific venue family (Jupiter, Aerodrome, Lighter, Meteora DBC), the venue is a property, not the identity. **Halley is not "the Meteora desk"** — he is the launch desk whose venue on Solana is Meteora DBC.
- **Role distinguishes tape from launch.** Tape desks (Hetty, Jesse, Tennie) price, size, and file instruments that already trade. Launch desks (Halley) create the instrument. The distinction is structural: `kind: 'tape' | 'launch'` in `lib/desktop.canon.ts` drives the foyer split, the turret routing, and the board grouping.

## The desks

### Hetty Green — Base tape desk

- **Market:** Base · **Venue:** Aerodrome
- **Role:** Quotes and files Coinbase tokenized stocks via Aerodrome.
- **Approach:** Independent judgment. Capital preservation. Deliberate decisions.
- **Capability:** Name a buy — or ask her. Get a Base estimate. File the record.
- **Status:** Paper desk open; live execution is env-gated behind `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED`.

### Jesse Livermore — Solana tape desk

- **Market:** Solana · **Venue:** Jupiter
- **Role:** Quotes and files Backed xStocks via Jupiter.
- **Approach:** Price action, timing, and disciplined speculation.
- **Capability:** Call a buy — or say it. Get a Jupiter estimate. Paper or settle live.
- **Status:** Paper desk open; live settlement env-gated behind `NEXT_PUBLIC_JESSE_LIVE_ENABLED + JESSE_LIVE_ENABLED`.

### Tennie Claflin — Robinhood Chain tape desk

- **Market:** Robinhood Chain · **Venue:** Lighter
- **Role:** Quotes and files Robinhood Stock Tokens via Lighter.
- **Approach:** Access first — the accounts the Street refused, read tape by tape.
- **Capability:** Ask for a stock token, sized in USDG. Get a Lighter estimate — issuer, onchain, and venue marks side by side. File the record.
- **Status:** Paper desk open by design. No live flag exists.

### Edmond Halley — Solana launch desk

- **Market:** Solana · **Venue:** Meteora DBC
- **Role:** Drafts and files paper launches for new tracker tokens via Meteora DBC.
- **Approach:** Prices what has never traded — anchors a new name to a known one, then lets the tape decide.
- **Capability:** Say a launch. See the curve, the anchor mark, and the graduation line. File a paper launch.
- **Status:** Paper desk open by design. Live launch designed but unimplemented, behind dual env flags.

Halley stands apart from the tape desks. In the foyer, he is rendered on his own launch plate beneath the brokers grid, with a separate launch-line block in the turret and launch verbs (`launch`, `mint`, `issue`, `tracker token`) routed to his line. A caller skimming for who to *trade* with should never confuse origination with execution.

### Jay Cooke — Arbitrum tape desk

- **Market:** Arbitrum · **Venue:** —
- **Role:** Planned, not yet open.
- **Approach:** Building the rails that let everyone else move money.
- **Status:** Planned. Visiting Jay is a closed room — no quote, no paper file, no transplanted approval.

## Surface consistency — progressive disclosure (all desks)

**Status:** Ratified 2026-10-12 after the Halley verbosity review. Halley was the outlier; Jesse/Hetty/Tennie are the reference.

Every desk follows the same five rules so a caller learns the house once:

1. **One thing per screen.** Draft work is a stepped accordion driven by the desk's own step function (`launchStep` on Halley; stage/foreground on tape desks). Only the current step is open; completed steps collapse to a one-line summary chip. Stage headings (`Name the tracker / Anchor the opening / Set the economics`) stay verbatim — they move *inside* the step `<details><summary>`, never removed.
2. **Voice-first blank.** A blank slip shows a ghost sentence + 3 try-saying chips (`RING_EXAMPLES.<desk>`) + one quiet `Fill by hand` path — never the full form. Reference: Jesse `blankSlip` ghost (`Buy 100 USDC of AAPLx` + caret) and `BlotterHearables`; Hetty identical.
3. **Hints on demand.** Field help lives in `aria-describedby` targets as today (ids stable for tests/AT), but visually behind an info disclosure or `title` tooltip, revealed on focus/error — not as always-visible paragraphs. Live status (anchor posture, curve hint) renders as a one-line pill (`GapStrip` pattern: `● Pyth live NVDA $xxx` / `● Onchain $xxx · gap xx bps`), full text on tap.
4. **Gate the ceremony behind review.** The wallet/live ceremony mounts only when there is reviewed, unexpired intent to sign (`reviewIntent !== null`). Draft shows a single link (`Set up wallet first →` to `#halley-live`), not the readiness checklist. Reference: Jesse `JesseLiveSettle` inside review behind a checkbox; Halley condition stays `liveIntent && liveWasEnabled && !viewed` *plus* a review guard.
5. **One legal stamp.** `TRACKER TOKENS ARE NOT STOCK OWNERSHIP` (footer) + `Paper only: no token is minted` (mode stamp) are the only always-visible compliance lines. All other `tracker ≠ stock / venue never issuer` repetitions collapse into the existing `<details>What a launch is, and what it is not</details>` and the sign-time eligibility checkbox.

Shared primitives (use these, don't invent new ones): `ModeStamp` ⓘ disclosure, `<details class="assumptionsFold|productDetails|evidenceDrawer">`, `blankSlip` ghost + `slipCaret`, `quietEvidence`, `GapStrip` pill, hearable chips that fill the draft (Jesse blotter pattern).

Interaction details (delight pass): hearables apply real draft values with a one-line confirmation — never a dead click (`BlotterHearables` everywhere, including Tennie's typed starters). `RingExample` is tappable on every line (applies the line when a handler exists, otherwise lifts the line). `LastFilingLine` welcomes returners on all four desks. The slip reads itself back as a one-line summary (`.slipLine`) and `Still needed` items are jump links. Review actions are sticky house-wide (`.ticket[data-ticket-view="review"] .slipActions` + `.stickyCta`). Status pills breathe when live and dim when quiet; arriving on review scrolls + focuses its heading, and every filing lands the house stamp thud. Cross-desk nudges are one quiet `.crossDesk` line at the moment of relevance (thin name → Halley; filed launch → Jesse; venue/onchain gap → Solana) — never banners.

## Authoritative pointers

| Document | Authority |
|---|---|
| [`docs/PRODUCT_DIRECTION.md`](PRODUCT_DIRECTION.md) | Jobs, principles, information hierarchy. Wins conflicts. |
| [`docs/ROADMAP.md`](../ROADMAP.md) | Sequencing and release gates. |
| [`docs/ELIGIBILITY.md`](ELIGIBILITY.md) | Per-product eligibility policy. |
| [`docs/METEORA_LAUNCH_DESK.md`](METEORA_LAUNCH_DESK.md) | Halley's Meteora design (the venue work, not the desk identity). |
| [`docs/JESSE_DESK.md`](JESSE_DESK.md) | Jesse's Solana capability (the venue work, not the desk identity). |
| [`lib/desktop.canon.ts`](../lib/desktop.canon.ts) | The product copy source. |
| [`lib/house.ts`](../lib/house.ts) | `HOUSE_DESKS` and `DESK_CAPABILITIES` for the routing layer.

## What this doc is NOT

- It is not a brochure. It does not carry marketing copy or the deck slips hook.
- It is not a release document. Status fields mirror the routing truth; live capability lives in `lib/house.ts`.
- It does not describe the launch-desk (`kind: 'launch'`) metaphor in narrative — see `PRODUCT_DIRECTION.md` §"The specialist brokerage house" for the long form.