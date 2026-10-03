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

- **Desk = broker.** Hetty, Jesse, Isabel, Halley, Jay are brokers. They are not "the Solana desk" or "the Base desk". The market (Base / Solana / Robinhood Chain / Arbitrum) is a property of the desk, not its identity.
- **Venue ≠ desk.** When a desk settles on a specific venue family (Jupiter, Aerodrome, Lighter, Meteora DBC), the venue is a property, not the identity. **Halley is not "the Meteora desk"** — he is the launch desk whose venue on Solana is Meteora DBC.
- **Role distinguishes tape from launch.** Tape desks (Hetty, Jesse, Isabel) price, size, and file instruments that already trade. Launch desks (Halley) create the instrument. The distinction is structural: `kind: 'tape' | 'launch'` in `lib/desktop.canon.ts` drives the foyer split, the turret routing, and the board grouping.

## The desks

### Hetty Green — Base tape desk

- **Market:** Base · **Venue:** Aerodrome
- **Role:** Quotes and files Coinbase tokenized stocks via Aerodrome.
- **Approach:** Independent judgment. Capital preservation. Deliberate decisions.
- **Capability:** Talk or type a buy. Get a Base estimate. File a paper record.
- **Status:** Paper desk open; live execution is env-gated behind `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED`.

### Jesse Livermore — Solana tape desk

- **Market:** Solana · **Venue:** Jupiter
- **Role:** Quotes and files Backed xStocks via Jupiter.
- **Approach:** Price action, timing, and disciplined speculation.
- **Capability:** Talk or type a buy. Get a Jupiter estimate. Paper or settle live.
- **Status:** Paper desk open; live settlement env-gated behind `NEXT_PUBLIC_JESSE_LIVE_ENABLED + JESSE_LIVE_ENABLED`.

### Isabel Benham — Robinhood Chain tape desk

- **Market:** Robinhood Chain · **Venue:** Lighter
- **Role:** Quotes and files Robinhood Stock Tokens via Lighter.
- **Approach:** Fundamental analysis and patient investigation.
- **Capability:** Pick a stock token, size it in USDG. Get a Lighter estimate with issuer, onchain, and venue marks side by side. File a paper record.
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